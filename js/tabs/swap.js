import { DEADLINE_MINUTES } from '../../config.js';
import { ME_CONTRACT_ADDRESS } from '../../address.js';

export function setupSwapLogic({ contract, readOnlyContract, userAddress, updateBalances }) {
  const payInput = document.getElementById('pay-amount');
  const receiveInput = document.getElementById('receive-amount');
  const modeSelect = document.getElementById('swap-mode');
  const swapBtn = document.getElementById('swap-btn');

  if (!payInput || !swapBtn) return;

  payInput.addEventListener('input', async () => {
    if (!payInput.value || parseFloat(payInput.value) <= 0) {
      receiveInput.value = '';
      return;
    }
    try {
      const mode = modeSelect.value;
      const val = ethers.parseEther(payInput.value);
      const activeContract = contract || readOnlyContract;
      
      if (mode === 'buy') {
        const out = await activeContract.quoteBuy(val);
        receiveInput.value = parseFloat(ethers.formatEther(out)).toFixed(4);
      } else {
        const out = await activeContract.quoteSell(val);
        receiveInput.value = parseFloat(ethers.formatEther(out)).toFixed(4);
      }
    } catch (err) {
      receiveInput.value = "0.0";
    }
  });

  swapBtn.addEventListener('click', async () => {
    if (!contract) return alert("Vui lòng kết nối ví trước!");
    if (!payInput.value || parseFloat(payInput.value) <= 0) return alert("Vui lòng nhập số lượng!");

    try {
      swapBtn.innerText = "Đang xử lý...";
      swapBtn.disabled = true;

      const mode = modeSelect.value;
      const amount = payInput.value;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + (DEADLINE_MINUTES * 60));

      if (mode === 'buy') {
        const monIn = ethers.parseEther(amount);
        const tx = await contract.buyME(0n, deadline, { value: monIn, gasLimit: 300000n });
        await tx.wait();
      } else {
        const meIn = ethers.parseEther(amount);
        const allowance = await contract.allowance(userAddress, ME_CONTRACT_ADDRESS);
        if (allowance < meIn) {
          const approveTx = await contract.approve(ME_CONTRACT_ADDRESS, ethers.MaxUint256, { gasLimit: 100000n });
          await approveTx.wait();
        }
        const tx = await contract.sellME(meIn, 0n, deadline, { gasLimit: 300000n });
        await tx.wait();
      }
      alert("Giao dịch thành công!");
      if (updateBalances) updateBalances();
    } catch (err) {
      alert("Giao dịch thất bại: " + (err.reason || err.message));
    } finally {
      swapBtn.innerText = "Xác Nhận Giao Dịch";
      swapBtn.disabled = false;
    }
  });
}
