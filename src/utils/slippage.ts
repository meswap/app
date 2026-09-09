export function applySlippage(
  amount: bigint,
  slippageBps: bigint
) {
  return amount * (10000n - slippageBps) / 10000n
}
