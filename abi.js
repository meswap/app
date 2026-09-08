export const ME_ABI = [
  "event Buy(address indexed buyer, uint256 monIn, uint256 meOut, uint256 reserveAfter, uint256 remainingMEAfter)",
  "event Sell(address indexed seller, uint256 meIn, uint256 monOut, uint256 reserveAfter, uint256 remainingMEAfter)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
  "function balanceOf(address account) external view returns (uint256)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function approve(address spender, uint256 value) external returns (bool)",
  "function buyME(uint256 minMeOut, uint256 deadline) external payable returns (uint256)",
  "function sellME(uint256 meIn, uint256 minMonOut, uint256 deadline) external returns (uint256)",
  "function quoteBuy(uint256 monIn) external view returns (uint256)",
  "function quoteSell(uint256 meIn) external view returns (uint256)",
  "function remainingME() external view returns (uint256)",
  "function reserveMON() external view returns (uint256)",
  "function currentPrice() external view returns (uint256)"
];
