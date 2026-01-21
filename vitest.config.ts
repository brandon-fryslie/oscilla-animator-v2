import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/ui/components/__tests__/setup.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'salvage/**',
      '**/tests/e2e/**', // Exclude Playwright E2E tests
      '**/*.spec.ts', // Exclude Playwright test files
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/**/__tests__/**',
        'src/types/index.ts', // Type definitions only
      ],
      // Require 80% coverage for diagnostics and events
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@': './src',
    },
  },
});
