import { Contract } from 'ethers'
import abi from './abi.json'
import { ME_ADDRESS } from './config.js'
import { percentChange } from './curveMath.js'

export const LOOKBACKS = [
  { key: '1H', seconds: 60 * 60 },
  { key: '1D', seconds: 24 * 60 * 60 },
  { key: '1W', seconds: 7 * 24 * 60 * 60 },
  { key: '1M', seconds: 30 * 24 * 60 * 60 },
  { key: '1Y', seconds: 365 * 24 * 60 * 60 },
]

async function blockAtOrBefore(provider, targetTimestamp, genesis, latest) {
  if (targetTimestamp >= latest.timestamp) return latest.number
  if (targetTimestamp <= genesis.timestamp) return genesis.number

  let low = genesis
  let high = latest

  // Block timestamps are close to linear on a healthy chain. Interpolation search
  // reaches old lookback blocks with far fewer RPC calls than a plain binary search.
  for (let i = 0; i < 20 && high.number - low.number > 1; i++) {
    const spanSeconds = high.timestamp - low.timestamp
    const spanBlocks = high.number - low.number
    if (spanSeconds <= 0) break

    const ratio = (targetTimestamp - low.timestamp) / spanSeconds
    let guessNumber = low.number + Math.floor(spanBlocks * ratio)
    guessNumber = Math.max(low.number + 1, Math.min(high.number - 1, guessNumber))

    const guess = await provider.getBlock(guessNumber)
    if (!guess) break
    if (guess.timestamp <= targetTimestamp) low = guess
    else high = guess
  }

  // Tight binary finish if interpolation did not converge completely.
  let lo = low.number
  let hi = high.number
  while (lo + 1 < hi) {
    const mid = Math.floor((lo + hi) / 2)
    const block = await provider.getBlock(mid)
    if (!block) { hi = mid; continue }
    if (block.timestamp <= targetTimestamp) lo = mid
    else hi = mid
  }
  return lo
}

export async function loadPriceChanges(provider, currentPrice) {
  const contract = new Contract(ME_ADDRESS, abi, provider)
  const [genesis, latest] = await Promise.all([
    provider.getBlock(0),
    provider.getBlock('latest'),
  ])
  if (!genesis || !latest) throw new Error('Unable to read Monad block timestamps')

  const result = {}
  for (const item of LOOKBACKS) {
    const targetTimestamp = latest.timestamp - item.seconds
    const targetBlock = await blockAtOrBefore(provider, targetTimestamp, genesis, latest)

    try {
      // This invokes the exact ME.sol currentPrice() view against historical chain state.
      // If the target predates deployment or the RPC has no archive state, it safely becomes N/A.
      const pastPrice = await contract.currentPrice({ blockTag: targetBlock })
      result[item.key] = percentChange(currentPrice, pastPrice)
    } catch {
      result[item.key] = null
    }
  }
  return result
}
