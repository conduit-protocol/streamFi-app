import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    globals:     true,
    environment: 'jsdom',
    include:     ['**/*.{test,spec}.{ts,tsx}'],
  },
});
