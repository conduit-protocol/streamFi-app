import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],

  theme: {
    extend: {
      // ── Conduit design system: black and white only ──────────────────────
      // No hue-named colours. Use only:
      //   text-black | text-white | text-gray-{50..950}
      //   bg-black   | bg-white   | bg-gray-{50..950}
      //   border-black | border-white | border-gray-{50..950}
      //
      // Exception: text-green-600 / text-red-600 for +/- balance deltas only,
      // always paired with an aria-label so colour is not the sole signal.

      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'monospace'],
      },

      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },

      boxShadow: {
        card:  '0 1px 3px 0 rgb(0 0 0 / 0.08)',
        panel: '0 4px 12px 0 rgb(0 0 0 / 0.06)',
      },

      keyframes: {
        'fade-in': {
          '0%':   { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'drain': {
          '0%':   { transform: 'scaleX(1)' },
          '100%': { transform: 'scaleX(0)' },
        },
      },

      animation: {
        'fade-in': 'fade-in 200ms ease-out',
        'drain':   'drain linear forwards',
      },
    },
  },

  plugins: [],
};

export default config;
