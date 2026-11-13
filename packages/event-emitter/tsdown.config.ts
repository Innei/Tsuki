import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  dts: { generator: 'tsrs' },
  clean: true,
  deps: {
    neverBundle: ['@tsuki-hono/common', '@tsuki-hono/core'],
  },
});
