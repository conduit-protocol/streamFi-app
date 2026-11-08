import { describe, expect, it } from 'vitest';
import {
  getNextTheme,
  THEME_TRANSITION_STYLE,
  applyThemeTransition,
} from './ThemeToggle';

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

  it('exports THEME_STORAGE_KEY matching next-themes configuration', () => {
    const { THEME_STORAGE_KEY } = require('./ThemeToggle');
    expect(THEME_STORAGE_KEY).toBe('streamfi-theme');
  });

  it('applies smooth cross-fade transition style to root container (#818)', () => {
    const el = document.createElement('div');
    applyThemeTransition(el);
    expect(el.style.transition).toBe(THEME_TRANSITION_STYLE);
    expect(THEME_TRANSITION_STYLE).toBe('background-color 0.3s ease, color 0.3s ease');
  });
});
