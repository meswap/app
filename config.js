export const CHAIN_CONFIG = {
  chainId: '0x279', // Hoặc ChainID HEX tương ứng của Monad Mainnet
  chainName: 'Monad Mainnet',
  nativeCurrency: {
    name: 'MON',
    symbol: 'MON',
    decimals: 18
  },
  rpcUrls: ['https://rpc.monad.xyz'], // RPC Mainnet chính thức
  blockExplorerUrls: ['https://explorer.monad.xyz']
};

export const SLIPPAGE_PERCENTAGE = 0.5;
export const DEADLINE_MINUTES = 20;

// THAY SỐ BLOCK BẠN ĐÃ DEPLOY HỢP ĐỒNG VÀO ĐÂY (Ví dụ: 1000000)
export const DEPLOYMENT_BLOCK = 0; 
