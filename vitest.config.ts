import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    globals:     true,
    environment: 'jsdom',
    setupFiles:  ['./vitest.setup.ts'],
    include:     ['**/*.{test,spec}.{ts,tsx}'],
    exclude:     ['e2e/**', 'node_modules/**'],
    coverage: {
      provider:         'v8',
      reporter:         ['text', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      // Conservative thresholds — set slightly below current measured coverage
      // so CI fails only on meaningful regressions, not noise.
      // Raise these as coverage improves (see #531).
      thresholds: {
        lines:     50,
        functions: 45,
        branches:  40,
        statements: 50,
      },
      // Only measure coverage on source files, not tests or generated files.
      include: [
        'lib/**/*.ts',
        'components/**/*.{ts,tsx}',
        'contexts/**/*.{ts,tsx}',
        'hooks/**/*.{ts,tsx}',
        'app/**/*.{ts,tsx}',
      ],
      exclude: [
        '**/*.{test,spec}.{ts,tsx}',
        '**/__tests__/**',
        '**/__mocks__/**',
        'app/**/layout.tsx',
        'app/**/page.tsx',
        'app/globals.css',
        'node_modules/**',
        'e2e/**',
      ],
    },
  },
});
