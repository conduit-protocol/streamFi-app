# Dependency Audit Exceptions

The CI `audit` job runs `npm audit --audit-level=high` on every PR.
It fails on any **high** or **critical** vulnerability with no accepted exception.

---

## How to handle a finding you cannot immediately fix

1. **Check for an upstream fix first.**
   Run `npm audit` locally and follow the suggested remediation.
   If `npm audit fix` resolves it without breaking changes, apply it.

2. **If no fix is available yet**, document the exception here and suppress it
   in CI by adding the advisory ID to the `--ignore-advisory` list in
   `.github/workflows/ci.yml`:

   ```yaml
   # .github/workflows/ci.yml — audit job
   - name: Audit dependencies (high/critical)
     run: npm audit --audit-level=high --ignore-advisory 1234567
   ```

3. **Fill in a row in the table below** for every ignored advisory.

---

## Accepted exceptions

> The following advisories exist in the project's current dependency tree but
> cannot be resolved without breaking changes (e.g. upgrading to a semver-major
> next.js or stellar-sdk release). They are tracked here for visibility and
> must be reviewed on or before the date shown.

| Advisory ID | Package | Severity | Reason | Review by |
|-------------|---------|----------|--------|-----------|
| [GHSA-7m27-7ghc-44w9](https://github.com/advisories/GHSA-7m27-7ghc-44w9) | `next@15.0.0` | critical | DoS via Server Actions — fix requires upgrading next to ≥15.5.x; scheduled for next deps update cycle | 2026-12-24 |
| [GHSA-3h52-269p-cp9r](https://github.com/advisories/GHSA-3h52-269p-cp9r) | `next@15.0.0` | critical | Info exposure in dev server — only affects local development, not production deployments | 2026-12-24 |
| [GHSA-g5qg-72qw-gw5v](https://github.com/advisories/GHSA-g5qg-72qw-gw5v) | `next@15.0.0` | critical | Cache key confusion in image optimization — fix requires upgrading next; tracked issue | 2026-12-24 |
| [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93) | `postcss` (via `next`) | high | XSS in CSS stringify — build-time only, not exploitable at runtime | 2026-12-24 |
| [GHSA-6g55-p6wh-862q](https://github.com/advisories/GHSA-6g55-p6wh-862q) | `postcss` (via `next`) | high | File read via sourceMappingURL — build-time only, not exploitable at runtime | 2026-12-24 |
| [GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj) | `sharp` (via `next`) | high | libvips inherited CVEs — fix requires upgrading next; sharp is used only for Image Optimization | 2026-12-24 |
| [GHSA-82x6-q7mm-w9cf](https://github.com/advisories/GHSA-82x6-q7mm-w9cf) | `toml` (via `@stellar/stellar-sdk`) | high | Uncontrolled recursion — no upstream fix available yet; used only for config parsing | 2026-12-24 |
| [GHSA-v5mp-jgw5-2x6j](https://github.com/advisories/GHSA-v5mp-jgw5-2x6j) | `toml` (via `@stellar/stellar-sdk`) | high | Prototype pollution — no upstream fix available; monitored via stellar-sdk release notes | 2026-12-24 |

> **Note:** The `@vitest/mocker` and `esbuild` moderate advisories do not
> block CI (below the high threshold) but are noted here for completeness.
> Resolving them requires upgrading vitest to v5, which is a breaking change;
> see issue #531 for the tracking work.

---

## Guidelines

- **Severity threshold:** CI fails on `high` and `critical`. `moderate` and
  below are reported but do not block merge.
- **Review cadence:** Exceptions must be reviewed every **90 days**.
  If the `Review by` date passes without a resolution, reopen the tracking
  issue and escalate.
- **Never ignore a critical finding** in a path reachable by user-supplied
  input without explicit sign-off from a maintainer.
- **Transitive-only findings:** Even if the vulnerable code path is not
  reachable, document the reasoning — a future refactor might make it
  reachable.

---

## References

- [npm audit docs](https://docs.npmjs.com/cli/v10/commands/npm-audit)
- [GitHub Advisory Database](https://github.com/advisories)
