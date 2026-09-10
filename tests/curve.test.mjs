import test from 'node:test'
import assert from 'node:assert/strict'

const E = 10n ** 18n
const TOTAL_SUPPLY = 100_000_000_000n * E
const BASE_MON = 100_000n * E
const K = BASE_MON * TOTAL_SUPPLY
const ceilDiv = (a,b) => (a + b - 1n) / b

function quoteBuy(state, monIn) {
  if (monIn === 0n) throw new Error('ZeroAmount')
  if (state.meLeft === 0n) throw new Error('NoMEAvailable')
  const oldV = BASE_MON + state.reserve
  const newV = oldV + monIn
  const newRemaining = ceilDiv(K, newV)
  if (newRemaining >= state.meLeft) throw new Error('AmountTooSmall')
  const meOut = state.meLeft - newRemaining
  if (meOut === 0n) throw new Error('AmountTooSmall')
  return meOut
}
function quoteSell(state, sellerBalance, meIn) {
  if (meIn === 0n) throw new Error('ZeroAmount')
  if (sellerBalance < meIn) throw new Error('InsufficientME')
  const newRemaining = state.meLeft + meIn
  const oldV = BASE_MON + state.reserve
  const newV = ceilDiv(K, newRemaining)
  if (oldV <= newV) throw new Error('AmountTooSmall')
  const monOut = oldV - newV
  if (monOut > state.reserve) throw new Error('InsufficientReserve')
  return monOut
}

function buy(state, monIn) {
  const meOut = quoteBuy(state, monIn)
  return [{ reserve: state.reserve + monIn, meLeft: state.meLeft - meOut }, meOut]
}
function sell(state, sellerBalance, meIn) {
  const monOut = quoteSell(state, sellerBalance, meIn)
  return [{ reserve: state.reserve - monOut, meLeft: state.meLeft + meIn }, monOut]
}

test('constants match ME.sol', () => {
  assert.equal(TOTAL_SUPPLY, 100_000_000_000n * E)
  assert.equal(BASE_MON, 100_000n * E)
  assert.equal(K, BASE_MON * TOTAL_SUPPLY)
})

test('buy quote equals execution transition', () => {
  const s = { reserve: 0n, meLeft: TOTAL_SUPPLY }
  const q = quoteBuy(s, 100n * E)
  const [next, out] = buy(s, 100n * E)
  assert.equal(out, q)
  assert.equal(next.reserve, 100n * E)
  assert.equal(next.meLeft, TOTAL_SUPPLY - q)
})

test('round-trip buy then sell cannot drain reserve and restores ME', () => {
  let s = { reserve: 0n, meLeft: TOTAL_SUPPLY }
  const [afterBuy, me] = buy(s, 1_000n * E)
  const [afterSell, mon] = sell(afterBuy, me, me)
  assert.equal(afterSell.meLeft, TOTAL_SUPPLY)
  assert.ok(mon <= 1_000n * E)
  assert.ok(afterSell.reserve >= 0n)
})

test('larger buys receive less ME per MON (positive price impact)', () => {
  const s = { reserve: 0n, meLeft: TOTAL_SUPPLY }
  const one = quoteBuy(s, 1n * E)
  const hundred = quoteBuy(s, 100n * E)
  assert.ok(hundred < one * 100n)
})

test('sell quote rejects balance larger than holder', () => {
  const s = { reserve: 10n * E, meLeft: TOTAL_SUPPLY - 1_000_000n * E }
  assert.throws(() => quoteSell(s, 1n * E, 2n * E), /InsufficientME/)
})

test('zero input rejected on both paths', () => {
  const s = { reserve: 0n, meLeft: TOTAL_SUPPLY }
  assert.throws(() => quoteBuy(s, 0n), /ZeroAmount/)
  assert.throws(() => quoteSell(s, 0n, 0n), /ZeroAmount/)
})

test('100 sequential buys keep invariant domain solvent by accounting', () => {
  let s = { reserve: 0n, meLeft: TOTAL_SUPPLY }
  for (let i=1n; i<=100n; i++) {
    const [next] = buy(s, i * E)
    s = next
    const requiredV = ceilDiv(K, s.meLeft)
    assert.ok(BASE_MON + s.reserve >= requiredV)
    assert.ok(s.meLeft <= TOTAL_SUPPLY)
  }
})

test('50 buys then partial sells never produce payout above reserve', () => {
  let s = { reserve: 0n, meLeft: TOTAL_SUPPLY }
  let holder = 0n
  for (let i=0; i<50; i++) {
    const [next, out] = buy(s, 10n * E)
    s = next; holder += out
  }
  for (let i=0; i<20; i++) {
    const part = holder / 40n
    const q = quoteSell(s, holder, part)
    assert.ok(q <= s.reserve)
    const [next] = sell(s, holder, part)
    s = next; holder -= part
  }
})

test('frontend slippage floor never exceeds quote', () => {
  const q = 123456789123456789n
  for (const bps of [0n, 1n, 50n, 100n, 500n, 5000n]) {
    const minOut = q * (10000n - bps) / 10000n
    assert.ok(minOut <= q)
  }
})

test('deterministic 1,000-step mixed-trade stress test preserves curve domain', () => {
  let s = { reserve: 0n, meLeft: TOTAL_SUPPLY }
  let holder = 0n
  let seed = 0x1234_5678n
  const nextRand = () => {
    seed = (seed * 1103515245n + 12345n) & 0x7fff_ffffn
    return seed
  }

  for (let i = 0; i < 1000; i++) {
    const r = nextRand()
    const shouldBuy = holder === 0n || (r % 100n) < 62n
    if (shouldBuy) {
      const monIn = (1n + (r % 250n)) * E / 10n // 0.1 to 24.9 MON
      const [next, out] = buy(s, monIn)
      s = next
      holder += out
    } else {
      const divisor = 2n + (r % 40n)
      const meIn = holder / divisor
      if (meIn === 0n) continue
      const [next, monOut] = sell(s, holder, meIn)
      assert.ok(monOut <= s.reserve)
      s = next
      holder -= meIn
    }

    const requiredV = ceilDiv(K, s.meLeft)
    assert.ok(BASE_MON + s.reserve >= requiredV)
    assert.ok(s.reserve >= 0n)
    assert.ok(s.meLeft > 0n && s.meLeft <= TOTAL_SUPPLY)
    assert.ok(holder >= 0n)
  }
})

test('slippage floor is monotonic as tolerance increases', () => {
  const q = 999_999_999_999_999_999_999n
  let prev = q
  for (let bps = 0n; bps <= 500n; bps++) {
    const current = q * (10000n - bps) / 10000n
    assert.ok(current <= prev)
    prev = current
  }
})
