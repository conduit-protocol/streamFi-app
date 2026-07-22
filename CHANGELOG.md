# Changelog

All notable changes are documented here. Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- `/transactions` — responsive transaction history page (card layout on mobile, table on desktop)
- Demo data layer — pages render without deployed contracts when env vars are empty

### Changed
- Stream cards responsive layout with truncated addresses and progress indicator
- `/stream/[id]/history` — event log tab showing all past withdrawals, pauses, and top-ups
- Mobile layout improvements for stream detail page
- `force_cancel()` action in `StreamActions` for recipients (once contract support is merged)

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
