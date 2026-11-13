import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    setupFiles: ['./vitest.setup.ts'],
    maxConcurrency: 1,
    passWithNoTests: true,
  },
});
