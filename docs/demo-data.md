# Demo Data Layer

The app can run against mock data so UI development and local testing do not require a deployed Soroban contract or a funded wallet. This document explains how the demo mode is toggled, where the mock data lives, and how to switch to a real local setup.

## Toggling demo mode

Demo mode is controlled by a single environment variable:

```bash
NEXT_PUBLIC_DEMO_MODE=true
```

When `NEXT_PUBLIC_DEMO_MODE` is exactly `"true"`, all contract reads and writes return fake data instead of hitting the Soroban RPC. Any other value (including unset or an empty string) disables demo mode.

If demo mode is **off** and `NEXT_PUBLIC_FACTORY_CONTRACT_ID` is missing, the app throws a clear error instead of silently falling back to fake data. This prevents a misconfigured production deploy from serving mock data to real users.

## Where the mock data lives

- `lib/mock-data.ts` — static mock streams, addresses, and token definitions used while demo mode is active.
- `lib/factory.ts` — `isMock()` gates factory reads (`streamsBySender`, `streamsByRecipient`) and `createStream()` short-circuits the real RPC call.
- `lib/stream.ts` — stream reads (`getStreamAddress`, `getStreamInfo`, `getWithdrawable`, `streamedTotal`) return mock values when `isMock()` is true.
- `app/create/page.tsx` and `app/transactions/page.tsx` — also reference `isMock()` or mock IDs for UI-specific branches.

## Running with real data locally

1. Deploy the contracts locally or use the testnet deployment from `conduit-contracts/.contract-ids/<network>.json`.
2. Copy `.env.example` to `.env.local`.
3. Fill in at least:

   ```bash
   NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
   NEXT_PUBLIC_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
   NEXT_PUBLIC_FACTORY_CONTRACT_ID=<your factory contract id>
   ```

4. Make sure `NEXT_PUBLIC_DEMO_MODE` is **not** set to `true` (unset it or leave it blank).
5. Start the dev server:

   ```bash
   npm run dev
   ```

The app will now use real RPC calls. If a required env var is missing, the error message names the exact variable instead of failing deep inside a contract helper.

## Why an explicit opt-in?

Previously the app fell back to mock data whenever `NEXT_PUBLIC_FACTORY_CONTRACT_ID` was unset. This made local development convenient but also meant a missing env var in production could silently serve fake data. Requiring `NEXT_PUBLIC_DEMO_MODE=true` makes the distinction explicit: fake data is a deliberate choice, not the default fallback. See [#279](https://github.com/conduit-protocol/streamFi-app/issues/279).
