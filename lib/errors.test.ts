import { describe, it, expect } from 'vitest';
import {
  OperationAbortedError,
  OperationTimeoutError,
  ConcurrencyLimitError,
  IdempotencyConflictError,
} from './errors';

describe('errors', () => {
  describe('OperationAbortedError', () => {
    it('sets default message and properties', () => {
      const err = new OperationAbortedError();
      expect(err.message).toBe('Operation aborted');
      expect(err.name).toBe('OperationAbortedError');
      expect(err.code).toBe('OPERATION_ABORTED');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(OperationAbortedError);
      expect(err.stack).toBeDefined();
    });

    it('accepts a custom message', () => {
      const err = new OperationAbortedError('User clicked cancel');
      expect(err.message).toBe('User clicked cancel');
      expect(err.name).toBe('OperationAbortedError');
      expect(err.code).toBe('OPERATION_ABORTED');
    });
  });

  describe('OperationTimeoutError', () => {
    it('sets default message and properties', () => {
      const err = new OperationTimeoutError();
      expect(err.message).toBe('Operation timed out');
      expect(err.name).toBe('OperationTimeoutError');
      expect(err.code).toBe('OPERATION_TIMEOUT');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(OperationTimeoutError);
      expect(err.stack).toBeDefined();
    });

    it('accepts a custom message', () => {
      const err = new OperationTimeoutError('Freighter signing timed out after 30s');
      expect(err.message).toBe('Freighter signing timed out after 30s');
      expect(err.name).toBe('OperationTimeoutError');
      expect(err.code).toBe('OPERATION_TIMEOUT');
    });
  });

  describe('ConcurrencyLimitError', () => {
    it('sets default message and properties', () => {
      const err = new ConcurrencyLimitError();
      expect(err.message).toBe('Too many concurrent operations');
      expect(err.name).toBe('ConcurrencyLimitError');
      expect(err.code).toBe('CONCURRENCY_LIMIT');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(ConcurrencyLimitError);
      expect(err.stack).toBeDefined();
    });

    it('accepts a custom message', () => {
      const err = new ConcurrencyLimitError('Maximum queue size of 5 exceeded');
      expect(err.message).toBe('Maximum queue size of 5 exceeded');
      expect(err.name).toBe('ConcurrencyLimitError');
      expect(err.code).toBe('CONCURRENCY_LIMIT');
    });
  });

  describe('IdempotencyConflictError', () => {
    it('sets default message and properties', () => {
      const err = new IdempotencyConflictError();
      expect(err.message).toBe('Operation with the same idempotency key is already in-flight');
      expect(err.name).toBe('IdempotencyConflictError');
      expect(err.code).toBe('IDEMPOTENCY_CONFLICT');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(IdempotencyConflictError);
      expect(err.stack).toBeDefined();
    });

    it('accepts a custom message', () => {
      const err = new IdempotencyConflictError('Key "tx-123" already processing');
      expect(err.message).toBe('Key "tx-123" already processing');
      expect(err.name).toBe('IdempotencyConflictError');
      expect(err.code).toBe('IDEMPOTENCY_CONFLICT');
    });
  });

  describe('error discrimination and polymorphic handling', () => {
    it('ensures each error class has a unique code and name', () => {
      const instances = [
        new OperationAbortedError(),
        new OperationTimeoutError(),
        new ConcurrencyLimitError(),
        new IdempotencyConflictError(),
      ];

      const codes = instances.map((e) => e.code);
      const names = instances.map((e) => e.name);

      expect(new Set(codes).size).toBe(4);
      expect(new Set(names).size).toBe(4);
    });

    it('supports instanceof discrimination in try-catch blocks', () => {
      const throwError = (type: string) => {
        if (type === 'timeout') throw new OperationTimeoutError();
        if (type === 'abort') throw new OperationAbortedError();
        throw new Error('generic');
      };

      try {
        throwError('timeout');
      } catch (err) {
        expect(err instanceof OperationTimeoutError).toBe(true);
        expect(err instanceof OperationAbortedError).toBe(false);
      }

      try {
        throwError('abort');
      } catch (err) {
        expect(err instanceof OperationAbortedError).toBe(true);
        expect(err instanceof OperationTimeoutError).toBe(false);
      }
    });
  });
});
