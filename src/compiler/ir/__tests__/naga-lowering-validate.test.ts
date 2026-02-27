import { describe, expect, it } from 'vitest';
import type { NagaLoweringProgramIR } from '../naga-lowering';
import { validateNagaLoweringProgram } from '../naga-lowering-validate';

function makeValidArtifact(): NagaLoweringProgramIR {
  return {
    module: {
      types: [
        { kind: 'scalar', scalar: 'f32', width: 4 },
        { kind: 'scalar', scalar: 'u32', width: 4 },
        { kind: 'vector', size: 3, scalar: 'u32', width: 4 },
      ],
      constants: [
        { type: 1, value: 0 },
      ],
      global_variables: [],
      functions: [
        {
          name: 'compute_main',
          arguments: [{ name: 'global_id', type: 2, builtin: 'global_invocation_id' }],
          expressions: [
            { kind: 'argument', argument: 0 },
            { kind: 'access_index', base: 0, index: 0 },
          ],
          body: [
            { kind: 'store', buffer: 'arena_out', index: 1, value: 1, comment: 'smoke' },
          ],
        },
      ],
      entry_points: [
        { stage: 'compute', function: 'compute_main', workgroupSize: [64, 1, 1] },
      ],
    },
    sourceMap: {
      Expr_0: { blockId: null, stepIndex: -1 },
      Expr_1: { blockId: null, stepIndex: -1 },
      Stmt_0: { blockId: null, stepIndex: 0 },
    },
  };
}

describe('validateNagaLoweringProgram', () => {
  it('accepts a structurally valid lowering artifact', () => {
    expect(validateNagaLoweringProgram(makeValidArtifact())).toEqual([]);
  });

  it('rejects artifacts with missing compute entry points', () => {
    const artifact: NagaLoweringProgramIR = {
      ...makeValidArtifact(),
      module: {
        ...makeValidArtifact().module,
        entry_points: [],
      },
    };
    const issues = validateNagaLoweringProgram(artifact);
    expect(issues.some((issue) => issue.code === 'E_NAGA_ENTRYPOINT_MISSING')).toBe(true);
  });

  it('rejects missing expression source map entries', () => {
    const valid = makeValidArtifact();
    const artifact: NagaLoweringProgramIR = {
      ...valid,
      sourceMap: {
        Expr_0: valid.sourceMap.Expr_0!,
        Stmt_0: valid.sourceMap.Stmt_0!,
      },
    };
    const issues = validateNagaLoweringProgram(artifact);
    expect(issues.some((issue) => issue.code === 'E_NAGA_SOURCE_MAP_EXPR_MISSING')).toBe(true);
  });
});
