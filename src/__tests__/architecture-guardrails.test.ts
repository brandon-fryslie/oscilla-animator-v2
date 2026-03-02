import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';

type Gate = {
  readonly id: string;
  readonly pattern: string;
  readonly scope: readonly string[];
  readonly maxCount: number;
};

function rgLines(pattern: string, scope: readonly string[], globs: readonly string[] = ['*.ts', '*.tsx']): string[] {
  const args = [
    '-n',
    '--no-heading',
    '--color',
    'never',
    ...globs.flatMap((glob) => ['--glob', glob]),
    pattern,
    ...scope,
  ];

  try {
    const out = execFileSync('rg', args, { encoding: 'utf-8', cwd: process.cwd() }).trim();
    return out ? out.split('\n').filter(Boolean) : [];
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 1) return [];
    throw err;
  }
}

function stripCommentOnly(lines: readonly string[]): string[] {
  return lines.filter((line) => {
    const firstColon = line.indexOf(':');
    const secondColon = firstColon >= 0 ? line.indexOf(':', firstColon + 1) : -1;
    const content = secondColon >= 0 ? line.slice(secondColon + 1).trim() : line.trim();
    return !(content.startsWith('//') || content.startsWith('*') || content.startsWith('/*') || content === '*/');
  });
}

function filterAllowlist(lines: readonly string[], allowlist: readonly RegExp[]): string[] {
  return lines.filter((line) => !allowlist.some((re) => re.test(line)));
}

describe('Architecture Guardrails', () => {
  describe('Legacy ValueExpr type removal ownership', () => {
    const nonTestSrcGlobs = ['*.ts', '*.tsx', '!**/*.test.*', '!**/__tests__/**'];

    it('no production references to legacy expression unions', () => {
      const matches = rgLines('\\b(SigExpr|FieldExpr|EventExpr)\\b', ['src'], nonTestSrcGlobs);
      const filtered = filterAllowlist(stripCommentOnly(matches), [
        /ValueExpr/, // allow the canonical type name
        /architecture-guardrails\.test\.ts/,
      ]);
      expect(filtered).toEqual([]);
    });

    it('no production references to legacy expression ID aliases', () => {
      const matches = rgLines('\\b(SigExprId|FieldExprId|EventExprId)\\b', ['src'], nonTestSrcGlobs);
      const filtered = filterAllowlist(stripCommentOnly(matches), [/architecture-guardrails\.test\.ts/]);
      expect(filtered).toEqual([]);
    });

    it('no production deriveKind() calls', () => {
      const matches = rgLines('\\bderiveKind\\(', ['src'], nonTestSrcGlobs);
      const filtered = filterAllowlist(stripCommentOnly(matches), [/architecture-guardrails\.test\.ts/]);
      expect(filtered).toEqual([]);
    });
  });

  describe('ValueExpr flattening ownership', () => {
    const valueExprFile = ['src/compiler/ir/value-expr.ts'];

    it('no embedded ValueExpr[] references in IR type table', () => {
      const matches = rgLines(':\\s*(readonly\\s+)?ValueExpr\\[', valueExprFile, ['*.ts']);
      expect(stripCommentOnly(matches)).toEqual([]);
    });

    it('no embedded ValueExpr object fields in IR type table', () => {
      const matches = rgLines(':\\s*(readonly\\s+)?ValueExpr;', valueExprFile, ['*.ts']);
      expect(stripCommentOnly(matches)).toEqual([]);
    });
  });

  describe('Legacy kind dispatch ownership', () => {
    const forbiddenPatterns = [
      "kind === 'slot'",
      "kind === 'external'",
      "kind === 'map'",
      "kind === 'zip'",
      "kind === 'stateRead'",
      "kind === 'reduceField'",
      "kind === 'eventRead'",
      "kind === 'intrinsic'",
      "kind === 'placement'",
      "kind === 'broadcast'",
      "kind === 'zipPromote'",
      "kind === 'pathDerivative'",
      "kind === 'pulse'",
      "kind === 'wrap'",
      "kind === 'combine'",
      "kind === 'never'",
    ] as const;

    for (const pattern of forbiddenPatterns) {
      it(`no production legacy dispatch pattern: ${pattern}`, () => {
        const matches = rgLines(pattern, ['src'], ['*.ts', '*.tsx', '!**/*.test.*', '!**/__tests__/**']);
        const filtered = filterAllowlist(stripCommentOnly(matches), [
          /architecture-guardrails\.test\.ts/,
        ]);
        expect(filtered).toEqual([]);
      });
    }
  });

  describe('CompiledIR foundation gates ownership', () => {
    const gates: readonly Gate[] = [
      // W11
      {
        id: 'K-W11-1',
        pattern: "export type \\{ IRBuilder \\} from './IRBuilder'",
        scope: ['src/compiler/ir/index.ts'],
        maxCount: 0,
      },
      {
        id: 'K-W11-2',
        pattern: "export type \\{ IRBuilder, Step, TimeModel, ValueExpr \\} from './ir'",
        scope: ['src/compiler/index.ts'],
        maxCount: 0,
      },
      {
        id: 'K-W11-3',
        pattern: "from '../compiler/ir/IRBuilder'",
        scope: ['src'],
        maxCount: 0,
      },
      // W5
      {
        id: 'K-W5-1',
        pattern: 'Optional during migration',
        scope: ['src/blocks/registry.ts'],
        maxCount: 0,
      },
      {
        id: 'K-W5-2',
        pattern: 'Pure block fallback - allocate slot now',
        scope: ['src/compiler/backend/binding-pass.ts'],
        maxCount: 0,
      },
      {
        id: 'K-W5-3',
        pattern: '= builder\\.findStateSlot\\(',
        scope: ['src/compiler/backend/binding-pass.ts'],
        maxCount: 0,
      },
      // W6
      {
        id: 'K-W6-1',
        pattern: 'runs in parallel with legacy scalar evaluators during migration',
        scope: ['src/runtime/ValueExprScalarEvaluator.ts'],
        maxCount: 0,
      },
      {
        id: 'K-W6-2',
        pattern: 'runs in parallel with legacy EventEvaluator during migration',
        scope: ['src/runtime/ValueExprEventEvaluator.ts'],
        maxCount: 0,
      },
      {
        id: 'K-W6-3',
        pattern: 'eventPrevPredicate',
        scope: ['src/runtime/RuntimeState.ts'],
        maxCount: 0,
      },
      // W2
      {
        id: 'K-W2-1',
        pattern: 'program\\.slotMeta',
        scope: ['src/runtime/ExprAddressTable.ts', 'src/runtime/ScheduleExecutor.ts', 'src/runtime/executeFrameStepped.ts'],
        maxCount: 0,
      },
      {
        id: 'K-W2-2',
        pattern: 'jammed into slotMeta with a fake type',
        scope: ['src/compiler/compile.ts'],
        maxCount: 0,
      },
      // W7
      {
        id: 'K-W7-1',
        pattern: 'assertF64Stride',
        scope: ['src/runtime/ExprAddressTable.ts', 'src/runtime/ScheduleExecutor.ts', 'src/runtime/executeFrameStepped.ts'],
        maxCount: 0,
      },
      // W12
      {
        id: 'K-W12-1',
        pattern: '= program\\.arenaLayout\\[',
        scope: ['src/runtime', 'src/services'],
        maxCount: 0,
      },
      // P0 no-string-math
      {
        id: 'K-P0-1',
        pattern: 'buildGeneratedComputeProgram',
        scope: ['src/compiler/compile.ts'],
        maxCount: 2,
      },
      {
        id: 'K-P0-2',
        pattern: 'generatedComputeProgram',
        scope: ['src/compiler/ir/program.ts'],
        maxCount: 1,
      },
      {
        id: 'K-P0-3',
        pattern: 'MAX_ACTIVE_LANES',
        scope: ['src/compiler/compile.ts'],
        maxCount: 0,
      },
      {
        id: 'K-P0-4',
        pattern: 'state_in:\\s*array<f32>',
        scope: ['src/compiler/compile.ts'],
        maxCount: 0,
      },
      {
        id: 'K-P0-5',
        pattern: "packingPreference:\\s*'aos'",
        scope: ['src/compiler/compile.ts'],
        maxCount: 0,
      },
      {
        id: 'K-P0-6',
        pattern: '\\bemitWgslModule\\s*\\(',
        scope: ['src'],
        maxCount: 0,
      },
      {
        id: 'K-P0-7',
        pattern: '\\bcreateDrawPrepWgslAst\\s*\\(',
        scope: ['src'],
        maxCount: 0,
      },
    ];

    for (const gate of gates) {
      it(`${gate.id} does not grow beyond baseline`, () => {
        const count = rgLines(gate.pattern, gate.scope, [
          '*.ts',
          '*.tsx',
          '!**/*.test.*',
          '!**/__tests__/**',
        ]).length;
        // [LAW:single-enforcer] Each migration invariant is enforced in one canonical guardrail suite.
        expect(count).toBeLessThanOrEqual(gate.maxCount);
      });
    }
  });
});
