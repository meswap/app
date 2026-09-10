import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const app = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8')
const wallet = fs.readFileSync(path.join(root, 'src/wallet.js'), 'utf8')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')

// These tests intentionally inspect the integration surface without opening a wallet.
test('uses current MetaMask Connect EVM package for cross-platform MetaMask connection', () => {
  assert.equal(pkg.dependencies['@metamask/connect-evm'], '2.1.1')
  assert.match(wallet, /createEVMClient/)
  assert.match(wallet, /forceRequest: true/)
  assert.match(wallet, /client\.getProvider\(\)/)
})

test('native MetaMask injection is preferred when available', () => {
  assert.match(wallet, /window\.ethereum\?\.isMetaMask/)
  assert.match(wallet, /eth_requestAccounts/)
  assert.match(wallet, /return window\.ethereum/)
})

test('mobile/browser connection uses an EIP-1193 provider throughout trade flow', () => {
  assert.match(app, /const \[walletProvider, setWalletProvider\] = useState\(null\)/)
  assert.match(app, /new BrowserProvider\(walletProvider\)/)
  assert.match(app, /ensureMonad\(walletProvider\)/)
  assert.doesNotMatch(app, /if \(!window\.ethereum\) return setError\('No EVM wallet detected\.'\)/)
})

test('network switching uses the connected provider rather than hard-coded window.ethereum', () => {
  assert.match(app, /async function ensureMonad\(eip1193\)/)
  assert.match(app, /eip1193\.request\(\{[\s\S]*wallet_switchEthereumChain/)
  assert.match(app, /wallet_addEthereumChain/)
})

test('MetaMask Connect analytics are disabled and CSP permits only required relay', () => {
  assert.match(wallet, /analytics:\s*\{ enabled: false \}/)
  assert.match(html, /wss:\/\/mm-sdk-relay\.api\.cx\.metamask\.io/)
  assert.doesNotMatch(html, /mm-sdk-analytics\.api\.cx\.metamask\.io/)
})

test('restores an existing session without requesting accounts on page load', () => {
  assert.match(app, /restoreMetaMaskProvider\(\)/)
  assert.match(app, /method: 'eth_accounts'/)
})

test('requested presentation changes are included', () => {
  assert.match(app, /stats\.reserve \+ 100000n \* 10n \*\* 18n/)
  assert.match(app, /Trade directly through the ME bonding curve\./)
  assert.doesNotMatch(app, /Buy uses quoteBuy\(\) → buyME\(\)/)
})

test('wallet-side disconnect clears stale React state and SDK client', () => {
  assert.match(wallet, /export function invalidateMetaMaskClient\(\)/)
  assert.match(wallet, /disconnect:\s*\(\) => invalidateMetaMaskClient\(\)/)
  assert.match(app, /walletProvider\.on\('disconnect', onDisconnect\)/)
  assert.match(app, /walletProvider\.removeListener\?\.\('disconnect', onDisconnect\)/)
  assert.match(app, /const onDisconnect = \(\) => clearWalletConnection\(\)/)
  assert.match(app, /setWalletProvider\(null\)/)
})

test('empty accounts and browser resume revalidate a wallet-side disconnect', () => {
  assert.match(app, /if \(!accounts\?\.\[0\]\) \{[\s\S]*clearWalletConnection\(\)/)
  assert.match(app, /window\.addEventListener\('focus', onFocus\)/)
  assert.match(app, /document\.addEventListener\('visibilitychange', onVisibilityChange\)/)
  assert.match(app, /method: 'eth_accounts'/)
})


test('explicit reconnect forces a fresh MetaMask permission request', () => {
  assert.match(wallet, /forceRequest: true/)
  assert.match(wallet, /result\?\.accounts\?\.\[0\]/)
})
