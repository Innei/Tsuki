import { defineConfig } from '@lobehub/eslint-config';

export default defineConfig({
  typescript: true,
  rules: {
    '@typescript-eslint/consistent-type-imports': 'off',
  },
});
