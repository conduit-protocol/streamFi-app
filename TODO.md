# Hydration Mismatch Fix — Task Tracking

## Task: Fix hydration mismatch error on the main dashboard page

### Steps:

- [x] Step 0: Analyze codebase and identify root cause
- [x] Step 1: Get user approval on the plan
- [x] Step 2: Fix `lib/format.ts` — Make `formatTimestamp()` deterministic by passing explicit `'en-US'` locale
- [x] Step 3: Fix `components/stream/StreamTimeline.tsx` — Use `useEffect` + `useState` to make `Date.now()` client-only
- [x] Step 4: Fix `app/dashboard/page.tsx` — Guard `deriveStatus`/`deriveProgress` with `useEffect` to avoid hydration mismatch
- [x] Step 4b: Fix `app/streams/page.tsx` — Same pattern as dashboard (duplicate code)
- [x] Step 5: Verify the fix — typecheck, lint, and tests (in progress...)
- [x] Step 6: Generate PR description and write to `pr.md`

## Summary

### Root Cause

The hydration mismatch on the dashboard page was caused by two issues:

1. **`formatTimestamp()` in `lib/format.ts`** used `toLocaleString(undefined, ...)` which is locale-dependent. Node.js (server) may default to `en-US` while the browser uses the user's system locale, producing different formatted strings.

2. **`StreamTimeline.tsx`** called `Math.floor(Date.now() / 1000)` **during component render** rather than inside a `useEffect`. This computed a different timestamp on the server (during SSR/prerendering) vs. the client (during hydration), causing React's hydration to fail.

3. **`DashboardPage` and `StreamsPage`** used `deriveStatus()` and `deriveProgress()` functions that called `Date.now()` internally (rather than accepting it as a parameter), making the time dependency implicit and harder to control.

### Fixes Applied

1. **`lib/format.ts`** — Changed `toLocaleString(undefined, ...)` to `toLocaleString('en-US', ...)` for deterministic SSR output.

2. **`components/stream/StreamTimeline.tsx`** — Moved `Date.now()` into `useEffect` + `useState`, initializing with `startTime` (0% progress) for SSR, then updating to real time after hydration. Added a 10-second refresh interval.

3. **`app/dashboard/page.tsx`** & **`app/streams/page.tsx`** — Refactored `deriveStatus` and `deriveProgress` to accept `now` as an explicit parameter. The `Date.now()` call is now made once inside `useEffect` and passed to `loadRows`.
