import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js', 'tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: [
        'src/security/engine.js',
        'src/security/scheduler.js',
        'src/security/behavior/baseline.js',
        'src/security/behavior/anomalies.js',
        'src/security/ledger/chain.js',
        'src/security/ledger/merkle.js',
        'src/security/ledger/sink.js',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 70,
      },
    },
  },
});