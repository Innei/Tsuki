import { defineConfig } from '@lobehub/oxlint-config';

export default defineConfig(
  {
    ignores: ['packages/create-tsuki-app/template/**'],
  },
  {
    files: ['**/*'],
    rules: {
      // Match Prettier's lowercase hex digits.
      'unicorn/number-literal-case': 'off',
    },
  },
  {
    files: ['examples/starter/src/**/*.ts'],
    rules: {
      // Decorator metadata requires runtime imports for injected classes and DTOs.
      'typescript/consistent-type-imports': 'off',
    },
  },
);
