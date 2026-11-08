import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockWithScope, mockCaptureException } = vi.hoisted(() => ({
  mockWithScope: vi.fn(),
  mockCaptureException: vi.fn(),
}))

const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

import {
  isErrorTrackingEnabled,
  addBreadcrumb,
  captureError,
  withErrorTracking,
  initErrorTracking,
  scrubSensitiveData,
  scrubObject,
} from './error-tracking'

describe('error-tracking', () => {
  const originalDsn = process.env.NEXT_PUBLIC_SENTRY_DSN

  beforeEach(() => {
    mockWithScope.mockReset()
    mockCaptureException.mockReset()
    mockConsoleError.mockReset()
  })

  afterEach(() => {
    if (originalDsn === undefined) {
      delete process.env.NEXT_PUBLIC_SENTRY_DSN
    } else {
      process.env.NEXT_PUBLIC_SENTRY_DSN = originalDsn
    }
  })

  describe('without DSN', () => {
    it('isErrorTrackingEnabled is false', () => {
      expect(isErrorTrackingEnabled).toBe(false)
    })

    it('addBreadcrumb is a no-op', () => {
      expect(() => addBreadcrumb({ message: 'crumb' })).not.toThrow()
    })

    it('captureError logs to console', () => {
      captureError(new Error('test'))
      expect(mockConsoleError).toHaveBeenCalledWith(
        '[error-tracking]',
        'test',
        expect.objectContaining({ breadcrumbs: [] }),
      )
    })

    it('withErrorTracking rethrows after logging', async () => {
      const failing = async () => { throw new Error('boom') }
      await expect(withErrorTracking(failing)()).rejects.toThrow('boom')
      expect(mockConsoleError).toHaveBeenCalledWith(
        '[error-tracking]',
        'boom',
        expect.objectContaining({ context: undefined }),
      )
    })

    it('initErrorTracking does nothing', () => {
      expect(() => initErrorTracking()).not.toThrow()
    })

    it('never calls Sentry when DSN is not set', () => {
      captureError(new Error('no-sentry'))
      expect(mockWithScope).not.toHaveBeenCalled()
      expect(mockCaptureException).not.toHaveBeenCalled()
    })
  })

  describe('with DSN', () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://test@sentry.io/123'
    })

    it('isErrorTrackingEnabled is true', async () => {
      const { isErrorTrackingEnabled: enabled } = await vi.importMock<
        typeof import('./error-tracking')
      >('./error-tracking')
      expect(enabled).toBe(true)
    })

    it('captureError sends to Sentry via withScope', async () => {
      const mod = await vi.importMock<typeof import('./error-tracking')>('./error-tracking')
      const err = new Error('sentry test')
      mod.captureError(err, {
        tags: { env: 'test' },
        extra: { userId: 'u1' },
      })
      expect(mockWithScope).toHaveBeenCalledTimes(1)
      const scopeFn = mockWithScope.mock.calls[0]?.[0]
      expect(scopeFn).toBeDefined()
      const scope = {
        setTag: vi.fn(),
        setExtra: vi.fn(),
        addBreadcrumb: vi.fn(),
      }
      scopeFn!(scope)
      expect(scope.setTag).toHaveBeenCalledWith('env', 'test')
      expect(scope.setExtra).toHaveBeenCalledWith('userId', 'u1')
      expect(mockCaptureException).toHaveBeenCalledWith(err)
    })

    it('breadcrumbs are attached to the scope and cleared after capture', async () => {
      vi.doMock('@sentry/nextjs', () => ({
        withScope: mockWithScope,
        captureException: mockCaptureException,
      }))
      const { captureError: cap, addBreadcrumb: add } =
        await vi.importMock<typeof import('./error-tracking')>('./error-tracking')
      add({ message: 'step 1' })
      add({ message: 'step 2', level: 'warning' })
      cap(new Error('crumb test'))
      const scopeFn = mockWithScope.mock.calls[0]?.[0]
      expect(scopeFn).toBeDefined()
      const scope = {
        setTag: vi.fn(),
        setExtra: vi.fn(),
        addBreadcrumb: vi.fn(),
      }
      scopeFn!(scope)
      expect(scope.addBreadcrumb).toHaveBeenCalledTimes(2)
      expect(scope.addBreadcrumb).toHaveBeenNthCalledWith(1, { message: 'step 1' })
      expect(scope.addBreadcrumb).toHaveBeenNthCalledWith(2, { message: 'step 2', level: 'warning' })
      mockWithScope.mockReset()
      cap(new Error('second'))
      const scopeFn2 = mockWithScope.mock.calls[0]?.[0]
      expect(scopeFn2).toBeDefined()
      const scope2 = {
        setTag: vi.fn(),
        setExtra: vi.fn(),
        addBreadcrumb: vi.fn(),
      }
      scopeFn2!(scope2)
      expect(scope2.addBreadcrumb).not.toHaveBeenCalled()
    })

    it('withErrorTracking captures and rethrows', async () => {
      const mod = await vi.importMock<typeof import('./error-tracking')>('./error-tracking')
      const failing = vi.fn().mockRejectedValue(new Error('rpc fail'))
      const wrapped = mod.withErrorTracking(failing, { tags: { rpc: 'getAccount' } })
      await expect(wrapped()).rejects.toThrow('rpc fail')
      expect(mockWithScope).toHaveBeenCalledTimes(1)
      const scopeFn = mockWithScope.mock.calls[0]?.[0]
      expect(scopeFn).toBeDefined()
      const scope = {
        setTag: vi.fn(),
        setExtra: vi.fn(),
        addBreadcrumb: vi.fn(),
      }
      scopeFn!(scope)
      expect(scope.setTag).toHaveBeenCalledWith('rpc', 'getAccount')
      expect(mockCaptureException).toHaveBeenCalledWith(new Error('rpc fail'))
    })

    it('initErrorTracking registers window listeners', async () => {
      const mod = await vi.importMock<typeof import('./error-tracking')>('./error-tracking')
      const listeners: Record<string, ((e: any) => void)[]> = {}
      vi.stubGlobal('window', {
        addEventListener: (type: string, fn: (e: any) => void) => {
          listeners[type] = listeners[type] || []
          listeners[type].push(fn)
        },
      })
      mod.initErrorTracking()
      expect(listeners['unhandledrejection']).toHaveLength(1)
      expect(listeners['error']).toHaveLength(1)
      const unhandledReason = new Error('async boom')
      listeners['unhandledrejection'][0]({ reason: unhandledReason, promise: 'p' })
      expect(mockWithScope).toHaveBeenCalledTimes(1)
      const scopeFn = mockWithScope.mock.calls[0]?.[0]
      expect(scopeFn).toBeDefined()
      const scope = {
        setTag: vi.fn(),
        setExtra: vi.fn(),
        addBreadcrumb: vi.fn(),
      }
      scopeFn!(scope)
      expect(scope.setTag).toHaveBeenCalledWith('source', 'unhandledrejection')
      expect(mockCaptureException).toHaveBeenCalledWith(unhandledReason)
      vi.unstubAllGlobals()
    })
  })
})

// ── #808 — secret key & transaction signature scrubbing ──────────────────────

const SECRET_KEY = `S${'A'.repeat(55)}`
const PUBLIC_KEY = `G${'B'.repeat(55)}`
const HEX_SIGNATURE = 'a'.repeat(128)
const BASE64_SIGNATURE = `${'A'.repeat(86)}==`

describe('scrubSensitiveData (#808)', () => {
  it('redacts Stellar secret keys with [REDACTED]', () => {
    expect(scrubSensitiveData(`secret=${SECRET_KEY}`)).toBe('secret=[REDACTED]')
  })

  it('redacts Stellar public keys', () => {
    expect(scrubSensitiveData(PUBLIC_KEY)).toBe('[REDACTED_PUBLIC_KEY]')
  })

  it('redacts hex-encoded transaction signatures', () => {
    expect(scrubSensitiveData(`sig=${HEX_SIGNATURE}`)).toBe('sig=[REDACTED]')
  })

  it('redacts base64-encoded 64-byte transaction signatures', () => {
    expect(scrubSensitiveData(`sig:${BASE64_SIGNATURE}`)).toBe('sig:[REDACTED]')
  })

  it('redacts labelled signature and signed-transaction values of any encoding', () => {
    expect(scrubSensitiveData('signature: "Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MA"')).toBe(
      'signature: [REDACTED]',
    )
    expect(scrubSensitiveData('signedTransaction = AAAAdeadbeef1234567890')).toBe(
      'signedTransaction = [REDACTED]',
    )
    expect(scrubSensitiveData('envelope_xdr: AAAABBBB')).toBe('envelope_xdr: [REDACTED]')
  })

  it('leaves non-sensitive text untouched', () => {
    const text = 'RPC request timed out after 10000ms for account GCALLER'
    expect(scrubSensitiveData(text)).toBe(text)
  })

  it('handles empty and falsy input without throwing', () => {
    expect(scrubSensitiveData('')).toBe('')
    expect(scrubSensitiveData(undefined as unknown as string)).toBeFalsy()
  })

  it('redacts multiple secrets in a single string', () => {
    const scrubbed = scrubSensitiveData(`a ${SECRET_KEY} b ${HEX_SIGNATURE} c ${PUBLIC_KEY}`)
    expect(scrubbed).not.toContain(SECRET_KEY)
    expect(scrubbed).not.toContain(HEX_SIGNATURE)
    expect(scrubbed).not.toContain(PUBLIC_KEY)
    expect(scrubbed).toContain('[REDACTED]')
  })
})

describe('scrubObject (#808)', () => {
  it('recursively scrubs strings in nested objects and arrays', () => {
    const input = {
      signature: BASE64_SIGNATURE,
      nested: { secretKey: SECRET_KEY, list: [HEX_SIGNATURE, 'plain'] },
    }
    expect(scrubObject(input)).toEqual({
      signature: '[REDACTED]',
      nested: { secretKey: '[REDACTED]', list: ['[REDACTED]', 'plain'] },
    })
  })

  it('returns non-object values unchanged', () => {
    expect(scrubObject(42 as unknown as object)).toBe(42)
    expect(scrubObject(null as unknown as object)).toBeNull()
  })
})

describe('captureError scrubbing (#808)', () => {
  it('never logs a raw secret key to the console fallback', () => {
    captureError(new Error(`submit failed for key ${SECRET_KEY}`))
    const loggedMessage = mockConsoleError.mock.calls.at(-1)?.[1]
    expect(loggedMessage).not.toContain(SECRET_KEY)
    expect(loggedMessage).toContain('[REDACTED]')
  })

  it('scrubs signatures out of context and breadcrumb data', async () => {
    mockWithScope.mockReset()
    mockCaptureException.mockReset()
    vi.doMock('@sentry/nextjs', () => ({
      withScope: mockWithScope,
      captureException: mockCaptureException,
    }))
    process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://test@sentry.io/123'
    const mod = await vi.importMock<typeof import('./error-tracking')>('./error-tracking')
    mod.addBreadcrumb({ message: `sig ${HEX_SIGNATURE}`, data: { signature: BASE64_SIGNATURE } })
    mod.captureError(new Error('boom'), { extra: { signedXdr: HEX_SIGNATURE } })

    expect(mockWithScope).toHaveBeenCalledTimes(1)
    const scopeFn = mockWithScope.mock.calls[0]?.[0]
    const scope = { setTag: vi.fn(), setExtra: vi.fn(), addBreadcrumb: vi.fn() }
    scopeFn!(scope)

    const extraValue = scope.setExtra.mock.calls[0]?.[1]
    expect(JSON.stringify(extraValue)).not.toContain(HEX_SIGNATURE)

    const crumb = scope.addBreadcrumb.mock.calls[0]?.[0]
    expect(crumb.message).toBe('sig [REDACTED]')
    expect(crumb.data).toEqual({ signature: '[REDACTED]' })
    delete process.env.NEXT_PUBLIC_SENTRY_DSN
  })
})
