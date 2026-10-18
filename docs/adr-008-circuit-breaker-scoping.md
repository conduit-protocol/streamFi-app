# ADR-008: Per-Endpoint Circuit-Breaker Scoping

## Status

Accepted — implemented in [#344](https://github.com/conduit-protocol/streamFi-app/issues/344).

## Context

`lib/soroban.ts` previously kept `consecutiveFailures` and `circuitOpenUntil` as module-level mutable state shared across every contract call from every component. This caused two problems:

1. **Cross-traffic contamination.** A few failing read-only simulations could open the breaker and then block unrelated write transactions (withdraw, cancel) for 10+ seconds.
2. **Sticky state across network changes.** The breaker was never reset on wallet disconnect or network switch, so a breaker opened on testnet stayed open after switching to mainnet.

## Decision

Scope circuit-breaker state per endpoint and expose an explicit reset API that is invoked on wallet disconnect and network switch.

### Scope key format

The breaker key is derived from the current RPC URL plus an optional scope suffix:

```text
${rpcUrl}::${scope}
```

When no scope is supplied the key falls back to the RPC URL alone. This allows both global per-RPC isolation and finer-grained isolation when a caller supplies a scope.

### State representation

Breaker state is stored in a module-level `Map<string, CircuitState>`:

```ts
interface CircuitState {
  consecutiveFailures: number;
  circuitOpenUntil: number;
}
```

Each entry is lazy-created on first failure for a given key and deleted on explicit reset.

### Failure threshold and open window

- Transport failures are recorded per scope.
- After **three consecutive transport failures**, the breaker opens.
- The open window grows exponentially:

```text
openMs = 10_000 * 2^(consecutiveFailures - 3) + jitter
jitter = random(0, 0.3 * base)
```

For example:

| Consecutive failures | Base window | With max jitter |
|---------------------:|------------:|----------------:|
| 3                    | 10 s        | ~13 s           |
| 4                    | 20 s        | ~26 s           |
| 5                    | 40 s        | ~52 s           |

### What counts as a transport failure

Only RPC/network-level failures count toward the breaker:

- Timeout / timed out
- Network / fetch errors
- `ECONNREFUSED`, `ECONNRESET`, socket errors
- HTTP 5xx responses
- Service Unavailable / Bad Gateway

**On-chain reverts do not count.** `TransactionRevertedError` is explicitly excluded because the RPC worked; the contract simply rejected the transaction.

### Reset behavior

`resetCircuitBreaker(scope?)` clears breaker state:

- With a scope argument, it deletes that scope plus any keys nested under it.
- With no argument, it clears all breakers.
- It also calls `reportRpcSuccess()` so the global "network trouble" banner is dismissed.

The wallet context calls this reset on disconnect and whenever the active network changes.

## Consequences

- A failing read-only simulation on the dashboard can no longer block a withdrawal submission, because reads and writes use different scopes.
- Switching networks or disconnecting the wallet starts with a clean breaker, eliminating stale testnet state on mainnet.
- The exponential backoff still protects the RPC endpoint from aggressive retry storms.
- Callers must continue to use distinct scopes when they want isolation; sharing a scope reintroduces the original coupling.

## Related

- Issue [#344](https://github.com/conduit-protocol/streamFi-app/issues/344) — original problem statement.
- `lib/soroban.ts` — implementation.
- `lib/network-status.ts` — global RPC health banner.
