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

/** Wallet cancellations are expected user flow, not actionable failures. */
export function isUserRejection(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /user\s*(rejected|denied|declined)|transaction\s*(cancelled|canceled)|request\s*rejected|denied by user/i.test(message)
}

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
  // Scrub at insertion so a secret can never sit in the in-memory breadcrumb
  // buffer waiting to be attached to a later error (#808).
  const clean: ErrorBreadcrumb = {
    ...crumb,
    message: scrubSensitiveData(crumb.message),
  }
  if (crumb.data) clean.data = scrubObject(crumb.data)
  breadcrumbs.push(clean)
  if (breadcrumbs.length > MAX_BREADCRUMBS) {
    breadcrumbs = breadcrumbs.slice(-MAX_BREADCRUMBS)
  }
}

// ── PII & Key Scrubber (#752, #808) ──────────────────────────────────────────

const REDACTED = '[REDACTED]';

const STELLAR_PUBLIC_KEY_REGEX = /\bG[A-Z2-7]{55}\b/g;
const STELLAR_SECRET_KEY_REGEX = /\bS[A-Z2-7]{55}\b/g;

// Transaction signatures are 64-byte ed25519 values. Depending on how the
// wallet/SDK surfaces them in an error they show up either raw-hex encoded
// (128 chars) or base64 encoded (86 chars + '==' padding).
const HEX_TRANSACTION_SIGNATURE_REGEX = /(?<![0-9a-fA-F])[0-9a-fA-F]{128}(?![0-9a-fA-F])/g;
const BASE64_TRANSACTION_SIGNATURE_REGEX = /(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{86}==(?![A-Za-z0-9+/=])/g;

// Values explicitly labelled as a signature/secret/envelope — catches encoded
// blobs that aren't a bare 64-byte signature (e.g. a signed transaction XDR)
// and `secretKey = "S..."` shapes that also survive the secret-key regex.
const LABELLED_SECRET_REGEX =
  /((?:signature|signed[_ -]?(?:xdr|transaction|tx)|envelope[_ -]?xdr|secret(?:[_ -]?key)?|private[_ -]?key)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[A-Za-z0-9+/=_-]{8,})/gi;

/**
 * Scrub sensitive Stellar keys and transaction signatures from strings before
 * telemetry dispatch (#752, #808).
 *
 * Replacement order matters: labelled values and secret keys are redacted
 * before the broader signature patterns so a signature embedded in a
 * `signature: "…"` field is removed as one unit.
 */
export function scrubSensitiveData(text: string): string {
  if (!text) return text;
  return text
    .replace(LABELLED_SECRET_REGEX, `$1${REDACTED}`)
    .replace(STELLAR_SECRET_KEY_REGEX, REDACTED)
    .replace(HEX_TRANSACTION_SIGNATURE_REGEX, REDACTED)
    .replace(BASE64_TRANSACTION_SIGNATURE_REGEX, REDACTED)
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
  if (isUserRejection(error)) return
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
    breadcrumbs.forEach(c => {
      const payload: ErrorBreadcrumb = { ...c, message: scrubSensitiveData(c.message) }
      if (c.data) payload.data = scrubObject(c.data)
      scope.addBreadcrumb(payload)
    })
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
