import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Live Postgres isolation suite is opt-in via vitest.live.config.ts
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/*.live.test.ts',
      'src/test/live/**',
    ],
  },
});
