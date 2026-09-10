import { useCallback, useEffect, useMemo, useState } from 'react'
import { BrowserProvider, Contract, Interface, JsonRpcProvider, formatEther, parseEther } from 'ethers'
import abi from './abi.json'
import {
  DEADLINE_SECONDS,
  DEFAULT_SLIPPAGE_BPS,
  EXPLORER,
  MAX_SLIPPAGE_PERCENT,
  ME_ADDRESS,
  MONAD,
  RPC_URL,
} from './config.js'
import { LOOKBACKS, loadPriceChanges } from './history.js'
import { formatPercent } from './curveMath.js'
import { connectMetaMask, restoreMetaMaskProvider } from './wallet.js'

const readProvider = new JsonRpcProvider(RPC_URL, MONAD.chainId, { staticNetwork: true })
const readContract = new Contract(ME_ADDRESS, abi, readProvider)
const contractInterface = new Interface(abi)

const short = (addr) => addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : ''
const clampBps = (v) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return Number(DEFAULT_SLIPPAGE_BPS)
  return Math.min(MAX_SLIPPAGE_PERCENT * 100, Math.max(0, Math.round(n * 100)))
}
const clean = (value, digits = 6) => {
  const n = Number(formatEther(value ?? 0n))
  if (!Number.isFinite(n)) return '0'
  return n.toLocaleString('en-US', { maximumFractionDigits: digits })
}
const applySlippage = (value, bps) => value * (10000n - BigInt(bps)) / 10000n
const isValidAmountText = (value) => /^\d*(?:\.\d{0,18})?$/.test(value)

function collectErrorData(err) {
  const candidates = [
    err?.data,
    err?.error?.data,
    err?.info?.error?.data,
    err?.info?.error?.error?.data,
  ]
  return candidates.find((v) => typeof v === 'string' && v.startsWith('0x'))
}

const friendlyErrors = {
  ZeroAmount: 'Amount must be greater than zero.',
  NoMEAvailable: 'The curve has no ME left to sell.',
  AmountTooSmall: 'This order is too small for the curve precision.',
  InsufficientME: 'Your wallet does not have enough ME.',
  InsufficientReserve: 'The curve reserve cannot cover this sell order.',
  InsufficientMON: 'The contract does not hold enough MON to settle this sell order.',
  SlippageExceeded: 'Price moved beyond your slippage limit. Refresh the quote and try again.',
  DeadlineExpired: 'The order expired before execution. Request a fresh quote and try again.',
  DirectMONNotAllowed: 'MON must be bought through buyME(); direct transfers are rejected.',
  DirectMEToContractNotAllowed: 'ME must be sold through sellME(); direct transfers are rejected.',
  MONTransferFailed: 'The contract could not transfer MON to your wallet.',
  InvalidState: 'The curve rejected the transaction because its state is invalid.',
}

function explainError(err) {
  const data = collectErrorData(err)
  if (data) {
    try {
      const parsed = contractInterface.parseError(data)
      if (parsed?.name && friendlyErrors[parsed.name]) return friendlyErrors[parsed.name]
    } catch { /* provider did not return decodable contract data */ }
  }

  const text = [err?.shortMessage, err?.reason, err?.message].filter(Boolean).join(' · ')
  const found = Object.keys(friendlyErrors).find((name) => text.includes(name))
  if (found) return friendlyErrors[found]
  if (err?.code === 4001 || err?.code === 'ACTION_REJECTED') return 'Transaction rejected in your wallet.'
  return err?.shortMessage || err?.reason || 'Transaction failed. Check your wallet and Monad network settings.'
}

function App() {
  const [account, setAccount] = useState('')
  const [mode, setMode] = useState('buy')
  const [amount, setAmount] = useState('')
  const [quote, setQuote] = useState(0n)
  const [slippage, setSlippage] = useState('0.5')
  const [stats, setStats] = useState(null)
  const [balances, setBalances] = useState({ mon: 0n, me: 0n })
  const [changes, setChanges] = useState({})
  const [historyStatus, setHistoryStatus] = useState('loading')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [txHash, setTxHash] = useState('')
  const [walletProvider, setWalletProvider] = useState(null)
  const [walletBusy, setWalletBusy] = useState(false)

  const bps = useMemo(() => clampBps(slippage), [slippage])
  const minOut = useMemo(() => applySlippage(quote, bps), [quote, bps])

  const refresh = useCallback(async () => {
    try {
      const [remaining, circulating, reserve, price, solvent, actual] = await Promise.all([
        readContract.remainingME(),
        readContract.circulatingME(),
        readContract.reserveMON(),
        readContract.currentPrice(),
        readContract.reserveSolvent(),
        readContract.actualMON(),
      ])
      setStats({ remaining, circulating, reserve, price, solvent, actual })
      if (account) {
        const [mon, me] = await Promise.all([
          readProvider.getBalance(account),
          readContract.balanceOf(account),
        ])
        setBalances({ mon, me })
      }
    } catch (e) {
      console.error('State refresh failed:', e)
    }
  }, [account])

  const refreshHistory = useCallback(async () => {
    try {
      setHistoryStatus('loading')
      const current = await readContract.currentPrice()
      const next = await loadPriceChanges(readProvider, current)
      setChanges(next)
      setHistoryStatus('ready')
    } catch (e) {
      console.error('Price history failed:', e)
      setHistoryStatus('unavailable')
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => {
    const id = setInterval(refresh, 12000)
    return () => clearInterval(id)
  }, [refresh])

  useEffect(() => {
    refreshHistory()
    const id = setInterval(refreshHistory, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [refreshHistory])

  useEffect(() => {
    let cancelled = false
    restoreMetaMaskProvider().then(async (provider) => {
      if (!provider || cancelled) return
      try {
        const accounts = await provider.request({ method: 'eth_accounts', params: [] })
        if (cancelled || !accounts?.[0]) return
        setWalletProvider(provider)
        setAccount(accounts[0])
      } catch { /* no persisted session yet */ }
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!walletProvider?.on) return undefined
    const onAccountsChanged = (accounts) => {
      setAccount(accounts?.[0] || '')
      setTxHash('')
      setStatus('')
    }
    const onChainChanged = () => window.location.reload()
    walletProvider.on('accountsChanged', onAccountsChanged)
    walletProvider.on('chainChanged', onChainChanged)
    return () => {
      walletProvider.removeListener?.('accountsChanged', onAccountsChanged)
      walletProvider.removeListener?.('chainChanged', onChainChanged)
    }
  }, [walletProvider])

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(async () => {
      setError('')
      setQuote(0n)
      if (!amount || Number(amount) <= 0 || !isValidAmountText(amount)) return
      try {
        const input = parseEther(amount)
        const q = mode === 'buy'
          ? await readContract.quoteBuy(input)
          : account ? await readContract.quoteSellFor(account, input) : 0n
        if (!cancelled) setQuote(q)
      } catch (e) {
        if (!cancelled) setError(explainError(e))
      }
    }, 280)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [amount, mode, account])

  async function ensureMonad(eip1193) {
    const chainId = await eip1193.request({ method: 'eth_chainId', params: [] })
    if (String(chainId).toLowerCase() === MONAD.chainIdHex.toLowerCase()) return
    try {
      await eip1193.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: MONAD.chainIdHex }],
      })
    } catch (e) {
      if (e?.code !== 4902) throw e
      await eip1193.request({
        method: 'wallet_addEthereumChain',
        params: [MONAD],
      })
    }
  }

  async function connect() {
    setError('')
    setWalletBusy(true)
    try {
      const eip1193 = await connectMetaMask()
      await ensureMonad(eip1193)
      const provider = new BrowserProvider(eip1193)
      const signer = await provider.getSigner()
      setWalletProvider(eip1193)
      setAccount(await signer.getAddress())
    } catch (e) {
      setError(explainError(e))
    } finally {
      setWalletBusy(false)
    }
  }

  async function trade() {
    setError('')
    setTxHash('')
    if (!account) return connect()
    if (!amount || Number(amount) <= 0 || quote === 0n || !isValidAmountText(amount)) {
      return setError('Enter a valid amount and wait for an on-chain quote.')
    }
    if (!walletProvider) return connect()

    setBusy(true)
    try {
      await ensureMonad(walletProvider)
      const provider = new BrowserProvider(walletProvider)
      const signer = await provider.getSigner()
      const signerAddress = await signer.getAddress()
      if (signerAddress.toLowerCase() !== account.toLowerCase()) setAccount(signerAddress)

      const contract = new Contract(ME_ADDRESS, abi, signer)
      const latestBlock = await readProvider.getBlock('latest')
      if (!latestBlock) throw new Error('Unable to read the latest Monad block')
      const deadline = latestBlock.timestamp + DEADLINE_SECONDS
      const input = parseEther(amount)

      // Fresh quote immediately before sending narrows stale-quote exposure.
      const freshQuote = mode === 'buy'
        ? await readContract.quoteBuy(input)
        : await readContract.quoteSellFor(signerAddress, input)
      const freshMinOut = applySlippage(freshQuote, bps)

      setStatus(mode === 'buy' ? 'Confirm Buy ME in your wallet…' : 'Confirm Sell ME in your wallet…')
      const tx = mode === 'buy'
        ? await contract.buyME(freshMinOut, deadline, { value: input })
        : await contract.sellME(input, freshMinOut, deadline)

      setTxHash(tx.hash)
      setStatus('Waiting for on-chain confirmation…')
      await tx.wait()
      setStatus('Transaction confirmed ✓')
      setAmount('')
      setQuote(0n)
      await Promise.all([refresh(), refreshHistory()])
    } catch (e) {
      setStatus('')
      setError(explainError(e))
    } finally {
      setBusy(false)
    }
  }

  function setMax() {
    if (!account) return
    if (mode === 'sell') {
      setAmount(formatEther(balances.me))
    } else {
      const mon = Number(formatEther(balances.mon))
      setAmount(mon > 0.02 ? String(Math.max(0, mon - 0.02)) : '')
    }
  }

  function updateAmount(value) {
    if (isValidAmountText(value)) setAmount(value)
  }

  const outputSymbol = mode === 'buy' ? 'ME' : 'MON'
  const inputSymbol = mode === 'buy' ? 'MON' : 'ME'

  return <div className="shell">
    <header>
      <div className="brand"><span className="brandmark">ME</span><span>ME Exchange</span></div>
      <div className="header-right">
        <span className="network"><i />Monad Mainnet</span>
        <button className="wallet" disabled={walletBusy} onClick={connect}>{account ? short(account) : walletBusy ? 'Opening MetaMask…' : 'Connect Wallet'}</button>
      </div>
    </header>

    <main>
      <section className="hero">
        <span className="eyebrow">ON-CHAIN BONDING CURVE</span>
        <h1>Trade <em>ME</em> directly<br/>against the curve.</h1>
        <p>No orderbook. No LP. Price is determined directly by the curve in ME.</p>
        <div className="change-strip" aria-label="ME marginal price changes">
          {LOOKBACKS.map(({ key }) => {
            const value = changes[key]
            const cls = value == null ? 'neutral' : value > 0 ? 'up' : value < 0 ? 'down' : 'neutral'
            return <div className="change-item" key={key}>
              <span>{key}</span>
              <b className={cls}>{historyStatus === 'loading' ? '…' : formatPercent(value)}</b>
            </div>
          })}
        </div>
        {historyStatus === 'unavailable' && <div className="history-note">Historical curve data is unavailable from the current RPC.</div>}
      </section>

      <div className="grid">
        <section className="card trade-card">
          <div className="tabs">
            <button className={mode === 'buy' ? 'active' : ''} onClick={() => { setMode('buy'); setAmount(''); setQuote(0n); setError('') }}>Buy</button>
            <button className={mode === 'sell' ? 'active sell' : ''} onClick={() => { setMode('sell'); setAmount(''); setQuote(0n); setError('') }}>Sell</button>
          </div>

          <div className="labelrow"><span>You pay</span><span>Balance: {clean(mode === 'buy' ? balances.mon : balances.me, 4)} {inputSymbol}</span></div>
          <div className="amountbox">
            <input inputMode="decimal" autoComplete="off" spellCheck="false" value={amount} onChange={(e) => updateAmount(e.target.value)} placeholder="0.0" />
            <div className="asset"><button onClick={setMax}>MAX</button><strong>{inputSymbol}</strong></div>
          </div>

          <div className="swap-arrow">↓</div>
          <div className="labelrow output"><span>You receive</span><span>On-chain quote</span></div>
          <div className="amountbox output">
            <div className="quote">{quote ? clean(quote, 8) : '0.0'}</div>
            <strong>{outputSymbol}</strong>
          </div>

          <div className="details">
            <div><span>Minimum received</span><b>{quote ? clean(minOut, 8) : '—'} {outputSymbol}</b></div>
            <div><span>Slippage tolerance</span><span className="slippage"><input value={slippage} inputMode="decimal" onChange={(e) => setSlippage(e.target.value)} onBlur={() => setSlippage(String(Math.min(MAX_SLIPPAGE_PERCENT, Math.max(0, Number(slippage) || 0))))} />%</span></div>
            <div><span>Deadline</span><b>3 minutes</b></div>
          </div>

          <button className="primary" disabled={busy} onClick={trade}>
            {busy ? 'Processing…' : !account ? 'Connect Wallet' : mode === 'buy' ? 'Buy ME' : 'Sell ME'}
          </button>
          {status && <div className="notice success">{status}</div>}
          {error && <div className="notice error">{error}</div>}
          {txHash && <a className="tx" href={`${EXPLORER}/tx/${txHash}`} target="_blank" rel="noreferrer">View transaction ↗</a>}
          <p className="hint"></p>
        </section>

        <aside>
          <section className="card stat-card">
            <div className="stat-head"><span>Curve status</span><b className={stats?.solvent ? 'healthy' : 'bad'}>{stats ? (stats.solvent ? '● SOLVENT' : '● WARNING') : '● LOADING'}</b></div>
            <div className="price"><small>Current marginal price</small><strong>{stats ? clean(stats.price, 12) : '—'} <span>MON / ME</span></strong></div>
            <div className="stats">
              <div><span>Curve reserve</span><b>{stats ? `${clean(stats.reserve + 100000n * 10n ** 18n, 5)} MON` : '—'}</b></div>
              <div><span>Actual MON</span><b>{stats ? `${clean(stats.actual, 5)} MON` : '—'}</b></div>
              <div><span>Circulating ME</span><b>{stats ? clean(stats.circulating, 2) : '—'}</b></div>
              <div><span>Remaining ME</span><b>{stats ? clean(stats.remaining, 2) : '—'}</b></div>
            </div>
          </section>

          <section className="card info-card">
            <div className="orb">ME</div>
            <div><h3>ME Token</h3><p>{short(ME_ADDRESS)} · Monad</p></div>
            <a href={`${EXPLORER}/address/${ME_ADDRESS}`} target="_blank" rel="noreferrer">Explorer ↗</a>
          </section>

          <div className="safety"><b>Curve-native execution</b><p>Trade directly through the ME bonding curve. Every transaction uses fresh pricing, slippage protection, and a 3-minute deadline for safer execution.</p></div>
        </aside>
      </div>
    </main>

    <footer><span>ME Exchange · Monad Mainnet</span><code>Chain 143 · Non-custodial</code></footer>
  </div>
}

export default App
