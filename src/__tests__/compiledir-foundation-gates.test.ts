import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';

type Gate = {
  readonly id: string;
  readonly pattern: string;
  readonly scope: readonly string[];
  readonly maxCount: number;
};

function rgLines(pattern: string, scope: readonly string[]): string[] {
  const args = [
    '-n',
    '--no-heading',
    '--color',
    'never',
    '--glob',
    '*.ts',
    '--glob',
    '*.tsx',
    '--glob',
    '!**/*.test.*',
    '--glob',
    '!**/__tests__/**',
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

function countGate(gate: Gate): number {
  return rgLines(gate.pattern, gate.scope).length;
}

describe('CompiledIR Foundation Migration Gates (W11/W5/W6/W2/W7/W12)', () => {
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
  ];

  for (const gate of gates) {
    it(`${gate.id} does not grow beyond baseline`, () => {
      const count = countGate(gate);
      expect(count).toBeLessThanOrEqual(gate.maxCount);
    });
  }

  it('A-W11-1 temporary allowlist is constrained to approved files only', () => {
    const lines = rgLines("from '../compiler/ir/IRBuilder'", ['src']);
    const approved = new Set([
      'src/expr/index.ts',
      'src/transforms/index.ts',
    ]);

    const disallowed = lines.filter((line) => {
      const path = line.split(':', 1)[0] ?? '';
      return !approved.has(path);
    });

    expect(lines.length).toBeLessThanOrEqual(0);
    expect(disallowed).toEqual([]);
  });

  it('A-W2-1 temporary allowlist is constrained to approved runtime files only', () => {
    const lines = rgLines('program\\.slotMeta', [
      'src/runtime/ExprAddressTable.ts',
      'src/runtime/ScheduleExecutor.ts',
      'src/runtime/executeFrameStepped.ts',
    ]);

    const approved = new Set([
      'src/runtime/ExprAddressTable.ts',
      'src/runtime/executeFrameStepped.ts',
      'src/runtime/ScheduleExecutor.ts',
    ]);

    const disallowed = lines.filter((line) => {
      const path = line.split(':', 1)[0] ?? '';
      return !approved.has(path);
    });

    expect(lines.length).toBeLessThanOrEqual(0);
    expect(disallowed).toEqual([]);
  });
});
