# Contributing to conduit-app

Thank you for helping improve the Conduit web interface. This guide covers setup, design rules, component conventions, and the PR process.

---

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Getting Started](#getting-started)
3. [Repository Layout](#repository-layout)
4. [Development Workflow](#development-workflow)
5. [Design System](#design-system)
6. [Component Conventions](#component-conventions)
7. [Contract Integration](#contract-integration)
8. [Testing](#testing)
9. [Commit Convention](#commit-convention)
10. [Pull Request Process](#pull-request-process)

---

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](./CODE_OF_CONDUCT.md). By participating you agree to uphold it. Report unacceptable behaviour to **conduct@conduit.sh**.

---

## Getting Started

### Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 20 |
| npm | ≥ 10 |
| A Stellar wallet | Freighter, xBull, Albedo, or Hana |

### Setup

```bash
git clone https://github.com/conduit-protocol/conduit-app
cd conduit-app
npm install

# Copy environment variables
cp .env.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
NEXT_PUBLIC_FACTORY_CONTRACT_ID=C...     # from conduit-contracts deploy
NEXT_PUBLIC_GOVERNOR_CONTRACT_ID=C...    # from conduit-contracts deploy
NEXT_PUBLIC_HORIZON_URL=https://horizon-testnet.stellar.org
```

> Don't have deployed contract IDs? Use the testnet deployments listed in the [conduit-contracts releases](https://github.com/conduit-protocol/conduit-contracts/releases).

Start the development server:

```bash
npm run dev
# → http://localhost:3000
```

### Type-check and lint

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint
npm test            # Vitest unit tests
npm run build       # production build (catches Next.js-specific errors)
```

---

## Repository Layout

```
conduit-app/
├── app/                         # Next.js App Router pages
│   ├── layout.tsx               # Root layout — Navbar, Providers, footer
│   ├── page.tsx                 # Landing page
│   ├── (marketing)/
│   │   └── about/page.tsx       # Protocol explainer
│   ├── streams/page.tsx         # Stream list (receiving + sending tabs)
│   ├── stream/[id]/page.tsx     # Single stream view + actions
│   ├── create/page.tsx          # Create stream form
│   └── dashboard/page.tsx       # Aggregate sender stats
├── components/
│   ├── ui/                      # Primitive design system components
│   │   ├── README.md            # ← read this before adding UI components
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Input.tsx
│   │   ├── Badge.tsx
│   │   ├── ProgressBar.tsx
│   │   └── Modal.tsx
│   ├── stream/                  # Stream-specific composed components
│   │   ├── StreamCard.tsx       # Summary card used in list
│   │   ├── StreamActions.tsx    # Role-gated action buttons
│   │   ├── StreamTimeline.tsx   # Horizontal progress timeline
│   │   ├── RateTicker.tsx       # Live per-second counter
│   │   └── WithdrawButton.tsx   # Withdraw with pending state
│   ├── ConnectButton.tsx        # Stellar Wallets Kit trigger
│   ├── Navbar.tsx
│   └── Providers.tsx            # Context providers tree
├── contexts/
│   └── WalletContext.tsx        # Wallet state, address, signTransaction
├── lib/
│   ├── soroban.ts               # Soroban RPC client + helpers
│   ├── factory.ts               # DripFactory call wrappers
│   ├── stream.ts                # DripStream call wrappers
│   ├── tokens.ts                # Known Stellar asset list
│   └── format.ts                # Amount formatting, relative time
├── tailwind.config.ts
├── next.config.ts
├── tsconfig.json
└── .env.example
```

---

## Development Workflow

```
main          ← always deployable
  └── feat/your-feature
```

1. **Fork** and clone your fork.
2. Create a branch:
   ```bash
   git checkout -b feat/my-feature
   ```
3. Make changes with frequent `npm run typecheck` checks.
4. Test in the browser — connect a Freighter wallet on testnet and walk through the flow you changed.
5. Run the full check suite:
   ```bash
   npm run typecheck && npm run lint && npm test && npm run build
   ```
6. Push and open a PR.

---

## Design System

**The Conduit app is black and white only.** This is a hard constraint, not a preference.

### Allowed colour utilities

```
text-black    text-white    text-gray-{50..950}
bg-black      bg-white      bg-gray-{50..950}
border-black  border-white  border-gray-{50..950}
ring-black    ring-white    ring-gray-{50..950}
```

### Prohibited

```
text-blue-*   text-red-*   text-green-*   text-indigo-*
bg-blue-*     bg-red-*     bg-emerald-*   bg-violet-*
Any Tailwind hue-named colour class
```

### Exceptions (must use aria-label)

`text-green-600` for positive balance deltas and `text-red-600` for negative deltas are permitted **only** when accompanied by an `aria-label` so colour is never the sole signal:

```tsx
<span className="text-green-600 font-mono" aria-label="increase">
  +{fromStroops(delta)} XLM
</span>
```

### Typography rules

- **Numbers and addresses:** always `font-mono tabular-nums`
- **Section headings:** `font-black tracking-tight`
- **Labels and metadata:** `text-xs text-gray-400`
- **Borders:** prefer `border-gray-100` for containers, `border-black` for interactive focus states

### Spacing

- Page containers: `max-w-3xl mx-auto px-4`
- Vertical rhythm between sections: `mb-10` or `mb-16`
- Card padding: `p-4` or `p-6`

See [`components/ui/README.md`](./components/ui/README.md) for the full component API.

---

## Component Conventions

### Server vs Client components

Next.js App Router defaults to Server Components. Use `'use client'` only when the component needs:
- Browser APIs (`window`, `navigator`, `requestAnimationFrame`)
- React state (`useState`, `useEffect`, `useReducer`)
- Event handlers
- Context consumers

Keep data fetching in Server Components and push interactivity as far down the tree as possible.

### Naming

| Pattern | Example |
|---------|---------|
| Page components | `app/streams/page.tsx` → default export |
| UI primitives | `components/ui/Button.tsx` → named export `Button` |
| Feature components | `components/stream/StreamCard.tsx` → named export `StreamCard` |
| Hooks | `hooks/useStream.ts` → named export `useStream` |
| Lib helpers | `lib/format.ts` → named exports |

### Props interfaces

Define prop types as named interfaces directly above the component:

```tsx
interface StreamCardProps {
  id:            string;
  counterparty:  string;
  role:          'sender' | 'recipient';
  // ...
}

export function StreamCard({ id, counterparty, role }: StreamCardProps) {
  // ...
}
```

Do not use inline `React.FC<{...}>` — it hides the component name in stack traces.

### Loading states

Every data-fetching component must handle a loading state. Use a skeleton that mirrors the shape of the loaded content:

```tsx
if (loading) {
  return (
    <div className="card animate-pulse">
      <div className="h-4 bg-gray-100 rounded w-1/2 mb-2" />
      <div className="h-3 bg-gray-100 rounded w-1/3" />
    </div>
  );
}
```

### Error states

Display errors inline, never `alert()`. Use a simple bordered container:

```tsx
if (error) {
  return (
    <div className="border border-gray-200 p-4 text-sm text-gray-500">
      {error.message}
    </div>
  );
}
```

---

## Contract Integration

All Soroban calls go through `lib/soroban.ts` and the wrappers in `lib/stream.ts` / `lib/factory.ts`. Do not import `@stellar/stellar-sdk` directly in page or component files.

**Read-only calls** (simulation only):

```typescript
// lib/stream.ts
export async function getWithdrawable(source: string, streamAddress: string): Promise<bigint>
export async function getStreamInfo(source: string, streamAddress: string): Promise<StreamInfo>
```

**Mutating calls** (require `signTx` from `WalletContext`):

```typescript
// lib/stream.ts — signTx is (xdrBase64: string) => Promise<string>
export async function withdraw(sender, streamAddress, amount, signTx): Promise<string>
export async function cancel(sender, streamAddress, signTx): Promise<string>
```

Transactions are assembled client-side via Soroban simulation, signed by the user's wallet, and submitted to the RPC. Never hard-code a secret key.

---

## Testing

We use [Vitest](https://vitest.dev) for unit tests. Integration / E2E tests are not yet in scope.

### What to test

- Pure utility functions in `lib/format.ts` and `lib/tokens.ts`
- Any non-trivial conditional logic in components (test the logic, not the rendering)

### What not to test

- Styling — visual review in the browser
- Soroban RPC calls — mock at the `lib/soroban.ts` boundary

### Running tests

```bash
npm test                       # run once
npm run test:watch             # watch mode
npx vitest run --coverage      # with coverage report
```

---

## Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>
```

**Types:** `feat`, `fix`, `refactor`, `style`, `test`, `docs`, `chore`, `perf`

**Scopes:** `dashboard`, `streams`, `stream`, `create`, `ui`, `wallet`, `lib`, `layout`, `ci`, `deps`

**Examples:**

```
feat(dashboard): add aggregate flow rate stat card

fix(stream): handle cancelled state in RateTicker — return 0 immediately

refactor(ui): extract SkeletonCard into shared component

style(create): align form labels with 12px grid

test(lib): add edge cases for fromStroops with zero and max i128

chore(deps): bump next to 15.2.1
```

---

## Pull Request Process

### Checklist before opening

- [ ] `npm run typecheck` — no errors
- [ ] `npm run lint` — no warnings
- [ ] `npm test` — all tests pass
- [ ] `npm run build` — production build succeeds
- [ ] Tested in the browser with a connected Freighter wallet on testnet
- [ ] No hue-named colour classes introduced
- [ ] Loading and error states handled for any new data-fetching UI
- [ ] `CHANGELOG.md` entry added under `[Unreleased]`

### Review requirements

- At least **1 approval** from a maintainer.
- PRs changing `lib/soroban.ts` or `contexts/WalletContext.tsx` require **2 approvals** — these are critical security boundaries.

### Screenshots

For any visible UI change, include before/after screenshots in the PR description.

---

## License

By contributing you agree that your contributions will be licensed under the [MIT License](./LICENSE).
