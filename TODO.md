# Wallet Connect Flow - Concurrency Fix Implementation

## Phase 1 — Atomic State Transitions & Locking in WalletContext
- [x] 1. Add `Mutex` class for transaction signing operations
- [x] 2. Implement operation queue with configurable max concurrency (default 5)
- [x] 3. Add `AbortController` integration for cancellable operations
- [x] 4. Add `pendingOperationCount` to wallet state
- [x] 5. Make `disconnect()` abort all in-flight operations and wait for graceful shutdown
- [x] 6. Add `maxConcurrentOperations` config

## Phase 2 — Precision & Error-Boundary Wrappers
- [x] 7. Add `lib/safe-operations.ts` with error normalization, safe wrappers, idempotency keys
- [x] 8. Add `safeRateToString()`, `safeToStroops()`, `safePercent()` precision utilities
- [x] 9. Wrap Soroban pipeline with abort signals, retry with backoff, circuit breaker
- [x] 10. Add idempotency key support to `invokeContract()`

## Phase 3 — Concurrency Control in Consumer Components
- [x] 11. Replace sequential 2s-delay in `BulkWithdrawButton.tsx` with `withBoundedParallel`
- [x] 12. Add abort signal propagation from UI to pipeline
- [x] 13. Add per-stream error isolation and progress tracking
- [x] 14. Update `ErrorBoundary.tsx` with circuit breaker, retry, configurable fallback

## Phase 4 — Integration Test Suite
- [ ] 15. Update WalletContext tests with 100 concurrent signTx() calls
- [ ] 16. Test disconnect() while operations are in-flight
- [ ] 17. Test abort signal propagation through pipeline
- [ ] 18. Test bulk withdraw with mixed success/failure streams
- [ ] 19. Test rate limiting and queue overflow behavior
