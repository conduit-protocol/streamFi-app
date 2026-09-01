import { describe, expect, it } from 'vitest';
import { getNextTheme } from './ThemeToggle';

describe('ThemeToggle theme cycling', () => {
  it('cycles explicit light mode to dark mode', () => {
    expect(getNextTheme('light')).toBe('dark');
  });

  it('cycles explicit dark mode back to system mode', () => {
    expect(getNextTheme('dark')).toBe('system');
  });

  it('cycles system or missing theme to light mode', () => {
    expect(getNextTheme('system')).toBe('light');
    expect(getNextTheme(undefined)).toBe('light');
  });
});
