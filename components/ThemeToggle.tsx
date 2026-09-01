'use client';

import { useTheme } from 'next-themes';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useEffect, useState } from 'react';

type ThemeChoice = 'light' | 'dark' | 'system';

export function getNextTheme(theme?: string): ThemeChoice {
  if (theme === 'light') return 'dark';
  if (theme === 'dark') return 'system';
  return 'light';
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // #306 — theme (from next-themes) never changes when the OS switches
  // color scheme while theme === 'system', so this component's own icon/
  // label would otherwise go stale until some unrelated re-render happened.
  const [systemPrefersDark, setSystemPrefersDark] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemPrefersDark(mql.matches);

    const handleChange = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, []);

  if (!mounted) {
    return <div className="w-9 h-9" />;
  }

  const isDark = theme === 'dark' || (theme === 'system' && systemPrefersDark);
  const nextTheme = getNextTheme(theme);
  const label =
    nextTheme === 'system'
      ? 'Match system theme'
      : nextTheme === 'dark'
        ? 'Switch to dark mode'
        : 'Switch to light mode';

  return (
    <button
      onClick={() => setTheme(nextTheme)}
      className="inline-flex items-center justify-center w-9 h-9 rounded text-gray-500 hover:text-black hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-800 transition-colors"
      aria-label={label}
      title={label}
    >
      {theme === 'system' ? (
        <Monitor className="w-4 h-4" />
      ) : isDark ? (
        <Sun className="w-4 h-4" />
      ) : (
        <Moon className="w-4 h-4" />
      )}
    </button>
  );
}
