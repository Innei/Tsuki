import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Tests are outside the source-only tsconfig include.
  oxc: {
    decorator: { legacy: true, emitDecoratorMetadata: true },
  },
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    maxConcurrency: 1,
  },
});
