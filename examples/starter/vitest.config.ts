import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    swc.vite({
      jsc: {
        target: 'esnext',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        keepClassNames: true,
      },
    }),
  ],
  test: {
    setupFiles: ['./vitest.setup.ts'],
    maxConcurrency: 1,
    passWithNoTests: true,
  },
});
