import { builtinModules } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nodeBuiltins = builtinModules.filter((m) => !m.startsWith('_'));
nodeBuiltins.push(...nodeBuiltins.map((m) => `node:${m}`));

const external = ['ioredis', 'pg', 'pg-native'];

export default defineConfig({
  resolve: { tsconfigPaths: true },
  ssr: {
    noExternal: true,
    external,
  },
  build: {
    ssr: true,
    target: 'esnext',
    rolldownOptions: {
      external: nodeBuiltins,
      input: {
        main: path.resolve(__dirname, 'src/index.ts'),
        migrate: path.resolve(__dirname, 'src/migrate.ts'),
      },
      output: {
        keepNames: true,
        entryFileNames: '[name].mjs',
        chunkFileNames: '[name]-[hash].mjs',
      },
    },
  },
});
