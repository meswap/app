import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import abi from '../src/abi.json' with { type: 'json' }
import { curvePrice, formatPercent, percentChange, INITIAL_PRICE } from '../src/curveMath.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const app = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8')
const config = fs.readFileSync(path.join(root, 'src/config.js'), 'utf8')
const css = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8')
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
const me = fs.readFileSync(path.join(root, 'reference/ME.sol'), 'utf8')
const history = fs.readFileSync(path.join(root, 'src/history.js'), 'utf8')
const E = 10n ** 18n

test('historical marginal price formula matches ME.sol currentPrice formula', () => {
  assert.match(me, /virtualReserveMON\(\),\s*1 ether,\s*meLeft/s)
  const expected = (100_000n * E) * E / (100_000_000_000n * E)
  assert.equal(INITIAL_PRICE, expected)
  assert.equal(curvePrice(0n, 100_000_000_000n * E), expected)
})



test('current price is computed locally from Actual MON plus 100k virtual MON divided by Remaining ME', () => {
  assert.match(app, /const BASE_MON_WEI = 100000n \* WAD/)
  assert.match(app, /currentPriceFromState = \(actual, remaining\)/)
  assert.match(app, /\(\(actual \+ BASE_MON_WEI\) \* WAD\) \/ remaining/)
  const refreshBlock = app.slice(app.indexOf('const refresh = useCallback'), app.indexOf('const refreshHistory = useCallback'))
  assert.doesNotMatch(refreshBlock, /readContract\.currentPrice\(\)/)
})

test('price history calls the contract currentPrice view at historical block tags', () => {
  assert.match(history, /contract\.currentPrice\(\{ blockTag: targetBlock \}\)/)
  assert.match(history, /latest\.timestamp - item\.seconds/)
  assert.doesNotMatch(history, /coingecko|dexscreener|coinmarketcap/i)
})

test('percentage output is signed and fixed to four decimals', () => {
  assert.equal(formatPercent(1.23456), '+1.2346%')
  assert.equal(formatPercent(-1.23456), '-1.2346%')
  assert.equal(formatPercent(0), '0.0000%')
  assert.equal(formatPercent(null), 'N/A')
})

test('percentage calculation handles rise, fall and unchanged prices', () => {
  assert.equal(percentChange(110n, 100n), 10)
  assert.equal(percentChange(90n, 100n), -10)
  assert.equal(percentChange(100n, 100n), 0)
  assert.equal(percentChange(100n, null), null)
})

test('ABI contains the exact ME trading surface used by the DApp', () => {
  const functions = new Map(abi.filter((x) => x.type === 'function').map((x) => [x.name, x]))
  assert.deepEqual(functions.get('buyME').inputs.map((x) => x.type), ['uint256', 'uint256'])
  assert.equal(functions.get('buyME').stateMutability, 'payable')
  assert.deepEqual(functions.get('sellME').inputs.map((x) => x.type), ['uint256', 'uint256', 'uint256'])
  assert.deepEqual(functions.get('quoteBuy').inputs.map((x) => x.type), ['uint256'])
  assert.deepEqual(functions.get('quoteSellFor').inputs.map((x) => x.type), ['address', 'uint256'])
})

test('frontend trade path matches ME.sol and does not require approve for sell', () => {
  assert.match(app, /readContract\.quoteBuy\(input\)/)
  assert.match(app, /readContract\.quoteSellFor\(signerAddress, input\)/)
  assert.match(app, /contract\.buyME\(freshMinOut, deadline, \{ value: input \}\)/)
  assert.match(app, /contract\.sellME\(input, freshMinOut, deadline\)/)
  assert.doesNotMatch(app, /\.approve\s*\(/)
  assert.match(me, /function _transferForSell\(/)
})

test('frontend security controls are enabled', () => {
  assert.match(config, /DEADLINE_SECONDS = 3 \* 60/)
  assert.match(config, /MAX_SLIPPAGE_PERCENT = 5/)
  assert.match(app, /latestBlock\.timestamp \+ DEADLINE_SECONDS/)
  assert.match(app, /freshQuote/)
  assert.match(app, /wallet_switchEthereumChain/)
  assert.match(app, /wallet_addEthereumChain/)
  assert.match(app, /accountsChanged/)
  assert.match(app, /chainChanged/)
  assert.match(app, /Number\.isFinite\(n\)/)
  assert.match(app, /\^\\d\*\(\?:\\\.\\d\{0,18\}\)\?\$/)
})

test('English UI and requested horizontal five-period strip are present', () => {
  assert.match(html, /<html lang="en">/)
  for (const label of ['1H', '1D', '1W', '1M', '1Y']) assert.match(history, new RegExp(`key: '${label}'`))
  assert.match(app, /No orderbook\. No LP\. Price is determined directly by the curve in ME\./)
  assert.match(css, /\.change-strip\{display:flex/)
  assert.match(css, /overflow-x:auto/)
  assert.match(css, /\.change-item b\.up\{color:#4ee8aa\}/)
  assert.match(css, /\.change-item b\.down\{color:#ff6b78\}/)
})

test('no Vietnamese UI strings remain in source files', () => {
  const combined = [app, config, html].join('\n')
  for (const token of ['Số lượng', 'Không thể', 'Giao dịch', 'Đang ', 'Ví ', 'trượt giá', 'phút']) {
    assert.equal(combined.includes(token), false, `Unexpected Vietnamese UI token: ${token}`)
  }
})
