import { DEADLINE_MINUTES } from '../../config.js';
import { ME_CONTRACT_ADDRESS } from '../../address.js';

export function setupSwapLogic({ contract, readOnlyContract, provider, readOnlyProvider, userAddress, updateBalances }) {
  const payInput = document.getElementById('pay-amount');
  const receiveInput = document.getElementById('receive-amount');
  const modeSelect = document.getElementById('swap-mode');
  const swapBtn = document.getElementById('swap-btn');
  const flipBtn = document.getElementById('swap-flip-btn');
  const statusBox = document.getElementById('swap-status');
  const rateLine = document.getElementById('swap-rate-line');
  const rateValue = document.getElementById('swap-rate-value');

  const payTokenBadge = document.getElementById('pay-token-badge');
  const payTokenSymbol = document.getElementById('pay-token-symbol');
  const receiveTokenBadge = document.getElementById('receive-token-badge');
  const receiveTokenSymbol = document.getElementById('receive-token-symbol');

  const payBalanceEl = document.getElementById('pay-balance');
  const receiveBalanceEl = document.getElementById('receive-balance');
  const maxBtn = document.getElementById('pay-max-btn');

  if (!payInput || !swapBtn) return;

  let monBalance = 0n;
  let meBalance = 0n;

  const TOKENS = {
    mon: { badge: 'M', symbol: 'MON', cls: 'is-mon' },
    me: { badge: 'ME', symbol: 'ME', cls: 'is-me' }
  };

  function applyTokenVisuals() {
    const buying = modeSelect.value === 'buy';
    const payToken = buying ? TOKENS.mon : TOKENS.me;
    const receiveToken = buying ? TOKENS.me : TOKENS.mon;

    payTokenBadge.textContent = payToken.badge;
    payTokenBadge.className = 'swap-token-badge ' + payToken.cls;
    payTokenSymbol.textContent = payToken.symbol;

    receiveTokenBadge.textContent = receiveToken.badge;
    receiveTokenBadge.className = 'swap-token-badge ' + receiveToken.cls;
    receiveTokenSymbol.textContent = receiveToken.symbol;

    if (flipBtn) flipBtn.classList.toggle('is-flipped', !buying);
    renderBalances();
  }

  function renderBalances() {
    if (!payBalanceEl || !receiveBalanceEl) return;
    const buying = modeSelect.value === 'buy';
    const monText = `Số dư: ${parseFloat(ethers.formatEther(monBalance)).toFixed(6)} MON`;
    const meText = `Số dư: ${parseFloat(ethers.formatEther(meBalance)).toFixed(6)} ME`;
    payBalanceEl.textContent = buying ? monText : meText;
    receiveBalanceEl.textContent = buying ? meText : monText;
  }

  async function refreshBalances() {
    if (!userAddress) {
      monBalance = 0n;
      meBalance = 0n;
      renderBalances();
      return;
    }
    try {
      const activeContract = contract || readOnlyContract;
      const activeProvider = provider || readOnlyProvider;

      const monBal = await activeProvider.getBalance(userAddress);
      const meBal = await activeContract.balanceOf(userAddress);

      monBalance = monBal;
      meBalance = meBal;
      renderBalances();
    } catch (err) {
      console.error('Lỗi số dư:', err);
      renderBalances();
    }
  }

  function setStatus(message, kind) {
    if (!statusBox) return;
    if (!message) {
      statusBox.className = 'swap-status';
      statusBox.textContent = '';
      return;
    }
    statusBox.className = 'swap-status is-visible is-' + kind;
    statusBox.textContent = message;
  }

  function updateRateLine(payVal, receiveVal) {
    if (!rateLine || !rateValue) return;
    const pay = parseFloat(payVal);
    const receive = parseFloat(receiveVal);
    if (!pay || !receive || pay <= 0 || receive <= 0) {
      rateLine.style.display = 'none';
      return;
    }
    const buying = modeSelect.value === 'buy';
    const payToken = buying ? 'MON' : 'ME';
    const receiveToken = buying ? 'ME' : 'MON';
    const rate = (receive / pay).toFixed(6);
    rateValue.textContent = `1 ${payToken} \u2248 ${rate} ${receiveToken}`;
    rateLine.style.display = 'flex';
  }

  applyTokenVisuals();
  refreshBalances();

  async function recalculate() {
    if (!payInput.value || parseFloat(payInput.value) <= 0) {
      receiveInput.value = '';
      updateRateLine(0, 0);
      return;
    }
    try {
      const mode = modeSelect.value;
      const val = ethers.parseEther(payInput.value);
      const activeContract = contract || readOnlyContract;

      const out = mode === 'buy'
        ? await activeContract.quoteBuy(val)
        : await activeContract.quoteSell(val);

      const formatted = parseFloat(ethers.formatEther(out)).toFixed(6);
      receiveInput.value = formatted;
      updateRateLine(payInput.value, formatted);
    } catch (err) {
      receiveInput.value = '0.0';
      updateRateLine(0, 0);
    }
  }

  payInput.addEventListener('input', recalculate);

  if (flipBtn) {
    const toggleMode = () => {
      modeSelect.value = modeSelect.value === 'buy' ? 'sell' : 'buy';
      applyTokenVisuals();
      payInput.value = '';
      receiveInput.value = '';
      updateRateLine(0, 0);
      setStatus('', null);
      payInput.focus();
    };
    flipBtn.addEventListener('click', toggleMode);
    flipBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleMode();
      }
    });
  }

  if (maxBtn) {
    maxBtn.addEventListener('click', () => {
      const buying = modeSelect.value === 'buy';
      const balance = buying ? monBalance : meBalance;
      if (balance <= 0n) return;

      let usable = balance;
      if (buying) {
        const gasBuffer = ethers.parseEther('0.01');
        usable = balance > gasBuffer ? balance - gasBuffer : 0n;
      }
      if (usable <= 0n) return;

      payInput.value = ethers.formatEther(usable);
      recalculate();
    });
  }

  swapBtn.addEventListener('click', async () => {
    setStatus('', null);

    if (!contract) return setStatus('Vui lòng kết nối ví trước.', 'error');
    if (!payInput.value || parseFloat(payInput.value) <= 0) {
      return setStatus('Vui lòng nhập số lượng.', 'error');
    }

    const originalLabel = swapBtn.textContent;

    try {
      swapBtn.textContent = 'Đang xử lý...';
      swapBtn.disabled = true;

      const mode = modeSelect.value;
      const amount = payInput.value;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + (DEADLINE_MINUTES * 60));

      if (mode === 'buy') {
        setStatus('Đang xác nhận giao dịch mua ME...', 'pending');
        const monIn = ethers.parseEther(amount);
        const tx = await contract.buyME(0n, deadline, { value: monIn, gasLimit: 300000n });
        await tx.wait();
      } else {
        const meIn = ethers.parseEther(amount);
        const allowance = await contract.allowance(userAddress, ME_CONTRACT_ADDRESS);
        if (allowance < meIn) {
          setStatus('Đang phê duyệt (approve) token ME...', 'pending');
          const approveTx = await contract.approve(ME_CONTRACT_ADDRESS, ethers.MaxUint256, { gasLimit: 100000n });
          await approveTx.wait();
        }
        setStatus('Đang xác nhận giao dịch bán ME...', 'pending');
        const tx = await contract.sellME(meIn, 0n, deadline, { gasLimit: 300000n });
        await tx.wait();
      }

      setStatus('Giao dịch thành công!', 'success');
      payInput.value = '';
      receiveInput.value = '';
      updateRateLine(0, 0);
      refreshBalances();
      if (updateBalances) updateBalances();
    } catch (err) {
      setStatus('Giao dịch thất bại: ' + (err.reason || err.message || 'Lỗi không xác định'), 'error');
    } finally {
      swapBtn.textContent = originalLabel;
      swapBtn.disabled = false;
    }
  });
}
