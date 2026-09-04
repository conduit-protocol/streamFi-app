# Environment Variables Reference

This document lists all `NEXT_PUBLIC_*` environment variables used by the Conduit app, their default values, and whether empty values enable demo mode.

## Quick Reference

| Variable | Required | Default | Empty Enables Demo Mode | Description |
|----------|----------|---------|------------------------|-------------|
| `NEXT_PUBLIC_SOROBAN_RPC_URL` | Yes | `https://soroban-testnet.stellar.org` | No | Soroban RPC endpoint |
| `NEXT_PUBLIC_NETWORK_PASSPHRASE` | Yes | `Test SDF Network ; September 2015` | No | Stellar network passphrase |
| `NEXT_PUBLIC_FACTORY_CONTRACT_ID` | Yes* | (empty) | No | Deployed factory contract address |
| `NEXT_PUBLIC_GOVERNOR_CONTRACT_ID` | No | (empty) | No | Deployed governor contract address |
| `NEXT_PUBLIC_HORIZON_URL` | No | `https://horizon-testnet.stellar.org` | No | Horizon server for account info |
| `NEXT_PUBLIC_SOROBAN_FEE_MULTIPLIER` | No | `2` | No | Fee multiplier for contract transactions |
| `NEXT_PUBLIC_DEMO_MODE` | No | (empty) | **Yes** | When set to `"true"`, enables demo mode with mock data |

\* Required unless `NEXT_PUBLIC_DEMO_MODE=true`

---

## Detailed Descriptions

### `NEXT_PUBLIC_SOROBAN_RPC_URL`

**Required:** Yes  
**Default:** `https://soroban-testnet.stellar.org`

The Soroban RPC endpoint URL. This is used for all contract interactions (read-only simulations and mutating transactions).

```env
NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
```

**Error when missing:** `Missing required environment variable: NEXT_PUBLIC_SOROBAN_RPC_URL`

---

### `NEXT_PUBLIC_NETWORK_PASSPHRASE`

**Required:** Yes  
**Default:** `Test SDF Network ; September 2015`

The Stellar network passphrase. Must match the network your contracts are deployed to.

- **Testnet:** `Test SDF Network ; September 2015`
- **Mainnet:** `Public Global Stellar Network ; September 2015`

```env
NEXT_PUBLIC_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
```

**Error when missing:** `Missing required environment variable: NEXT_PUBLIC_NETWORK_PASSPHRASE`

---

### `NEXT_PUBLIC_FACTORY_CONTRACT_ID`

**Required:** Yes (unless `NEXT_PUBLIC_DEMO_MODE=true`)  
**Default:** (empty)

The deployed DripFactory contract address. This is the entry point for all stream operations. You can find testnet deployments in the [conduit-contracts releases](https://github.com/conduit-protocol/conduit-contracts/releases).

```env
NEXT_PUBLIC_FACTORY_CONTRACT_ID=C...     # from conduit-contracts deploy
```

**Error when missing (and not in demo mode):** `NEXT_PUBLIC_FACTORY_CONTRACT_ID is not set. Set it in .env.local, or set NEXT_PUBLIC_DEMO_MODE=true to run in demo mode with fake data.`

---

### `NEXT_PUBLIC_GOVERNOR_CONTRACT_ID`

**Required:** No  
**Default:** (empty)

The deployed Governor contract address. Reserved for a future governor-config view. Currently not used by any contract calls.

```env
NEXT_PUBLIC_GOVERNOR_CONTRACT_ID=C...    # from conduit-contracts deploy
```

---

### `NEXT_PUBLIC_HORIZON_URL`

**Required:** No  
**Default:** `https://horizon-testnet.stellar.org`

Horizon server URL for classic account balance lookups. Only used for display purposes (balance queries), not required for Soroban contract interactions.

```env
NEXT_PUBLIC_HORIZON_URL=https://horizon-testnet.stellar.org
```

---

### `NEXT_PUBLIC_SOROBAN_FEE_MULTIPLIER`

**Required:** No  
**Default:** `2`  
**Valid Range:** `1` to `10`

Multiplier applied over the network's observed inclusion fee when building contract transactions. A value of `2` means the app bids 2x the observed inclusion fee.

- Values outside the `[1, 10]` range are rejected with a warning and the default is used
- Non-numeric or non-positive values are rejected with a warning
- A value like `200` (meant as `2.00`) would overbid every transaction

```env
NEXT_PUBLIC_SOROBAN_FEE_MULTIPLIER=2
```

---

### `NEXT_PUBLIC_DEMO_MODE`

**Required:** No  
**Default:** (empty)  
**Enables Demo Mode:** Yes, when set to `"true"`

When set to `"true"`, the app runs in demo mode with mock data. No real contract calls are made. This is useful for development and testing without deployed contracts.

```env
NEXT_PUBLIC_DEMO_MODE=true
```

**Important:** When `NEXT_PUBLIC_DEMO_MODE` is not set or empty, the app requires a valid `NEXT_PUBLIC_FACTORY_CONTRACT_ID`. Empty values do NOT enable demo mode — only the explicit string `"true"` does.

---

## Demo Mode

Demo mode is enabled **only** when `NEXT_PUBLIC_DEMO_MODE=true`. When enabled:

- Mock stream data is used instead of real contract calls
- No Soroban RPC connection is required
- The app can run without deployed contracts

To enable demo mode:

```env
NEXT_PUBLIC_DEMO_MODE=true
NEXT_PUBLIC_FACTORY_CONTRACT_ID=  # Can be empty in demo mode
```

---

## Local Development Setup

1. Copy the example file:
   ```bash
   cp .env.example .env.local
   ```

2. Edit `.env.local` with your values:
   ```env
   NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
   NEXT_PUBLIC_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
   NEXT_PUBLIC_FACTORY_CONTRACT_ID=C...     # from conduit-contracts deploy
   NEXT_PUBLIC_GOVERNOR_CONTRACT_ID=C...    # from conduit-contracts deploy
   NEXT_PUBLIC_HORIZON_URL=https://horizon-testnet.stellar.org
   NEXT_PUBLIC_SOROBAN_FEE_MULTIPLIER=2
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

---

## CI/CD Environment Variables

For CI/CD pipelines, set these variables in your GitHub repository secrets or environment variables:

- `NEXT_PUBLIC_SOROBAN_RPC_URL`
- `NEXT_PUBLIC_NETWORK_PASSPHRASE`
- `NEXT_PUBLIC_FACTORY_CONTRACT_ID`
- `NEXT_PUBLIC_GOVERNOR_CONTRACT_ID`
- `NEXT_PUBLIC_HORIZON_URL` (optional)
- `NEXT_PUBLIC_SOROBAN_FEE_MULTIPLIER` (optional)
- `NEXT_PUBLIC_DEMO_MODE` (set to `"true"` for preview deployments)

The CI workflow (`.github/workflows/ci.yml`) passes these variables at build time.
