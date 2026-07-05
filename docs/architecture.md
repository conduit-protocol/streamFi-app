# Architecture

How data and transactions actually move through conduit-app — as the code exists today, not as
it's meant to look eventually. See the root [`README.md`](../README.md) for pages, styling rules,
and setup.

---

## Request flow

```
  Page (client component, e.g. app/stream/[id]/page.tsx)
       │
       │  useEffect on mount / dependency change
       ▼
  lib/stream.ts or lib/factory.ts   (per-contract wrapper: withdraw, cancel, streamsBySender, ...)
       │
       │  encodes args as xdr.ScVal, picks a method name
       ▼
  lib/soroban.ts
       │
       ├─ simulateReadOnly(source, contractId, method, args)   — reads, no signing
       │
       └─ invokeContract(source, contractId, method, args, signTx)   — mutations
               │
               │  build tx → simulate → assemble → signTx(xdr) → submit → poll for receipt
               ▼
          contexts/WalletContext.tsx  →  Soroban RPC  →  DripFactory / DripStream contract
```

Every page owns its own data fetching — there's no shared cache or query library (no SWR /
React Query / Redux). Each page does `useState` + `useEffect(() => { load...() }, [deps])`
directly against the `lib/*.ts` wrappers, and re-derives things like stream status
(`active`/`paused`/`ended`/`cancelled`) and progress percentage from the raw `StreamInfo` on
every render (see `deriveStatus`/`deriveProgress` in `app/dashboard/page.tsx` — duplicated in
`app/streams/page.tsx`, since there's no shared hook for it yet).

The one thing that *doesn't* go through this chain is `RateTicker`: it takes the
`withdrawable`/`ratePerSecond` values already fetched by the page and extrapolates the display
value client-side every 100ms (`balance + elapsed * rate`). It never calls the contract — the
real value is only re-synced when the parent page re-fetches.

---

## Why `lib/soroban.ts`'s RPC client is a lazy singleton

```ts
let serverInstance: SorobanRpc.Server | undefined;
function getServer(): SorobanRpc.Server {
  if (!serverInstance) serverInstance = new SorobanRpc.Server(RPC_URL, { ... });
  return serverInstance;
}
```

Every page that touches the chain is a `'use client'` component, so in principle the RPC client
is only ever needed in the browser. But Next.js's build step still statically prerenders these
pages' initial HTML on the server, which means it evaluates their module graph — including
`lib/soroban.ts` — during `next build`, before real env vars are configured. Constructing the
`SorobanRpc.Server` eagerly at module scope crashed every production build (it rejects a
non-`https://` / empty RPC URL). Making it a lazily-constructed singleton means the constructor
only runs the first time a page actually calls `invokeContract`/`simulateReadOnly`, which never
happens during static generation.

---

## Wallet integration is stubbed — read this before building on top of mutations

`contexts/WalletContext.tsx` provides the shape (`publicKey`, `connected`, `connect`,
`disconnect`, `signTx`) the rest of the app depends on, but none of it talks to a real wallet:

- `connect()` sets a hardcoded fake address (`GABC1234STUBWALLET...`) instead of opening Stellar
  Wallets Kit's modal.
- `signTx(xdr)` logs the XDR and returns it **unchanged** — no signature is ever added.
- `@stellar/wallet-kit` isn't a dependency yet.

Practical effect: `invokeContract()`'s pipeline (build → simulate → `signTx` → submit) runs all
the way to network submission, but the submitted transaction is unsigned and will be rejected by
the network. Read-only paths (`simulateReadOnly` — balances, stream lists, `/streams`,
`/dashboard`) work end-to-end against testnet today; every mutating action (withdraw, cancel,
pause, resume, top-up, clawback, create) does not, until `WalletContext.tsx`'s `connect()`/
`signTx()` TODOs are replaced with real Stellar Wallets Kit calls.

---

## Component composition

| Page | Composes |
|------|----------|
| `/streams` | `StreamCard` (one per stream, sender + recipient tabs) |
| `/stream/[id]` | `StreamTimeline` (progress viz) + `StreamActions` (role-gated buttons) + `WithdrawButton` + `RateTicker` |
| `/dashboard` | `StreamCard` + aggregate totals computed inline from all fetched streams |
| `/create` | Form built directly with `react-hook-form` + `zod`; no separate form component |
| every page | `Navbar` (via root layout) → `ConnectButton` → `useWallet()` |

`StreamActions` gates which buttons render by role (`isSender`/`isRecipient`) and by status
(`isActive`/`isPaused`/`canAct`), and funnels every mutating call through a local `run(name, fn)`
helper that tracks a single `pending` state so only one action can be in flight at a time.

---

## Testing

`lib/format.ts` has a real unit test suite (`lib/format.test.ts`, run via `npm test` / Vitest).
Nothing else in the app — components, page data-fetching, `lib/soroban.ts`, `lib/stream.ts`,
`lib/factory.ts` — has test coverage yet. `lib/format.ts` was a natural first target since it's
pure functions with no Next.js/DOM/network dependency; testing the rest would need component
tests (React Testing Library) and mocked RPC responses, neither of which is set up.
