# ME Exchange — English Pro v2.1

React + Vite frontend for the supplied `ME.sol` bonding-curve contract on Monad Mainnet.

## Contract
- Network: Monad Mainnet
- Chain ID: 143 (`0x8f`)
- RPC: `https://rpc.monad.xyz`
- ME contract: `0x6936960d0B04e255B48f4bBD8d03fACE78Ef77Ab`
- Native asset: MON

## Trading logic aligned with ME.sol
- Buy uses the contract quote and then `buyME(minMeOut, deadline)` with `msg.value = monIn`.
- Sell uses the seller-specific contract quote and then `sellME(meIn, minMonOut, deadline)`.
- Sell does not request ERC-20 approval because `ME.sol` performs its guarded internal sell transfer.
- Default slippage: 0.50%, user-adjustable up to 5%.
- Deadline: 3 minutes from the latest Monad block timestamp.
- A fresh quote is fetched immediately before transaction submission.
- Direct MON transfers and direct ME transfers to the contract are never used by the frontend.

## Cross-platform MetaMask connection
This version uses `@metamask/connect-evm` 2.1.1, the current MetaMask Connect EVM integration.

- MetaMask browser extension / MetaMask in-app browser: uses the native injected provider.
- Chrome/Safari mobile without an injected provider: MetaMask Connect opens the MetaMask mobile app through its cross-platform connection flow and returns an EIP-1193 provider.
- Desktop without the extension: MetaMask Connect can use its QR/mobile flow.
- Existing sessions are checked with `eth_accounts` on reload without requesting account access automatically.
- Monad switching/adding is performed through the provider that actually connected, not hard-coded `window.ethereum`.
- MetaMask Connect analytics are disabled.
- CSP allows only the MetaMask Connect relay required for remote wallet connections plus the Monad RPC.

## Price-change strip
The horizontal strip shows 1H / 1D / 1W / 1M / 1Y marginal-price changes to exactly four decimal places. Positive values are green, negative values are red. Historical values are read from the same contract `currentPrice()` view at historical Monad blocks; no CoinGecko/DEX price API is used. If the RPC cannot provide historical state, the UI shows `N/A`.

## Display details requested
- Hero text: `No orderbook. No LP. Price is determined directly by the curve in ME.`
- Curve reserve display: virtual reserve = `100,000 MON + reserveMON`.
- Actual MON remains the contract's actual MON balance.
- The public safety text does not expose internal function names.

## Security controls
- No private keys or seed phrases are requested or stored.
- Chain is verified/switched to Monad Mainnet before signing.
- Account and chain changes are handled explicitly.
- Contract custom errors are decoded when revert data is available.
- Amount input is restricted to valid decimal text with at most 18 decimals.
- Slippage is bounded to 0–5%.
- `minOut` and deadline remain final on-chain protections.
- Fresh on-chain quote immediately before transaction submission.
- Deadline uses the Monad block timestamp rather than the phone clock.
- Restrictive Content Security Policy.
- No external fonts, price APIs, or analytics.

## Termux
```bash
npm install
npm test
npm run build
npm run dev -- --host 0.0.0.0
```

The included automated source/math/security suite currently contains 27 tests. See `TEST-REPORT.txt`.

## v2.2 current-price optimization

Current Price is calculated locally from `(Actual MON + 100,000 MON) / Remaining ME`, using values already fetched for the stats panel. This removes one RPC call from the regular 12-second state refresh. Trading quotes and execution remain contract-driven, and historical price lookbacks remain on-chain.
