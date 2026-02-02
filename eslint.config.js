import tseslint from 'typescript-eslint';
import noDefaultsInLower from './eslint-rules/no-defaults-in-lower.js';
import noDefaultSourceInLower from './eslint-rules/no-default-source-in-lower.js';
import noBlockTypeCheckInLower from './eslint-rules/no-block-type-check-in-lower.js';
import noNullishCoalescingDefaults from './eslint-rules/no-nullish-coalescing-defaults.js';
import noHotPathAlloc from './eslint-rules/no-hot-path-alloc.js';

export default tseslint.config(
  // Block definitions: lower() function constraints
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
          'no-nullish-coalescing-defaults': noNullishCoalescingDefaults,
          'no-hot-path-alloc': noHotPathAlloc,
        },
      },
    },
    rules: {
      'oscilla/no-defaults-in-lower': 'error',
      'oscilla/no-default-source-in-lower': 'error',
      'oscilla/no-block-type-check-in-lower': 'error',
    },
  },
  // Data-path files: no ?? anywhere (missing value = upstream bug)
  {
    files: [
      'src/runtime/ValueExprMaterializer.ts',
      'src/runtime/ValueExprSignalEvaluator.ts',
      'src/runtime/ValueExprEventEvaluator.ts',
      'src/runtime/ContinuityApply.ts',
      'src/compiler/compile.ts',
    ],
    languageOptions: {
      parser: tseslint.parser,
    },
    plugins: {
      oscilla: {
        rules: {
          'no-nullish-coalescing-defaults': noNullishCoalescingDefaults,
          'no-hot-path-alloc': noHotPathAlloc,
        },
      },
    },
    rules: {
      'oscilla/no-nullish-coalescing-defaults': 'error',
    },
  },
  // Hot-path files: no heap allocations
  {
    files: [
      'src/runtime/ScheduleExecutor.ts',
      'src/runtime/RenderAssembler.ts',
      'src/runtime/SignalKernelLibrary.ts',
      'src/runtime/OpcodeInterpreter.ts',
      'src/render/RenderBufferArena.ts',
    ],
    languageOptions: {
      parser: tseslint.parser,
    },
    plugins: {
      oscilla: {
        rules: {
          'no-hot-path-alloc': noHotPathAlloc,
        },
      },
    },
    rules: {
      'oscilla/no-hot-path-alloc': 'error',
    },
  },
);
