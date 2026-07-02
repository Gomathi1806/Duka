# Duka 🏪

**Turn any shop into a digital till.** Duka ("shop" in Swahili) is a QR-based
point-of-sale for small merchants to accept stablecoin payments via
**MiniPay** — no cash, no bank, no wallet addresses to share.

Merchant creates a QR code → customer scans with MiniPay → funds land
**directly in the merchant's wallet** on Celo. No custody, no pooling, no
credit — just a direct on-chain transfer, settled and verified via the
**x402 protocol**.

## How it works

```
Merchant                          Customer
   |                                 |
Signs up (name + wallet)       Opens MiniPay
Creates QR  ←──── scans ────→  Scans QR
   |                                 |
   |                          GET /api/x402/[slug]
   |                            → 402 + PaymentRequirements (x402)
   |                                 |
Receives USDm ←──────────  eth_sendTransaction (ERC-20 transfer)
   |                                 |
   |                          GET again with X-PAYMENT header
   |                            → server verifies tx on Celo
   |                            → 200 + X-PAYMENT-RESPONSE receipt
   |
Dashboard (sales, total earned)
```

### x402 flow

`/api/x402/[slug]?amount=5&token=cUSD` implements the x402 "exact" scheme:

1. **Challenge** — request without an `X-PAYMENT` header returns
   `HTTP 402 Payment Required` with `{ x402Version, accepts: [PaymentRequirements] }`
   (payTo, asset contract, atomic amount, network).
2. **Pay** — the client pays via MiniPay's injected provider
   (`eth_sendTransaction` with an ERC-20 `transfer`).
3. **Settle** — the client retries with an `X-PAYMENT` header carrying the tx
   hash. The server verifies the transfer log on Celo (recipient, token,
   amount), records the sale, and returns the receipt in `X-PAYMENT-RESPONSE`.

Replay-safe: `tx_hash` is unique in the DB, and verification happens
server-side against the chain — the client is never trusted.

## Routes

| Route | What it is |
|---|---|
| `/` | Merchant signup (name + wallet + preset amounts) |
| `/m/[slug]` | Merchant QR page — print it or show it on a phone |
| `/pay/[slug]?amount=5` | Customer payment page (what the QR encodes) |
| `/dashboard/[slug]` | Sales dashboard — payment list + total earned |
| `/api/x402/[slug]` | x402 payment endpoint (402 challenge + settlement) |
| `/api/health` | Env + DB connectivity check |

## Stack

Next.js 16 (App Router) · viem · Drizzle + Neon Postgres · Vercel — same
stack as [Pico](https://github.com/Gomathi1806/pico_celo_bio_link), which this
project is derived from.

Supported tokens (the three MiniPay supports — docs.minipay.xyz FAQ Q11):
**USDm (cUSD)** default, **USDC**, and **USDT** (mainnet only; Tether has no
Alfajores deployment, so it's hidden automatically on testnet). Contract
addresses verified against [Celopedia](https://celopedia.celo.org/).

## Setup

```bash
npm install
cp env.template .env.local   # fill in DATABASE_URL (Neon) + network
npm run db:push              # create tables
npm run dev
```

Set `NEXT_PUBLIC_CELO_NETWORK=celo` for mainnet (MiniPay production) or
`celo-alfajores` for testnet.

## Test

```bash
npm test
```
