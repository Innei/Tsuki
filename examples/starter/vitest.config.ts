import swc from 'unplugin-swc';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tsconfigPaths(), swc.vite()],
  test: {
    setupFiles: ['./vitest.setup.ts'],
    maxConcurrency: 1,
    passWithNoTests: true,
  },
});
