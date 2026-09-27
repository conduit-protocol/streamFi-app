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
