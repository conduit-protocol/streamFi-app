import { describe, it, expect } from 'vitest';
import { queuedDraftsLabel, OFFLINE_QUEUE_STORAGE_KEY } from '../offline-transactions';

describe('queuedDraftsLabel (#795)', () => {
  it('uses the singular for one draft', () => {
    expect(queuedDraftsLabel(1)).toBe('1 draft queued offline');
  });

  it('uses the plural for several drafts', () => {
    expect(queuedDraftsLabel(2)).toBe('2 drafts queued offline');
    expect(queuedDraftsLabel(12)).toBe('12 drafts queued offline');
  });

  it('treats invalid counts as zero', () => {
    expect(queuedDraftsLabel(-3)).toBe('0 drafts queued offline');
    expect(queuedDraftsLabel(Number.NaN)).toBe('0 drafts queued offline');
  });

  it('exposes the storage key the queue lives under', () => {
    expect(OFFLINE_QUEUE_STORAGE_KEY).toBe('conduit-offline-transactions');
  });
});
