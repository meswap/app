export const WAD = 10n ** 18n
export const BASE_MON = 100_000n * WAD
export const TOTAL_SUPPLY = 100_000_000_000n * WAD

export function curvePrice(reserveMON, remainingME) {
  if (remainingME <= 0n) return null
  return (BASE_MON + reserveMON) * WAD / remainingME
}

export function percentChange(currentPrice, pastPrice) {
  if (pastPrice == null || pastPrice <= 0n || currentPrice == null) return null
  const SCALE = 100_000_000n
  const scaled = (currentPrice - pastPrice) * 100n * SCALE / pastPrice
  return Number(scaled) / Number(SCALE)
}

export function formatPercent(value) {
  if (value == null || !Number.isFinite(value)) return 'N/A'
  const normalized = Object.is(value, -0) ? 0 : value
  const sign = normalized > 0 ? '+' : ''
  return `${sign}${normalized.toFixed(4)}%`
}

export const INITIAL_PRICE = curvePrice(0n, TOTAL_SUPPLY)
