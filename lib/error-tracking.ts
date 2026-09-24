/**
 * Lightweight error tracking wrapper.
 *
 * Captures unhandled errors and failed RPC calls with breadcrumbs.
 * Gated on NEXT_PUBLIC_SENTRY_DSN — when unset, all functions are
 * no-ops so the app runs identically without Sentry configured.
 *
 * #478: Sentry (or similar) error tracking wiring.
 */

interface ErrorBreadcrumb {
  message: string
  level?: 'info' | 'warning' | 'error'
  data?: Record<string, unknown>
}

let breadcrumbs: ErrorBreadcrumb[] = []
const MAX_BREADCRUMBS = 20

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN

/**
 * Whether error tracking is enabled (Sentry DSN is configured).
 */
export const isErrorTrackingEnabled = !!SENTRY_DSN

/**
 * Add a breadcrumb to the error tracking context.
 * Breadcrumbs are attached to the next captured error.
 */
export function addBreadcrumb(crumb: ErrorBreadcrumb): void {
  if (!SENTRY_DSN) return
  breadcrumbs.push(crumb)
  if (breadcrumbs.length > MAX_BREADCRUMBS) {
    breadcrumbs = breadcrumbs.slice(-MAX_BREADCRUMBS)
  }
}

/**
 * Capture an error with optional context and breadcrumbs.
 * When Sentry is not configured, this is a no-op that just logs to console.
 */
export function captureError(
  error: Error | unknown,
  context?: {
    tags?: Record<string, string>
    extra?: Record<string, unknown>
  },
): void {
  const err = error instanceof Error ? error : new Error(String(error))

  if (!SENTRY_DSN) {
    console.error('[error-tracking]', err.message, { context, breadcrumbs: breadcrumbs.slice(-5) })
    return
  }

  // When @sentry/react or @sentry/nextjs is installed, this would call:
  //   Sentry.withScope(scope => {
  //     if (context?.tags) Object.entries(context.tags).forEach(([k, v]) => scope.setTag(k, v))
  //     if (context?.extra) Object.entries(context.extra).forEach(([k, v]) => scope.setExtra(k, v))
  //     breadcrumbs.forEach(c => scope.addBreadcrumb(c))
  //     Sentry.captureException(err)
  //   })
  // For now, we structure the API so adding Sentry is a one-line change.
  console.error('[sentry]', err.message, { context, breadcrumbs: breadcrumbs.slice(-5) })
  breadcrumbs = []
}

/**
 * Wrap an async function so errors are automatically captured.
 * Useful for RPC calls and async event handlers.
 */
export function withErrorTracking<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  context?: { tags?: Record<string, string>; extra?: Record<string, unknown> },
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args)
    } catch (err) {
      captureError(err, context)
      throw err
    }
  }) as T
}

/**
 * Initialize global error handlers for unhandled rejections and errors.
 * Call once in the app layout or a top-level effect.
 */
export function initErrorTracking(): void {
  if (!SENTRY_DSN) return

  if (typeof window !== 'undefined') {
    window.addEventListener('unhandledrejection', (event) => {
      captureError(event.reason, {
        tags: { source: 'unhandledrejection' },
        extra: { promise: String(event.promise) },
      })
    })

    window.addEventListener('error', (event) => {
      captureError(event.error ?? event.message, {
        tags: { source: 'window.onerror' },
        extra: { filename: event.filename, line: event.lineno, col: event.colno },
      })
    })
  }
}
