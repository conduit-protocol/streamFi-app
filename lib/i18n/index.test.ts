/**
 * lib/i18n — bootstrap smoke test (#558)
 *
 * Confirms the singleton initializes with the `dashboard` namespace wired
 * up and resolves known keys, including interpolation and pluralization.
 */

import { describe, it, expect } from 'vitest';
import i18n from './index';

describe('lib/i18n', () => {
  it('initializes synchronously with English as the active language', () => {
    expect(i18n.isInitialized).toBe(true);
    expect(i18n.language).toBe('en');
  });

  it('resolves a static dashboard key', () => {
    expect(i18n.t('dashboard:title')).toBe('Dashboard');
  });

  it('resolves a nested key', () => {
    expect(i18n.t('dashboard:stats.activeStreams')).toBe('Active streams');
  });

  it('interpolates variables', () => {
    expect(i18n.t('dashboard:noStreamsYet', { tab: 'receiving' })).toBe(
      'No receiving streams yet.',
    );
  });

  it('pluralizes based on count', () => {
    expect(i18n.t('dashboard:partialError', { count: 1 })).toBe("1 stream couldn’t load");
    expect(i18n.t('dashboard:partialError', { count: 3 })).toBe("3 streams couldn’t load");
  });
});
