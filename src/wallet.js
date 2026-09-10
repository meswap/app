import { createEVMClient } from '@metamask/connect-evm'
import { MONAD, RPC_URL } from './config.js'

let clientPromise

function createClient() {
  if (!clientPromise) {
    clientPromise = createEVMClient({
      dapp: {
        name: 'ME Exchange',
        url: window.location.origin + window.location.pathname,
      },
      api: {
        supportedNetworks: {
          [MONAD.chainIdHex]: RPC_URL,
        },
      },
      analytics: { enabled: false },
    })
  }
  return clientPromise
}

export async function connectMetaMask() {
  // Native extension / MetaMask in-app browser: use the injected provider directly.
  // Mobile Chrome/Safari and desktop browsers without the extension: MetaMask Connect
  // opens the MetaMask app (or QR flow) and returns the same EIP-1193 provider shape.
  if (window.ethereum?.isMetaMask) {
    await window.ethereum.request({ method: 'eth_requestAccounts', params: [] })
    return window.ethereum
  }

  const client = await createClient()
  await client.connect({ chainIds: [MONAD.chainIdHex] })
  return client.getProvider()
}

export async function restoreMetaMaskProvider() {
  if (window.ethereum?.isMetaMask) return window.ethereum
  try {
    const client = await createClient()
    return client.getProvider()
  } catch {
    return null
  }
}
