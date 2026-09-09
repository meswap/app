import { createWalletClient, custom } from 'viem'
import { monadMainnet } from '../config/chain'

declare global {
  interface Window {
    ethereum?: any
  }
}

export async function connectWallet() {
  if (!window.ethereum) {
    throw new Error('Không tìm thấy ví Web3')
  }

  const walletClient = createWalletClient({
    chain: monadMainnet,
    transport: custom(window.ethereum),
  })

  const [address] = await walletClient.requestAddresses()

  return {
    address,
    walletClient,
  }
}

export async function switchToMonad() {
  if (!window.ethereum) {
    throw new Error('Không tìm thấy ví Web3')
  }

  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [
        {
          chainId: '0x8f',
        },
      ],
    })
  } catch (error: any) {
    if (error.code === 4902) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: '0x8f',
            chainName: 'Monad Mainnet',
            nativeCurrency: {
              name: 'MON',
              symbol: 'MON',
              decimals: 18,
            },
            rpcUrls: [
              'https://rpc.monad.xyz',
            ],
            blockExplorerUrls: [
              'https://monadvision.com',
            ],
          },
        ],
      })
    } else {
      throw error
    }
  }
}

export async function changeAccount() {
  if (!window.ethereum) {
    throw new Error('Không tìm thấy ví Web3')
  }

  await window.ethereum.request({
    method: 'wallet_requestPermissions',
    params: [{ eth_accounts: {} }],
  })

  const walletClient = createWalletClient({
    chain: monadMainnet,
    transport: custom(window.ethereum),
  })

  const [address] = await walletClient.getAddresses()

  if (!address) {
    throw new Error('Không lấy được account từ MetaMask')
  }

  return {
    address,
    walletClient,
  }
}
