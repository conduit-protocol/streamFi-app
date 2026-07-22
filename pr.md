# Fix hydration mismatch error on the main dashboard page

Close # (I'll add the issue number here)

## Summary of the issue

A React hydration mismatch error appeared in the browser console when loading the main dashboard page (`/dashboard`). The error was caused by server-rendered HTML containing timestamp-dependent content that didn't match what the client produced during hydration. This is a common Next.js pitfall when `Date.now()`, `new Date()`, or locale-aware formatting functions (`toLocaleString`) are used during component render rather than being deferred to the client via `useEffect`.

## Root cause

Two distinct issues contributed to the mismatch:

1. **`formatTimestamp()` in `lib/format.ts`** used `toLocaleString(undefined, ...)` — the `undefined` locale parameter means "use the system default locale." During SSR, Node.js may default to `en-US`, while the browser uses the user's operating system locale (e.g., `de-DE`, `fr-FR`). This produces different formatted date strings (e.g., "Jul 4, 2025" vs. "4. Juli 2025"), causing React to detect a mismatch on hydration.

2. **`StreamTimeline.tsx`** called `Math.floor(Date.now() / 1000)` **directly during component render** — not inside a lifecycle hook like `useEffect`. This computed one timestamp on the server (at SSR time / build time) and a different one on the client (at hydration time). The progress bar percentage, pause marker position, and even the conditional rendering of certain elements could differ between server and client.

3. **`app/dashboard/page.tsx` and `app/streams/page.tsx`** used `deriveStatus()` and `deriveProgress()` helper functions that called `Date.now()` implicitly inside the function body. While these particular calls happened inside `useEffect` (client-only), the implicit dependency on `Date.now()` made the code harder to reason about and could cause subtle mismatches if the functions were ever called during SSR in the future.

## Solution implemented

### 1. `lib/format.ts` — Make `formatTimestamp` deterministic

Changed `toLocaleString(undefined, ...)` → `toLocaleString('en-US', ...)` so that the server and client always use the same locale. This ensures the formatted date string is identical between SSR and client hydration.

### 2. `components/stream/StreamTimeline.tsx` — Defer `Date.now()` to `useEffect`

- Moved the `Date.now()` computation from render-time to a `useEffect` hook.
- Initialize `now` state with `startTime` (resulting in 0% progress on the initial SSR render) — both server and client agree on this value.
- After hydration, the `useEffect` immediately updates `now` to `Math.floor(Date.now() / 1000)`, and a 10-second `setInterval` keeps it current.
- The progress bar now "snaps" to the correct position after hydration instead of being computed during SSR.

### 3. `app/dashboard/page.tsx` and `app/streams/page.tsx` — Explicit `now` parameter

- Refactored `deriveStatus(info)` → `deriveStatus(info, now)` and `deriveProgress(info)` → `deriveProgress(info, now)`.
- Added a `now` parameter to `loadRows(publicKey, role, now)`.
- The `Date.now()` call is now made once inside the `useEffect` callback and explicitly passed through, making the time dependency explicit and ensuring both `loadRows` calls use the same timestamp.

## Key changes made

| File                                   | Change                                                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `lib/format.ts`                        | `toLocaleString(undefined, ...)` → `toLocaleString('en-US', ...)`                                                         |
| `components/stream/StreamTimeline.tsx` | Replaced render-time `Date.now()` with `useEffect` + `useState` pattern; initial state = `startTime` for SSR safety       |
| `app/dashboard/page.tsx`               | Added explicit `now` parameter to `deriveStatus`, `deriveProgress`, `loadRows`; pass `Date.now()` from inside `useEffect` |
| `app/streams/page.tsx`                 | Same pattern as dashboard (duplicate code fixed too)                                                                      |

## Trade-offs or considerations

- **Progress bar "snap"**: The `StreamTimeline` progress bar will initially render at 0% during SSR, then snap to the correct position after client hydration. This is a minor visual flash but is much better than a broken page from hydration errors. The snap happens within the first render cycle and is imperceptible.
- **10-second refresh interval**: The timeline updates every 10 seconds rather than every frame — this is intentional to avoid unnecessary re-renders. The progress bar is not an animation, just a status indicator.
- **`en-US` locale**: We lock to `en-US` for date formatting. This is a reasonable choice for an English-first application. If i18n is needed in the future, a proper solution would involve dedicated i18n tooling (e.g., `next-intl`) rather than relying on browser locale.

## Testing steps

1. **Build**: Run `npm run build` — should succeed without type errors.
2. **Lint**: Run `npm run lint` — no new warnings introduced.
3. **Tests**: Run `npm test` — existing tests for `format.ts` (formatDuration, truncateAddress, etc.) should pass. The `formatTimestamp` function isn't directly tested, but the locale change does not affect its behavior for `en-US` systems.
4. **Manual verification**:
   - Load `/dashboard` in the browser with the dev console open.
   - Confirm no React hydration warnings appear in the console.
   - Navigate to a stream detail page (`/stream/[id]`) and verify the timeline renders correctly.
   - Verify the progress bar shows the correct percentage.
5. **Browser locale test** (optional but recommended):
   - Change your browser's preferred language to `de-DE` or `fr-FR`.
   - Reload the dashboard — the timestamps should remain in `en-US` format and no hydration error should appear.

---

Please kindly review this task. If there are any corrections, improvements, adjustments, or merge conflicts that you notice regarding my implementation, I'd really appreciate your feedback. I'd also love to hear your overall review of my work on this branch. Thank you!
