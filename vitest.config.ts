import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 20000,
    alias: {
      '@shipshield/contracts': path.resolve(__dirname, 'packages/contracts/src/index.ts'),
      '@shipshield/schemas': path.resolve(__dirname, 'packages/schemas/src/index.ts'),
      '@shipshield/scan-core': path.resolve(__dirname, 'packages/scan-core/src/index.ts'),
      '@shipshield/scanner-adapters': path.resolve(__dirname, 'packages/scanner-adapters/src/index.ts'),
      '@shipshield/cli': path.resolve(__dirname, 'apps/cli/src/index.ts'),
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 75,
        functions: 80,
        branches: 70,
        statements: 75,
      },
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/fixtures/**',
        '**/*.d.ts',
        '**/*.config.*',
        '**/*.test.ts',
        '**/test/**',
        '**/*.interface.ts',
        '**/*.types.ts',
        'packages/schemas/**',
        'apps/cli/src/index.ts',
        'apps/cli/src/engine-daemon.ts',
      ],
    },
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
