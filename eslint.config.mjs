import { defineConfig } from '@lobehub/eslint-config';

export default [
  ...defineConfig({
    typescript: true,
  }),
  {
    files: ['examples/starter/src/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
];
