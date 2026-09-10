import { createEVMClient } from '@metamask/connect-evm'
import { MONAD, RPC_URL } from './config.js'

let clientPromise

export function invalidateMetaMaskClient() {
  // A wallet-side disconnect can leave the browser holding the old SDK instance.
  // Drop that in-memory instance so the next explicit connect starts from a fresh client.
  clientPromise = undefined
}

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
      eventHandlers: {
        disconnect: () => invalidateMetaMaskClient(),
      },
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

  // A user-initiated Connect must not silently reuse a stale persisted
  // MetaMask Connect session after the dapp was disconnected in the wallet.
  const result = await client.connect({
    chainIds: [MONAD.chainIdHex],
    forceRequest: true,
  })

  if (!result?.accounts?.[0]) {
    throw new Error('MetaMask did not return a connected account')
  }

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

export async function disconnectMetaMask(provider) {
  try {
    if (window.ethereum?.isMetaMask && provider === window.ethereum) {
      await provider.request({
        method: 'wallet_revokePermissions',
        params: [{ eth_accounts: {} }],
      })
    } else {
      const client = await createClient()
      await client.disconnect()
    }
  } finally {
    invalidateMetaMaskClient()
  }
}
