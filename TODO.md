# Fix: Transient errors silently converted to "zero allowance"

## Steps

- [x] 1. Analyze code and create plan (Plan approved by user)
- [x] 2. Edit `lib/tokens.ts` — Remove `catch { return 0n; }` from `getAllowance`, let errors propagate
- [x] 3. Update `lib/tokens.test.ts` — Update tests to expect error propagation behavior
- [x] 4. Verify tests pass — `npx vitest run lib/tokens.test.ts` — **ALL 10 TESTS PASSED**

