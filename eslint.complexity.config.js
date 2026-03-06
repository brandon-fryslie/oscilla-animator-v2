import tseslint from 'typescript-eslint';
import sonarjs from 'eslint-plugin-sonarjs';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', '**/*.d.ts'],
  },
  {
    files: ['src/**/*.ts', 'scripts/**/*.ts', 'scripts/**/*.mjs'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
      },
    },
    plugins: {
      sonarjs,
    },
    rules: {
      complexity: ['error', 10],
      'max-depth': ['error', 4],
      'max-lines-per-function': ['warn', { max: 80, skipBlankLines: true, skipComments: true }],
      'max-params': ['warn', 5],
      'sonarjs/cognitive-complexity': ['error', 15],
    },
  },
);
