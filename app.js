import { CHAIN_CONFIG } from './config.js';
import { ME_CONTRACT_ADDRESS } from './address.js';
import { ME_ABI } from './abi.js';

import { setupSwapLogic } from './js/tabs/swap.js';
import { 
  setupWalletTab, 
  checkAndSwitchNetwork, 
  renderLoggedOutState, 
  renderLoggedInState 
} from './js/tabs/wallet.js';
import { setupInfoTab } from './js/tabs/info.js';
import { setupNotificationsTab } from './js/tabs/notifications.js';

let provider, signer, contract, readOnlyContract, userAddress = null;

const readOnlyProvider = new ethers.JsonRpcProvider(CHAIN_CONFIG.rpcUrls[0]);
readOnlyContract = new ethers.Contract(ME_CONTRACT_ADDRESS, ME_ABI, readOnlyProvider);

export async function initApp() {
  setupNavigation();
  renderLoggedOutState(connectWallet);
  await loadTab('swap');

  if (window.ethereum) {
    provider = new ethers.BrowserProvider(window.ethereum);
    window.ethereum.request({ method: 'eth_accounts' }).then(async (accounts) => {
      if (accounts.length > 0) {
        await setupUserAccount(accounts[0]);
      }
    }).catch(console.error);

    window.ethereum.on('accountsChanged', async (accounts) => {
      if (accounts.length > 0) {
        await setupUserAccount(accounts[0]);
      } else {
        disconnectWallet();
      }
    });

    window.ethereum.on('chainChanged', () => window.location.reload());
  }
}

function setupNavigation() {
  const navButtons = document.querySelectorAll('nav button');
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.getAttribute('data-tab');
      if (tabName) loadTab(tabName);
    });
  });
}

async function setupUserAccount(account) {
  userAddress = account;
  signer = await provider.getSigner();
  contract = new ethers.Contract(ME_CONTRACT_ADDRESS, ME_ABI, signer);
  
  renderLoggedInState(userAddress, disconnectWallet);
  updateBalances();
}

function disconnectWallet() {
  userAddress = null;
  contract = null;
  renderLoggedOutState(connectWallet);
  updateBalances();
}

export async function connectWallet() {
  if (!window.ethereum) {
    return alert("Vui lòng mở liên kết này trong Trình duyệt của Ví!");
  }
  
  try {
    await checkAndSwitchNetwork();
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    if (accounts.length > 0) {
      provider = new ethers.BrowserProvider(window.ethereum);
      await setupUserAccount(accounts[0]);
    }
  } catch (err) {
    alert("Không thể kết nối ví: " + (err.message || err));
  }
}

export async function loadTab(tabName) {
  try {
    const res = await fetch(`./components/tab-${tabName}.html`);
    const html = await res.text();
    document.getElementById('content').innerHTML = html;
    
    const context = { contract, readOnlyContract, provider, readOnlyProvider, userAddress, updateBalances };

    if (tabName === 'swap') setupSwapLogic(context);
    if (tabName === 'info') setupInfoTab(context);
    if (tabName === 'wallet') setupWalletTab(context);
    if (tabName === 'notifications') setupNotificationsTab(context);
  } catch (err) {
    console.error("Lỗi tải tab:", err);
  }
}

async function updateBalances() {
  await setupWalletTab({ contract, readOnlyContract, provider, readOnlyProvider, userAddress });
}

window.initApp = initApp;
