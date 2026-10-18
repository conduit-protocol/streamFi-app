/**
 * Lightweight error tracking wrapper backed by Sentry.
 *
 * Captures unhandled errors and failed RPC calls with breadcrumbs.
 * Gated on NEXT_PUBLIC_SENTRY_DSN — when unset, all functions are
 * no-ops so the app runs identically without Sentry configured.
 *
 * #478: Sentry error tracking wiring.
 */

import * as Sentry from '@sentry/nextjs'

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

// ── PII & Key Scrubber (#752) ────────────────────────────────────────────────

const STELLAR_PUBLIC_KEY_REGEX = /\bG[A-Z2-7]{55}\b/g;
const STELLAR_SECRET_KEY_REGEX = /\bS[A-Z2-7]{55}\b/g;

/**
 * Scrub sensitive Stellar public and secret keys from strings before telemetry dispatch (#752).
 */
export function scrubSensitiveData(text: string): string {
  if (!text) return text;
  return text
    .replace(STELLAR_SECRET_KEY_REGEX, '[REDACTED_SECRET_KEY]')
    .replace(STELLAR_PUBLIC_KEY_REGEX, '[REDACTED_PUBLIC_KEY]');
}

export function scrubObject<T>(obj: T): T {
  if (!obj || typeof obj !== 'object') {
    return typeof obj === 'string' ? (scrubSensitiveData(obj) as unknown as T) : obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(scrubObject) as unknown as T;
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = scrubObject(value);
  }
  return result as T;
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
  const rawErr = error instanceof Error ? error : new Error(String(error))
  const cleanMessage = scrubSensitiveData(rawErr.message)
  const err = rawErr.message === cleanMessage ? rawErr : new Error(cleanMessage)
  if (rawErr.stack) {
    err.stack = scrubSensitiveData(rawErr.stack)
  }

  const cleanContext = context ? scrubObject(context) : context

  if (!SENTRY_DSN) {
    console.error('[error-tracking]', err.message, { context: cleanContext, breadcrumbs: breadcrumbs.slice(-5) })
    return
  }

  Sentry.withScope(scope => {
    if (cleanContext?.tags) {
      Object.entries(cleanContext.tags).forEach(([k, v]) => scope.setTag(k, v))
    }
    if (cleanContext?.extra) {
      Object.entries(cleanContext.extra).forEach(([k, v]) => scope.setExtra(k, v))
    }
    breadcrumbs.forEach(c => scope.addBreadcrumb({ ...c, message: scrubSensitiveData(c.message) }))
    Sentry.captureException(err)
  })
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
