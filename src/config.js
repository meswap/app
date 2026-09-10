export const ME_ADDRESS = '0x6936960d0B04e255B48f4bBD8d03fACE78Ef77Ab'

export const MONAD = {
  chainId: 143,
  chainIdHex: '0x8f',
  chainName: 'Monad Mainnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: ['https://rpc.monad.xyz'],
  blockExplorerUrls: ['https://monadscan.com'],
}

export const RPC_URL = MONAD.rpcUrls[0]
export const EXPLORER = MONAD.blockExplorerUrls[0]
export const DEFAULT_SLIPPAGE_BPS = 50n // 0.50%
export const MAX_SLIPPAGE_PERCENT = 5
export const DEADLINE_SECONDS = 3 * 60
