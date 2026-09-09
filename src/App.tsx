import { useEffect, useRef, useState } from 'react'
import { formatEther, parseEther } from 'viem'
import {
  getCurrentPrice,
  getStats,
  getWalletBalances,
  quoteBuy,
  quoteSellFor,
  buyME,
  sellME,
  publicClient,
  verifyMEContract,
  checkReserveSolvent,
  getPriceChanges,
} from './services/meContract'
import {
  switchToMonad,
  changeAccount,
} from './services/wallet'
import { applySlippage } from './utils/slippage'
import { ME_ADDRESS } from './config/contract'

const EXPLORER_URL = import.meta.env.VITE_EXPLORER_URL

function formatDisplay(value: string, decimals = 6) {
  if (value === 'Đang đọc...') return value

  const n = Number(value)

  if (!Number.isFinite(n)) return value

  return n.toLocaleString('en-US', {
    maximumFractionDigits: decimals,
  })
}


function formatSwapValue(value: string) {
  if (value === '-') return '-'

  const n = Number(value)
  if (!Number.isFinite(n)) return value

  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function floorTo2Decimals(value: string) {
  const n = Number(value)
  if (!Number.isFinite(n)) return value

  return (Math.floor(n * 100) / 100).toFixed(2)
}

function formatPriceChange(value: number) {
  if (!Number.isFinite(value)) return '0.000%'

  const normalized = Math.abs(value) < 0.0005 ? 0 : value
  const sign = normalized > 0 ? '+' : ''

  return `${sign}${normalized.toFixed(3)}%`
}

function App() {
  const [swapTab, setSwapTab] = useState<'buy' | 'sell'>('buy')
  const [contractCopied, setContractCopied] = useState(false)

  const [price, setPrice] = useState('Đang đọc...')
  const [reserve, setReserve] = useState('Đang đọc...')
  const [remaining, setRemaining] = useState('Đang đọc...')
  const [circulating, setCirculating] = useState('Đang đọc...')
  const [virtualReserve, setVirtualReserve] = useState('Đang đọc...')
  const [surplusMon, setSurplusMon] = useState('Đang đọc...')
  const [reserveSolvent, setReserveSolvent] = useState<boolean | null>(null)

  const [wallet, setWallet] = useState<`0x${string}` | ''>('')
  const [walletClient, setWalletClient] = useState<any>(null)

  const [monBalance, setMonBalance] = useState('-')
  const [meBalance, setMeBalance] = useState('-')

  const [buyAmount, setBuyAmount] = useState('')
  const [buyQuote, setBuyQuote] = useState('-')
  const [minReceived, setMinReceived] = useState('-')
  const [quoteRaw, setQuoteRaw] = useState<bigint | null>(null)

  const [sellAmount, setSellAmount] = useState('')
  const [sellQuote, setSellQuote] = useState('-')
  const [sellMinReceived, setSellMinReceived] = useState('-')
  const [sellQuoteError, setSellQuoteError] = useState('')

  const [buyTxStatus, setBuyTxStatus] = useState('')
  const [buyTxHash, setBuyTxHash] = useState('')
  const [buyPending, setBuyPending] = useState(false)
  const buyLockRef = useRef(false)

  const [sellTxStatus, setSellTxStatus] = useState('')
  const [sellTxHash, setSellTxHash] = useState('')
  const [sellPending, setSellPending] = useState(false)
  const sellLockRef = useRef(false)

  const [quoteError, setQuoteError] = useState('')
  const [walletError, setWalletError] = useState('')
  const [error, setError] = useState('')

  const [priceChanges, setPriceChanges] = useState({
    h1: 0,
    d1: 0,
    w1: 0,
    m1: 0,
    y1: 0,
  })

  async function loadMarket() {
    const [priceResult, stats, changes] = await Promise.all([
      getCurrentPrice(),
      getStats(),
      getPriceChanges(),
    ])

    setPrice(formatEther(priceResult))
    setReserve(formatEther(stats.reserve))
    setRemaining(formatEther(stats.remaining))
    setCirculating(formatEther(stats.circulating))
    setVirtualReserve(formatEther(stats.virtualReserve))
    setSurplusMon(formatEther(stats.surplus))
    setReserveSolvent(stats.solvent)
    setPriceChanges(changes)
  }

  useEffect(() => {
    loadMarket().catch((err) => {
      console.error(err)
      setError(String(err))
    })
  }, [])

  useEffect(() => {
    if (!window.ethereum) return

    const resetSwapState = () => {
      setBuyAmount('')
      setSellAmount('')
      setBuyQuote('-')
      setSellQuote('-')
      setMinReceived('-')
      setSellMinReceived('-')
      setQuoteRaw(null)
      setQuoteError('')
      setSellQuoteError('')
      setBuyTxStatus('')
      setSellTxStatus('')
      setBuyTxHash('')
      setSellTxHash('')
    }

    const handleAccountsChanged = async (accounts: string[]) => {
      resetSwapState()
      if (accounts.length === 0) {
        setWallet('')
        setMonBalance('-')
        setMeBalance('-')
        return
      }

      const nextWallet = accounts[0] as `0x${string}`
      setWallet(nextWallet)
      await loadBalances(nextWallet)
    }

    const handleChainChanged = () => {
      resetSwapState()
      setWallet('')
      setWalletClient(null)
      setMonBalance('-')
      setMeBalance('-')
    }

    window.ethereum.on?.('accountsChanged', handleAccountsChanged)
    window.ethereum.on?.('chainChanged', handleChainChanged)

    return () => {
      window.ethereum?.removeListener?.(
        'accountsChanged',
        handleAccountsChanged
      )
      window.ethereum?.removeListener?.(
        'chainChanged',
        handleChainChanged
      )
    }
  }, [])

  useEffect(() => {
    async function loadQuote() {
      try {
        setQuoteError('')

        if (!buyAmount) {
          setBuyQuote('-')
          setMinReceived('-')
          setQuoteRaw(null)
          return
        }

        const monIn = parseEther(buyAmount)

        if (monIn <= 0n) {
          setBuyQuote('-')
          setMinReceived('-')
          setQuoteRaw(null)
          return
        }
        const result = await quoteBuy(monIn)

        const minimum = applySlippage(result, 100n)

        setQuoteRaw(result)
        setBuyQuote(formatEther(result))
        setMinReceived(formatEther(minimum))
      } catch (err) {
        console.error(err)
        setQuoteRaw(null)
        setBuyQuote('-')
        setMinReceived('-')
        setQuoteError('Không thể lấy báo giá')
      }
    }

    const timer = setTimeout(loadQuote, 400)

    return () => clearTimeout(timer)
  }, [buyAmount])

  useEffect(() => {
    async function loadSellQuote() {
      try {
        setSellQuoteError('')

        if (!wallet || !sellAmount) {
          setSellQuote('-')
          setSellMinReceived('-')
          return
        }

        const meIn = parseEther(sellAmount)

        if (meIn <= 0n) {
          setSellQuote('-')
          setSellMinReceived('-')
          return
        }
        const result = await quoteSellFor(wallet, meIn)
        const minimum = applySlippage(result, 100n)

        setSellQuote(formatEther(result))
        setSellMinReceived(formatEther(minimum))
      } catch (err) {
        console.error(err)
        setSellQuote('-')
        setSellMinReceived('-')
        setSellQuoteError('Không thể lấy báo giá Sell')
      }
    }

    const timer = setTimeout(loadSellQuote, 400)

    return () => clearTimeout(timer)
  }, [sellAmount, wallet])

  async function loadBalances(address: `0x${string}`) {
    const balances = await getWalletBalances(address)

    setMonBalance(formatEther(balances.monBalance))
    setMeBalance(formatEther(balances.meBalance))
  }

  useEffect(() => {
    if (!walletError) return

    const timer = setTimeout(() => {
      setWalletError('')
    }, 2000)

    return () => clearTimeout(timer)
  }, [walletError])

  async function handleConnect() {
    try {
      setWalletError('')

      await switchToMonad()

      const result = await changeAccount()

      setWallet(result.address)
      setWalletClient(result.walletClient)

      await loadBalances(result.address)

      setWalletError('Kết nối ví thành công.')
    } catch (err: any) {
      console.error(err)

      const message =
        err?.shortMessage ||
        err?.message ||
        String(err)

      const rejected =
        err?.code === 4001 ||
        message.toLowerCase().includes('user rejected') ||
        message.toLowerCase().includes('user denied')

      setWalletError(
        rejected
          ? 'Đã hủy kết nối ví.'
          : `Lỗi kết nối ví: ${message}`
      )
    }
  }

  async function handleDisconnect() {
    try {
      if (window.ethereum) {
        await window.ethereum.request({
          method: 'wallet_revokePermissions',
          params: [{ eth_accounts: {} }],
        })
      }
    } catch (err) {
      console.error('Không thể revoke quyền MetaMask:', err)
    }

    setWallet('')
    setWalletClient(null)
    setMonBalance('-')
    setMeBalance('-')
    setBuyAmount('')
    setSellAmount('')
    setBuyQuote('-')
    setSellQuote('-')
    setMinReceived('-')
    setSellMinReceived('-')
    setBuyTxStatus('')
    setSellTxStatus('')
    setBuyTxHash('')
    setSellTxHash('')
  }

  async function ensureMonadChain() {
    if (!window.ethereum) {
      throw new Error('Không tìm thấy ví Web3')
    }

    const chainId = await window.ethereum.request({
      method: 'eth_chainId',
    })

    if (
      typeof chainId !== 'string' ||
      chainId.toLowerCase() !== '0x8f'
    ) {
      throw new Error('Sai mạng. Hãy chuyển sang Monad Mainnet')
    }
  }

  async function ensureActiveAccount(expected: `0x${string}`) {
    if (!window.ethereum) {
      throw new Error('Không tìm thấy ví Web3')
    }

    const accounts = await window.ethereum.request({
      method: 'eth_accounts',
    })

    const active =
      Array.isArray(accounts) && accounts[0]
        ? String(accounts[0]).toLowerCase()
        : ''

    if (!active || active !== expected.toLowerCase()) {
      throw new Error('Account trong ví đã thay đổi. Hãy kết nối lại')
    }
  }

  async function handleBuy() {
    if (buyLockRef.current) return

    buyLockRef.current = true

    try {
      setBuyPending(true)
      setBuyTxStatus('')
      setBuyTxHash('')

      if (!wallet || !walletClient) {
        throw new Error('Hãy kết nối ví trước')
      }

      await ensureMonadChain()
      await ensureActiveAccount(wallet)
      await verifyMEContract()

      if (!buyAmount) {
        throw new Error('Nhập số MON muốn mua')
      }

      const monIn = parseEther(buyAmount)

      if (monIn <= 0n) {
        throw new Error('Số MON phải lớn hơn 0')
      }
      const currentMonBalance = parseEther(monBalance)

      if (monIn >= currentMonBalance) {
        throw new Error('Không đủ MON. Cần chừa MON để trả gas')
      }

      setBuyTxStatus('Đang cập nhật báo giá...')

      const freshQuote = await quoteBuy(monIn)

      if (freshQuote <= 0n) {
        throw new Error('Báo giá Buy không hợp lệ')
      }

      const minMeOut = applySlippage(freshQuote, 100n)

      setBuyQuote(formatEther(freshQuote))
      setMinReceived(formatEther(minMeOut))
      setQuoteRaw(freshQuote)

      setBuyTxStatus('Đang chờ xác nhận trong ví...')

      const hash = await buyME(
        walletClient,
        wallet,
        monIn,
        minMeOut
      )

      setBuyTxHash(hash)
      setBuyTxStatus('Đã gửi giao dịch. Đang chờ xác nhận blockchain...')

      const receipt =
        await publicClient.waitForTransactionReceipt({
          hash,
        })

      if (receipt.status !== 'success') {
        throw new Error('Giao dịch không thành công')
      }

      setBuyTxStatus('Mua ME thành công!')

      await Promise.all([
        loadBalances(wallet),
        loadMarket(),
      ])

      setBuyAmount('')
      setBuyQuote('-')
      setMinReceived('-')
      setQuoteRaw(null)
    } catch (err: any) {
      console.error(err)

      const message =
        err?.shortMessage ||
        err?.message ||
        String(err)

      const rejected =
        err?.code === 4001 ||
        message.toLowerCase().includes('user rejected') ||
        message.toLowerCase().includes('user denied')

      setBuyTxStatus(
        rejected
          ? 'Đã hủy giao dịch.'
          : `Lỗi: ${message}`
      )
    } finally {
      buyLockRef.current = false
      setBuyPending(false)
    }
  }

  async function handleSell() {
    if (sellLockRef.current) return

    sellLockRef.current = true

    try {
      setSellPending(true)
      setSellTxStatus('')
      setSellTxHash('')

      if (!wallet || !walletClient) {
        throw new Error('Hãy kết nối ví trước')
      }

      await ensureMonadChain()
      await ensureActiveAccount(wallet)
      await verifyMEContract()

      const solvent = await checkReserveSolvent()

      if (!solvent) {
        throw new Error('Reserve đang không an toàn. Tạm thời không thể Sell')
      }

      if (!sellAmount) {
        throw new Error('Nhập số ME muốn bán')
      }

      const meIn = parseEther(sellAmount)

      if (meIn <= 0n) {
        throw new Error('Số ME phải lớn hơn 0')
      }
      const currentMeBalance = parseEther(meBalance)

      if (meIn > currentMeBalance) {
        throw new Error('Số ME muốn bán lớn hơn số dư ví')
      }

      setSellTxStatus('Đang cập nhật báo giá Sell...')

      const freshQuote = await quoteSellFor(
        wallet,
        meIn
      )

      if (freshQuote <= 0n) {
        throw new Error('Báo giá Sell không hợp lệ')
      }

      const minMonOut =
        applySlippage(freshQuote, 100n)

      setSellQuote(formatEther(freshQuote))
      setSellMinReceived(formatEther(minMonOut))

      setSellTxStatus('Đang chờ xác nhận trong ví...')

      const hash = await sellME(
        walletClient,
        wallet,
        meIn,
        minMonOut
      )

      setSellTxHash(hash)
      setSellTxStatus(
        'Đã gửi giao dịch. Đang chờ xác nhận blockchain...'
      )

      const receipt =
        await publicClient.waitForTransactionReceipt({
          hash,
        })

      if (receipt.status !== 'success') {
        throw new Error('Giao dịch không thành công')
      }

      setSellTxStatus('Bán ME thành công!')

      await Promise.all([
        loadBalances(wallet),
        loadMarket(),
      ])

      setSellAmount('')
      setSellQuote('-')
      setSellMinReceived('-')
    } catch (err: any) {
      console.error(err)

      const message =
        err?.shortMessage ||
        err?.message ||
        String(err)

      const rejected =
        err?.code === 4001 ||
        message.toLowerCase().includes('user rejected') ||
        message.toLowerCase().includes('user denied')

      setSellTxStatus(
        rejected
          ? 'Đã hủy giao dịch.'
          : `Lỗi: ${message}`
      )
    } finally {
      sellLockRef.current = false
      setSellPending(false)
    }
  }

  function shortAddress(address: string) {
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  function shortHash(hash: string) {
    return `${hash.slice(0, 10)}...${hash.slice(-8)}`
  }


async function copyText(text: string) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'

  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()

  const copied = document.execCommand('copy')
  document.body.removeChild(textarea)

  if (!copied) {
    throw new Error('Copy failed')
  }
}


  return (
    <div>
      <header className="app-header">
        <div className="app-title">
          <h1>ME</h1>
          <span>Monad Mainnet</span>
        </div>

        <button
          className="wallet-button"
          onClick={wallet ? handleDisconnect : handleConnect}
        >
          {wallet ? `${shortAddress(wallet)} · Disconnect` : 'Connect Wallet'}
        </button>
      </header>

      {wallet && (
        <section className="wallet-card">
          <div className="wallet-balance">
            <span>MON Balance</span>
            <strong>{formatDisplay(monBalance, 6)} MON</strong>
          </div>

          <div className="wallet-balance">
            <span>ME Balance</span>
            <strong>{formatDisplay(meBalance, 2)} ME</strong>
          </div>
        </section>
      )}

      <div className="price-change-row">
        {[
          ['1H', priceChanges.h1],
          ['1D', priceChanges.d1],
          ['1W', priceChanges.w1],
          ['1T', priceChanges.m1],
          ['1N', priceChanges.y1],
        ].map(([label, value]) => {
          const change = value as number

          return (
            <div className="price-change-item" key={label as string}>
              <span>{label}</span>
              <strong
                className={
                  change > 0
                    ? 'price-up'
                    : change < 0
                      ? 'price-down'
                      : 'price-flat'
                }
              >
                {formatPriceChange(change)}
              </strong>
            </div>
          )
        })}
      </div>

      <section className="swap-card">
        <div className="swap-tabs">
          <button
            type="button"
            className={swapTab === 'buy' ? 'active' : ''}
            onClick={() => setSwapTab('buy')}
          >
            Buy
          </button>

          <button
            type="button"
            className={swapTab === 'sell' ? 'active' : ''}
            onClick={() => setSwapTab('sell')}
          >
            Sell
          </button>
        </div>

      {swapTab === 'buy' && (
        <div className="swap-panel">


      <div style={{ display: 'flex', gap: '8px' }}>
        <input
          type="number"
          inputMode="decimal"
          placeholder="0.0"
          value={buyAmount}
          onChange={(e) => setBuyAmount(e.target.value)}
          style={{
            width: '100%',
            padding: '12px',
            fontSize: '20px',
          }}
        />

        <button
          type="button"
          onClick={() => {
            if (monBalance !== '-') {
              const balance = parseEther(monBalance)
              const gasReserve = parseEther('0.01')

              if (balance > gasReserve) {
                setBuyAmount(
                  floorTo2Decimals(formatEther(balance - gasReserve))
                )
              }
            }
          }}
        >
          MAX
        </button>
      </div>


      <p className="swap-result">
        You Receive:{' '}
        <strong>{formatSwapValue(buyQuote)} ME</strong>
      </p>

      <p>
        Slippage: <strong>1%</strong>
      </p>

      <p className="swap-result">
        Minimum Received:{' '}
        <strong>{formatSwapValue(minReceived)} ME</strong>
      </p>

      <br />
      <br />



      <button
        onClick={handleBuy}
        disabled={
          buyPending ||
          !wallet ||
          !buyAmount ||
          !quoteRaw
        }
        style={{
          width: '100%',
          padding: '14px',
          fontSize: '18px',
          fontWeight: 'bold',
        }}
      >
        {buyPending ? 'Processing...' : 'Buy ME'}
      </button>

      {quoteError && (
        <p style={{ color: 'red' }}>
          {quoteError}
        </p>
      )}

      {buyTxStatus && (
        <p>
          <strong>{buyTxStatus}</strong>
        </p>
      )}

      {buyTxHash && (
        <p>
          TX:{' '}
          <a
            href={`${EXPLORER_URL}/tx/${buyTxHash}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {shortHash(buyTxHash)}
          </a>
        </p>
      )}

        </div>
      )}

      {swapTab === 'sell' && (
        <div className="swap-panel">


      <div style={{ display: 'flex', gap: '8px' }}>
        <input
          type="number"
          inputMode="decimal"
          placeholder="0.0"
          value={sellAmount}
          onChange={(e) => setSellAmount(e.target.value)}
          style={{
            width: '100%',
            padding: '12px',
            fontSize: '20px',
          }}
        />

        <button
          type="button"
          onClick={() => {
            if (meBalance !== '-') {
              setSellAmount(floorTo2Decimals(meBalance))
            }
          }}
        >
          MAX
        </button>
      </div>


      <p className="swap-result">
        You Receive:{' '}
        <strong>{formatSwapValue(sellQuote)} MON</strong>
      </p>

      <p>
        Slippage: <strong>1%</strong>
      </p>

      <p className="swap-result">
        Minimum Received:{' '}
        <strong>{formatSwapValue(sellMinReceived)} MON</strong>
      </p>

      {sellQuoteError && (
        <p style={{ color: 'red' }}>
          {sellQuoteError}
        </p>
      )}

      <br />
      <br />



      <button
        onClick={handleSell}
        disabled={
          sellPending ||
          !wallet ||
          !sellAmount ||
          sellQuote === '-'
        }
        style={{
          width: '100%',
          padding: '14px',
          fontSize: '18px',
          fontWeight: 'bold',
        }}
      >
        {sellPending ? 'Processing...' : 'Sell ME'}
      </button>

      {sellTxStatus && (
        <p>
          <strong>{sellTxStatus}</strong>
        </p>
      )}

      {sellTxHash && (
        <p>
          TX:{' '}
          <a
            href={`${EXPLORER_URL}/tx/${sellTxHash}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {shortHash(sellTxHash)}
          </a>
        </p>
      )}

        </div>
      )}

      </section>

      {walletError && (
        <div className="alert-overlay">
          <div className="alert-popup">
            <h3>Thông báo</h3>
            <p>{walletError}</p>

          </div>
        </div>
      )}

      <section className="stats-card">
        <h2>Contract Stats</h2>


      <div className="contract-address">
        <code title={ME_ADDRESS}>
          {`${ME_ADDRESS.slice(0, 10)}...${ME_ADDRESS.slice(-8)}`}
        </code>

        <button
          type="button"
          onClick={async () => {
            await copyText(ME_ADDRESS)
            setContractCopied(true)
            setTimeout(() => setContractCopied(false), 1500)
          }}
        >
          {contractCopied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>

      <div className="stats-list">
        <div className="stat-row">
          <span>Current Price</span>
          <strong>{formatDisplay(price, 12)} MON / ME</strong>
        </div>

        <div className="stat-row">
          <span>MON Reserve</span>
          <strong>{formatDisplay(reserve, 6)} MON</strong>
        </div>

        <div className="stat-row">
          <span>ME Remaining</span>
          <strong>{formatDisplay(remaining, 2)} ME</strong>
        </div>

        <div className="stat-row">
          <span>ME Circulating</span>
          <strong>{formatDisplay(circulating, 2)} ME</strong>
        </div>

        <div className="stat-row">
          <span>Virtual Reserve</span>
          <strong>{formatDisplay(virtualReserve, 6)} MON</strong>
        </div>


        <div className="stat-row">
          <span>Surplus MON</span>
          <strong>{formatDisplay(surplusMon, 6)} MON</strong>
        </div>

        <div className="stat-row">
          <span>Reserve Solvent</span>
          <strong>
            {reserveSolvent === null
              ? 'Đang đọc...'
              : reserveSolvent
                ? '✓ Solvent'
                : '⚠ Không đủ reserve'}
          </strong>
        </div>
      </div>

      </section>

      {error && (
        <>
          <h3>Lỗi</h3>
          <pre>{error}</pre>
        </>
      )}
    </div>
  )
}

export default App
