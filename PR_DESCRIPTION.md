# Bug Fixes: Timeout Leak, Stroops Formatting, and Mutex Leak

## Summary

This PR fixes three critical bugs in the streamFi-app:

- **#275**: Fixed CopyHashButton timeout leak on unmount
- **#274**: Fixed StreamCard.tsx stroops formatting to use shared fromStroops function
- **#273**: Fixed TokenAllowanceGateway mutex leak when concurrency slot acquisition fails

## Changes

### #275 - CopyHashButton timeout leak
- Added `useRef` to track timeout ID
- Added `useEffect` cleanup to clear timeout on unmount
- Added mounted ref check to prevent state updates on unmounted component
- Clears existing timeout before setting new one to prevent stacking

### #274 - StreamCard.tsx stroops formatting
- Replaced inline `Number(ratePerSecond) / 1e7).toFixed(4)` with shared `fromStroops(ratePerSecond)` from `lib/format.ts`
- Eliminates precision loss for large rates
- Ensures consistent formatting across the application
- Added `fromStroops` to imports

### #273 - TokenAllowanceGateway mutex leak
- Moved mutex and concurrency slot acquisitions inside the try block
- Changed release functions to optional chaining in finally block
- Prevents permanent deadlock when concurrency slot acquisition is aborted
- Ensures proper cleanup even if acquisition fails

## Testing

All changes follow existing patterns in the codebase:
- CopyHashButton uses the same mounted ref pattern as StreamActions.tsx
- StreamCard now uses the shared fromStroops function like other components
- TokenAllowanceGateway ensures proper resource cleanup in all error paths

## Closes

Closes #275, #274, #273
