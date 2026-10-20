import { builtinModules } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import swc from 'unplugin-swc';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nodeBuiltins = builtinModules.filter((m) => !m.startsWith('_'));
nodeBuiltins.push(...nodeBuiltins.map((m) => `node:${m}`));

const external = ['ioredis', 'pg', 'pg-native'];

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    swc.vite({
      jsc: {
        target: 'esnext',
        parser: { syntax: 'typescript', decorators: true },
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
        },
        keepClassNames: true,
      },
    }),
  ],
  esbuild: false,
  ssr: {
    noExternal: true,
    external,
  },
  build: {
    ssr: true,
    target: 'esnext',
    rollupOptions: {
      external: nodeBuiltins,
      input: {
        main: path.resolve(__dirname, 'src/index.ts'),
        migrate: path.resolve(__dirname, 'src/migrate.ts'),
      },
      output: {
        entryFileNames: '[name].mjs',
        chunkFileNames: '[name]-[hash].mjs',
      },
    },
  },
});
