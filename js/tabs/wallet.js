import { CHAIN_CONFIG } from '../../config.js';

export async function checkAndSwitchNetwork() {
  if (!window.ethereum) return false;
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: CHAIN_CONFIG.chainId }],
    });
    return true;
  } catch (switchError) {
    if (switchError.code === 4902 || switchError.code === -32603) {
      try {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [CHAIN_CONFIG],
        });
        return true;
      } catch (addError) {
        return false;
      }
    }
    return false;
  }
}

export function renderLoggedOutState(connectCallback) {
  const walletArea = document.getElementById('wallet-area');
  if (walletArea) {
    walletArea.innerHTML = `<button class="btn" id="wallet-btn">Kết Nối Ví</button>`;
    const btn = document.getElementById('wallet-btn');
    if (btn) btn.addEventListener('click', connectCallback);
  }
}

export function renderLoggedInState(userAddress, disconnectCallback) {
  const walletArea = document.getElementById('wallet-area');
  if (walletArea) {
    const avatarUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${userAddress}`;
    walletArea.innerHTML = `
      <div class="wallet-container">
        <div class="balance-badge"><span id="header-mon-bal">0.00</span> MON</div>
        <img src="${avatarUrl}" class="wallet-avatar" alt="Avatar" />
        <button class="btn-icon-disconnect" id="disconnect-btn" title="Ngắt kết nối">
          <svg viewBox="0 0 24 24">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
        </button>
      </div>
    `;
    document.getElementById('disconnect-btn').addEventListener('click', disconnectCallback);
  }
}

export async function setupWalletTab({ contract, readOnlyContract, provider, readOnlyProvider, userAddress }) {
  if (!userAddress) {
    const monEl = document.getElementById('user-mon');
    const meEl = document.getElementById('user-me');
    if (monEl) monEl.innerText = '0.00';
    if (meEl) meEl.innerText = '0.00';
    return;
  }

  try {
    const activeContract = contract || readOnlyContract;
    const activeProvider = provider || readOnlyProvider;

    const monBal = await activeProvider.getBalance(userAddress);
    const meBal = await activeContract.balanceOf(userAddress);
    
    const formattedMon = parseFloat(ethers.formatEther(monBal)).toFixed(4);
    const formattedMe = parseFloat(ethers.formatEther(meBal)).toFixed(2);

    const headerMonEl = document.getElementById('header-mon-bal');
    const monEl = document.getElementById('user-mon');
    const meEl = document.getElementById('user-me');

    if (headerMonEl) headerMonEl.innerText = formattedMon;
    if (monEl) monEl.innerText = formattedMon;
    if (meEl) meEl.innerText = formattedMe;
  } catch (err) {
    console.error("Lỗi số dư:", err);
  }
}
