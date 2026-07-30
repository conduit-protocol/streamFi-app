# conduit-app

The web interface for the Conduit streaming payments protocol. Create, manage, and monitor payment streams — all in a browser.

Built with [Next.js 15](https://nextjs.org) (App Router), [Freighter](https://www.freighter.app), and Tailwind CSS. Design: **black and white only** — no accent colours.

---

## Pages

| Route | Description |
|-------|-------------|
| `/` | Landing page — protocol overview and call to action |
| `/about` | Protocol explainer — contract status, deployment info |
| `/streams` | Your streams dashboard — active, ended, and created |
| `/create` | Create a new stream — token, recipient, rate, duration |
| `/stream/[id]` | Single stream view — progress, withdraw, top-up, cancel |
| `/dashboard` | Sender overview — aggregate flow rate, total disbursed |
| `/transactions` | Transaction history — indexed on-chain activity for the connected wallet |
| `/profile` | Connected wallet profile — address, network, and session details |

---

## Design Principles

- **Black and white only.** No colour utilities outside `text-black`, `text-white`, `bg-black`, `bg-white`, and the grey scale (`gray-*`). Contrast and hierarchy are achieved through weight, size, and spacing alone.
- **No rounded corners on primary containers.** Cards and panels use `rounded-none` or `rounded-sm`. Interactive elements (buttons, inputs) use `rounded`.
- **Monospaced numbers.** All amounts and timestamps use `font-mono tabular-nums`.
- **Dense layouts.** Information density over decoration.

---

## Tech Stack

| Layer | Library |
|-------|---------|
| Framework | Next.js 15 (App Router) |
| Wallet | `@stellar/freighter-api` (Freighter-only, see below) |
| Blockchain reads | `@stellar/stellar-sdk` |
| Styling | Tailwind CSS 3 |
| Icons | Lucide React |
| Forms | React Hook Form + Zod |
| Dates | `date-fns` |
| State | React Context |

---

## Wallet integration

`contexts/WalletContext.tsx` is a working `@stellar/freighter-api` integration, not a stub:

- `connect()` calls Freighter's real `requestAccess()` to obtain the user's actual public key,
  persists the session, and watches for account/network changes via `WatchWalletChanges`.
- `signTx()` calls Freighter's real `signTransaction()` and returns a genuinely signed XDR.
- Mutating operations (connect, disconnect, signTx) flow through a bounded Semaphore + Mutex
  pattern with `AbortController` integration for graceful cancellation — see the concurrency
  notes at the top of `WalletContext.tsx` and `TODO.md` for the design history.

This app deliberately supports **Freighter only**, not a multi-wallet kit.
`@creit.tech/stellar-wallets-kit` was evaluated and rejected: its dependency tree unconditionally
pulls in Ledger/Trezor/WalletConnect/a NEAR Protocol SDK — roughly 300 extra packages and
36 vulnerabilities — for wallet support this app doesn't use. If broader wallet support becomes
a real requirement, that tradeoff should be revisited deliberately rather than assumed.

Every mutating flow (withdraw, cancel, pause, top-up, create) builds, signs, and submits a real
transaction against the configured RPC end-to-end today.

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 20 |
| npm | ≥ 10 |
| A Stellar-compatible wallet | Freighter, xBull, Albedo, etc. |

---

## Setup

```bash
git clone https://github.com/conduit-protocol/conduit-app
cd conduit-app
npm install
```

Copy the environment file and fill in the values:

```bash
cp .env.example .env.local
```

```env
# .env.local

# Soroban RPC endpoint
NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org

# Network passphrase
NEXT_PUBLIC_NETWORK_PASSPHRASE=Test SDF Network ; September 2015

# Deployed contract IDs (from conduit-contracts deploy)
NEXT_PUBLIC_FACTORY_CONTRACT_ID=C...
NEXT_PUBLIC_GOVERNOR_CONTRACT_ID=C...

# Optional — Horizon for account info
NEXT_PUBLIC_HORIZON_URL=https://horizon-testnet.stellar.org
```

Start the development server:

```bash
npm run dev
# → http://localhost:3000
```

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with Turbopack |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run `tsc --noEmit` |
| `npm test` | Run Vitest unit tests |

---

## Directory Structure

```
conduit-app/
├── app/
│   ├── layout.tsx              # Root layout — Providers, Navbar, footer
│   ├── page.tsx                # Landing page
│   ├── (marketing)/
│   │   └── about/page.tsx      # Protocol explainer
│   ├── streams/
│   │   └── page.tsx            # Stream list — sender + recipient views
│   ├── stream/
│   │   └── [id]/page.tsx       # Single stream detail + actions
│   ├── create/
│   │   └── page.tsx            # Create stream form
│   └── dashboard/
│       └── page.tsx            # Aggregate sender stats
├── components/
│   ├── ui/
│   │   ├── Button.tsx          # Primary, secondary, ghost variants
│   │   ├── Card.tsx            # Content container
│   │   ├── Input.tsx           # Text, number, address inputs
│   │   ├── Badge.tsx           # Status labels (Active, Ended, Paused)
│   │   ├── ProgressBar.tsx     # Stream drain visualisation
│   │   └── Modal.tsx           # Dialog wrapper
│   ├── stream/
│   │   ├── StreamCard.tsx      # Summary card used in /streams list
│   │   ├── StreamActions.tsx   # Withdraw / pause / resume / cancel / top-up / clawback buttons
│   │   ├── StreamTimeline.tsx  # Visual progress + start/end markers
│   │   ├── WithdrawButton.tsx  # Withdraw with pending state
│   │   └── RateTicker.tsx      # Live per-second counter (client-side math, no contract calls)
│   ├── Navbar.tsx              # Top navigation
│   ├── ConnectButton.tsx       # Freighter connect trigger (via WalletContext)
│   └── Providers.tsx           # Context providers tree
├── lib/
│   ├── soroban.ts              # Low-level Soroban RPC: invokeContract, simulateReadOnly, ScVal decoding
│   ├── factory.ts              # DripFactory call wrappers (createStream, streamCount, ...)
│   ├── stream.ts               # DripStream call wrappers (withdraw, cancel, pause, ...)
│   ├── tokens.ts               # Known Stellar asset list
│   └── format.ts               # Amount formatting, time helpers (tested — see format.test.ts)
├── contexts/
│   └── WalletContext.tsx       # Wallet state + sign helpers
├── tailwind.config.ts          # B&W-only token config
├── next.config.ts
├── tsconfig.json
├── .env.example
└── .github/
    └── workflows/
        └── ci.yml              # lint + typecheck + test + build on PR
```

Note: `/create` and `/stream/[id]` don't have separate form/detail components — the form logic
lives directly in `app/create/page.tsx`, and the detail page composes `StreamTimeline` +
`StreamActions` + `WithdrawButton` directly in `app/stream/[id]/page.tsx`.

---

## Contract Integration

`lib/soroban.ts` is the thin RPC layer — it builds, simulates, signs (via the connected wallet),
and submits transactions, and decodes raw `ScVal` results:

```typescript
// Mutating: builds → simulates → hands to the wallet to sign → submits → polls for the receipt
export async function invokeContract(
  source: string, contractId: string, method: string,
  args: xdr.ScVal[], signTx: (xdrBase64: string) => Promise<string>,
): Promise<string>   // returns the transaction hash

// Read-only: builds → simulates only, no signing or submission
export async function simulateReadOnly(
  source: string, contractId: string, method: string, args: xdr.ScVal[],
): Promise<xdr.ScVal>

export function scValToI128(val: xdr.ScVal): bigint
export function scValToU64(val: xdr.ScVal): bigint
```

`lib/factory.ts` and `lib/stream.ts` are per-contract wrappers built on top of those two
primitives — e.g. `stream.ts` exports `withdraw`, `cancel`, `pause`, `resume`, `topUp`,
`clawback`, `getWithdrawable`, and `getStreamInfo`, each encoding its own `ScVal` args and
calling `invokeContract`/`simulateReadOnly` with the right method name.

The RPC client itself (`lib/soroban.ts`'s `getServer()`) is a lazy singleton — these pages are
all client components, but Next still evaluates the module during static generation at build
time, before `NEXT_PUBLIC_SOROBAN_RPC_URL` is meaningful, so the client can't be constructed
eagerly at module scope.

Three DripStream functions — `forceCancel`, `transferRecipient`, `streamedTotal` — exist on the
contract but aren't wrapped in `lib/stream.ts` yet.

---

## RateTicker

The `RateTicker` component renders a live counter that increments in real time:

```tsx
<RateTicker
  ratePerSecond={stream.ratePerSecond}  // bigint, in stroops
  startBalance={stream.withdrawable}    // bigint, current withdrawable
/>
```

Every 100 ms it recalculates `withdrawable = storedWithdrawable + (now - lastFetch) * ratePerSecond` and displays the result. No contract call — pure arithmetic.

---

## Styling Rules (for contributors)

```
✓  text-black   text-white   text-gray-*
✓  bg-black     bg-white     bg-gray-*
✓  border-black border-white border-gray-*
✓  ring-black   ring-white   ring-gray-*

✗  text-blue-*  text-red-*  bg-indigo-*  (any hue-named colour)
✗  text-primary  bg-accent  (semantic aliases that resolve to colour)
```

The only exception is `text-green-600` and `text-red-600` for positive/negative balance deltas, and those must be wrapped in a `<span aria-label="...">` with a text fallback so colour is never the sole signal.

---

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md). For UI-specific conventions, read [`components/ui/README.md`](./components/ui/README.md) before adding new components. For how data and transactions actually flow through the app (including the wallet-stub caveat above), see [`docs/architecture.md`](./docs/architecture.md).

---

## License

MIT — see [`LICENSE`](./LICENSE).
