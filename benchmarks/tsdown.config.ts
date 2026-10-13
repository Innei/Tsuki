import { defineConfig } from 'tsdown';

export default defineConfig({
  clean: true,
  deps: { alwaysBundle: ['@tsuki-hono/common', '@tsuki-hono/core'] },
  entry: ['server.ts'],
  format: 'esm',
});
