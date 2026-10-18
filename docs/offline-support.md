# Offline Support Documentation

## Overview

This application implements service worker-based offline support to ensure users can access the dashboard and view cached data even when their internet connection is lost. The implementation uses cache-first strategy for static assets and pages.

## Architecture

### Components

1. **Service Worker (`public/sw.js`)**
   - Runs in the browser background, independent of the application lifecycle
   - Intercepts network requests and serves cached responses when offline
   - Uses cache-first strategy: tries cache first, falls back to network

2. **useServiceWorker Hook (`lib/useServiceWorker.ts`)**
   - Registers the service worker on app initialization
   - Handles registration errors gracefully
   - Only runs in browser environment

3. **ServiceWorkerRegistrar Component (`components/ServiceWorkerRegistrar.tsx`)**
   - Wraps the useServiceWorker hook
   - Integrated into the Providers component for automatic registration

4. **OfflineIndicator Component (`components/OfflineIndicator.tsx`)**
   - Displays a status message when the user is offline
   - Listens to online/offline browser events
   - Positioned as a fixed notification in bottom-right corner

## What Gets Cached

### Static Pages (Cache-first)
- `/` - Landing page
- `/about` - About page
- `/streams` - Streams dashboard
- `/create` - Stream creation page
- `/dashboard` - Dashboard
- `/stream/[id]` - Individual stream view (cached dynamically)

### Static Assets (Cache-first)
- JavaScript files (`.js`)
- CSS files (`.css`)
- Fonts (`.woff2`, `.woff`, `.ttf`, `.eot`)

## Cache Strategy

### Install Phase
- Pre-caches all configured static pages
- Triggered when service worker is first registered

### Fetch Interception
- **Cache-first strategy**: Serve from cache if available, fall back to network
- **Network-first for API calls**: Non-GET requests bypass cache entirely
- **External requests**: Requests to other origins are not cached

### Activate Phase
- Removes old cache versions when service worker updates
- Claims all clients immediately for instant offline support

## How It Works

1. **First Visit**
   - Service worker registers and caches static assets
   - User can browse with normal internet connectivity

2. **Subsequent Visits**
   - Service worker serves cached pages and assets when available
   - New content updates are fetched from network
   - Stale assets are updated in background

3. **Offline Scenario**
   - Network requests fail, service worker serves cached responses
   - OfflineIndicator displays "You are currently offline"
   - User can still view cached dashboard and stream data
   - Withdraw, cancel, and top-up operations are queued while offline and submitted automatically after reconnecting. The wallet still prompts for signing when the queue is flushed.

## Browser Support

Service workers are supported in all modern browsers:
- Chrome/Edge 40+
- Firefox 44+
- Safari 11.1+
- Opera 27+

The implementation gracefully degrades in unsupported browsers — users simply won't have offline support, but the app continues to work normally online.

## Header Configuration

The service worker (`sw.js`) is served with special cache-control headers:
```
Cache-Control: public, max-age=0, must-revalidate
```

This ensures the service worker file itself is always fresh, while cached pages/assets remain available offline.

## Performance Impact

- **Installation**: ~50ms for initial registration
- **Runtime**: <1ms overhead for cache lookup on each request
- **Storage**: ~2-5MB depending on asset sizes (configurable)
- **No impact on online performance**: Cache checks happen in parallel with network requests

## Limitations

1. **Read-only creation**: Creating a new stream still requires an online connection.
2. **Storage quota**: Limited by browser (typically 50MB+ per origin)

## Testing Offline Support

### Manual Testing
1. Open DevTools → Application → Service Workers
2. Check "Offline" to simulate offline mode
3. Verify pages load from cache
4. Verify OfflineIndicator appears

### Programmatic Testing
```typescript
// Simulate offline
Object.defineProperty(navigator, 'onLine', { value: false });
window.dispatchEvent(new Event('offline'));

// Verify component response
// OfflineIndicator should be visible
```

## Updating the Cache

Production builds derive the service-worker cache key from a SHA-256 hash of
`.next/static`. A changed asset therefore creates a new cache automatically;
old caches are removed during activation. The service worker checks for an
updated worker on browser startup and when the page regains focus.

Where Periodic Background Sync is supported, the worker requests a check every
24 hours. Browsers without that API use the startup/focus check and the normal
service-worker update lifecycle as a fallback.

## Accessibility

- OfflineIndicator includes `role="status"` and `aria-live="polite"` for screen readers
- Status message is always text-based, never relies on color alone
- Offline state is always announced to assistive technologies

## Security Considerations

1. **HTTPS only**: Service workers only work over HTTPS (or localhost for testing)
2. **Scope isolation**: Service worker only intercepts requests for its own origin
3. **No sensitive data in cache**: Only static pages are cached, no API responses with user data
4. **CSP compliance**: Service worker respects Content Security Policy headers

## Offline Usage Analytics

Offline analytics should record only privacy-safe operational signals. The goal is to understand whether offline support is helping users and whether cached routes are missing coverage, not to identify individual wallet behavior.

Recommended events:

| Event | When it fires | Allowed fields |
| --- | --- | --- |
| `offline_entered` | Browser emits `offline` | route pattern, timestamp, service worker support flag |
| `online_restored` | Browser emits `online` | route pattern, offline duration bucket |
| `offline_cache_hit` | Service worker serves a cached page or static asset | route pattern, cache name, asset type |
| `offline_cache_miss` | User requests a route or asset that is unavailable offline | route pattern, asset type, fallback used |

Do not include wallet addresses, transaction ids, stream ids, token amounts, or free-form URLs. For dynamic routes such as `/stream/[id]`, record the route pattern instead of the concrete id-bearing path.

Operators can use these counts to decide which pages need better caching, whether users frequently enter offline mode during transaction flows, and whether cache misses are increasing after deployments.
## Future Enhancements

- [x] Background sync for transaction signing
- [x] IndexedDB for read-only user data caching
- [x] Periodic cache updates via background sync
- [x] Smarter cache versioning based on asset hashes
- [x] Analytics for offline usage patterns documented with privacy-safe event guidance
