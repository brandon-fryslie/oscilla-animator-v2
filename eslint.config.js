import tseslint from 'typescript-eslint';
import noDefaultsInLower from './eslint-rules/no-defaults-in-lower.js';
import noDefaultSourceInLower from './eslint-rules/no-default-source-in-lower.js';
import noBlockTypeCheckInLower from './eslint-rules/no-block-type-check-in-lower.js';

export default tseslint.config(
  {
    files: ['src/blocks/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
    },
    plugins: {
      oscilla: {
        rules: {
          'no-defaults-in-lower': noDefaultsInLower,
          'no-default-source-in-lower': noDefaultSourceInLower,
          'no-block-type-check-in-lower': noBlockTypeCheckInLower,
        },
      },
    },
    rules: {
      'oscilla/no-defaults-in-lower': 'error',
      'oscilla/no-default-source-in-lower': 'error',
      'oscilla/no-block-type-check-in-lower': 'error',
    },
  },
);
