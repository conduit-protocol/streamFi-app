# Changelog

All notable changes are documented here. Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Create form warns when the recipient is a contract (`C…`) address and blocks submit until the
  user confirms the contract can call `withdraw()` — a SAC, token contract, or vault without that
  call path would otherwise lock the whole deposit with no client-side warning
- `/transactions` — responsive transaction history page (card layout on mobile, table on desktop)
- Demo data layer — pages render without deployed contracts when env vars are empty

### Changed
- One shared `withTimeout` in `lib/with-timeout.ts` replaces the three near-identical copies that
  had drifted apart in `app/create/page.tsx`, `contexts/WalletContext.tsx` and `lib/soroban.ts`;
  the shared helper is `AbortSignal`-aware, validates its deadline, and never leaves an abort
  listener behind. Operation error types moved to `lib/errors.ts` (re-exported from
  `lib/safe-operations.ts`, so existing imports are unchanged)
- Stream cards responsive layout with truncated addresses and progress indicator
- `/stream/[id]/history` — event log tab showing all past withdrawals, pauses, and top-ups
- Mobile layout improvements for stream detail page
- `force_cancel()` action in `StreamActions` for recipients (once contract support is merged)

### Fixed
- Wallet session reads now prefer the in-memory fallback over stale localStorage values when storage writes fail
- ErrorBoundary schedules circuit-breaker recovery after committed updates instead of during render
- Settings persistence now ignores unavailable localStorage writes and skips the initial re-write on mount
- Local network token lookup no longer returns testnet contract addresses when local tokens are not configured
- `refreshStreamData` now invalidates active queries once instead of immediately refetching the same queries a second time
- Removed the unused multisig transaction scaffold, which had no callers or tests and discarded the clipboard success result
- `scValToU64`/`scValToI128` and `streamsBySender`/`streamsByRecipient` now boundary-check the RPC
  response shape instead of trusting it blindly; the streams list surfaces load failures inline
  instead of silently logging to console
- Fixed a `Mutex` scoping bug in `WalletContext` that broke the TypeScript build outright; connect()
  attempts superseded while waiting on the mutex are now cancelled instead of running their turn
- `useTransactionStore` no longer grows without bound — terminal transactions are pruned once
  retained history exceeds 20 entries
- `BatchStreamCreator` cancels its pending submission on unmount instead of leaving it running
  against a detached component, and no longer uses `alert()` for error display
- `WalletContext` now watches for wallet/account changes in the Freighter extension itself
  (via `WatchWalletChanges`); switching accounts without clicking Disconnect no longer leaves
  `publicKey` and cached stream/dashboard/transaction data pointed at the previous account, and
  a locked extension or revoked site access now disconnects the app instead of leaving it in a
  stale "connected" state

---

## [0.2.0] - 2026-04-08

### Added
- `StreamActions` component — role-gated action panel (withdraw, pause, resume, cancel, top-up, clawback) with modal for top-up amount entry and per-button loading states
- `StreamTimeline` component — horizontal timeline showing stream origin, current position, and end with elapsed percentage label and pause-state marker
- Stream detail page (`/stream/[id]`) fully wired: real RPC data, live `RateTicker`, `StreamTimeline`, `StreamActions`, auto-refresh after each action
- Create page (`/create`) form submission wired to `DripFactory.create_stream` with success redirect to `/stream/[id]`
- Streams page (`/streams`) tabbed receiving/sending list with loading skeleton and empty-state CTAs
- Dashboard page (`/dashboard`) wired to wallet and factory: aggregate active count, total streamed, combined flow rate, unique counterparties

### Changed
- `RateTicker` now uses `requestAnimationFrame` for sub-second updates rather than `setInterval`
- Dashboard stats no longer show `—` when wallet is connected; replaced with loading skeleton during fetch

---

## [0.1.0] - 2026-02-21

### Added
- Next.js 15 App Router scaffold with Stellar Wallets Kit integration
- Landing page with feature grid and use-case list
- `WalletContext` with connect/disconnect, address, and `signTransaction` helper
- `Navbar` with connect button and active-route highlighting
- UI primitives: `Button`, `Card`, `Input`, `Badge`, `ProgressBar`, `Modal`
- `StreamCard` component for list views
- `RateTicker` component (initial version — `setInterval` based)
- `WithdrawButton` with pending state
- Soroban RPC helpers in `lib/soroban.ts`: `simulateReadOnly`, `invokeContract`, `scValToI128`, `scValToU64`
- DripStream call wrappers: `getStreamAddress`, `getWithdrawable`, `getStreamInfo`, `withdraw`, `cancel`, `pause`, `resume`, `topUp`, `clawback`
- Black-and-white Tailwind config with `font-mono tabular-nums` for all numeric display
