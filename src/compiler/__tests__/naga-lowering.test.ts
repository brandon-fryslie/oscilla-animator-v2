import { describe, expect, it } from 'vitest';
import { buildPatch } from '../../graph';
import { compile } from '../compile';

function buildSimplePatch() {
  return buildPatch((b) => {
    const time = b.addBlock('InfiniteTimeRoot');
    b.setPortDefault(time, 'periodAMs', 1000);
    b.setPortDefault(time, 'periodBMs', 2000);

    const osc = b.addBlock('Oscillator');
    b.wire(time, 'phaseA', osc, 'phase');
  });
}

describe('naga lowering artifact', () => {
  it('emits structured Naga module artifact with compute entrypoint', () => {
    const result = compile(buildSimplePatch());
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const artifact = result.program.nagaLoweringProgram;
    expect(artifact).toBeDefined();
    if (!artifact) return;

    expect(artifact.module.types.length).toBeGreaterThan(0);
    expect(artifact.module.constants.length).toBeGreaterThan(0);
    expect(artifact.module.functions.length).toBe(1);
    const mainFn = artifact.module.functions[0];
    expect(mainFn.statements.length).toBeGreaterThan(0);
    expect(mainFn.body.length).toBeGreaterThan(0);
    const rootStmt = mainFn.statements[mainFn.body[0] ?? -1];
    expect(rootStmt?.kind).toBe('if');
    expect(artifact.module.entry_points).toEqual([
      {
        stage: 'compute',
        function: 'compute_main',
        workgroupSize: [64, 1, 1],
      },
    ]);

    const globals = artifact.module.global_variables.map((g) => g.name);
    expect(globals).toEqual(expect.arrayContaining(['arena_in', 'arena_out', 'state_in', 'state_out', 'uniforms']));
  });

  it('records source-map provenance for generated expressions and statements', () => {
    const result = compile(buildSimplePatch());
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const artifact = result.program.nagaLoweringProgram;
    expect(artifact).toBeDefined();
    if (!artifact) return;

    const mapEntries = Object.entries(artifact.sourceMap);
    expect(mapEntries.length).toBeGreaterThan(0);

    const hasExprEntries = mapEntries.some(([key]) => key.startsWith('Expr_'));
    const hasStmtEntries = mapEntries.some(([key]) => key.startsWith('Stmt_'));
    expect(hasExprEntries).toBe(true);
    expect(hasStmtEntries).toBe(true);

    const hasBlockBoundEntry = mapEntries.some(([, value]) => value.blockId !== null && value.stepIndex >= 0);
    expect(hasBlockBoundEntry).toBe(true);
  });

  it('interns repeated numeric constants instead of duplicating entries', () => {
    const result = compile(buildSimplePatch());
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const artifact = result.program.nagaLoweringProgram;
    expect(artifact).toBeDefined();
    if (!artifact) return;

    const zeroConstants = artifact.module.constants.filter((entry) => entry.value === 0);
    const oneConstants = artifact.module.constants.filter((entry) => entry.value === 1);

    // [LAW:one-source-of-truth] Lowering context interns constants so repeated
    // address arithmetic literals are emitted once and referenced by ID.
    expect(zeroConstants.length).toBe(1);
    expect(oneConstants.length).toBe(1);
  });
});
