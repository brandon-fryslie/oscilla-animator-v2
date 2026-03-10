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

function buildRenderPatch() {
  return buildPatch((b) => {
    const time = b.addBlock('InfiniteTimeRoot');
    b.setPortDefault(time, 'periodAMs', 1000);
    b.setPortDefault(time, 'periodBMs', 2000);

    const array = b.addBlock('Array');
    b.setPortDefault(array, 'count', 4);
    const ellipse = b.addBlock('Ellipse');
    const layout = b.addBlock('GridLayoutUV');
    const color = b.addBlock('Const');
    b.setConfig(color, 'value', { r: 1, g: 0.4, b: 0.2, a: 1 });
    const render = b.addBlock('RenderInstances2D');

    b.wire(ellipse, 'shape', array, 'element');
    b.wire(array, 'elements', layout, 'elements');
    b.wire(layout, 'controlPoints', render, 'controlPoints');
    b.wire(color, 'out', render, 'color');
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

    const globals = artifact.module.global_variables.map((g): string => g.name);
    expect(globals).toEqual(expect.arrayContaining(['arena_in', 'arena_out', 'state_in', 'state_out', 'uniforms']));

    const structNames = artifact.module.types
      .filter((type) => type.kind === 'struct')
      .map((type) => type.name);
    const globalNameSet = new Set<string>(globals);
    const collidingNames = structNames.filter((name) => globalNameSet.has(name));
    expect(collidingNames).toEqual([]);
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

  it('treats non-compute schedule steps as boundary work (not incomplete lowering)', () => {
    const result = compile(buildRenderPatch());
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const artifact = result.program.nagaLoweringProgram;
    expect(artifact).toBeDefined();
    if (!artifact) return;

    expect(artifact.coverage.totalStepCount).toBeGreaterThan(0);
    expect(artifact.coverage.boundaryStepCount).toBeGreaterThan(0);

    const placeholderComments = artifact.module.functions[0]?.statements.filter(
      (statement) =>
        statement.kind === 'comment'
        && statement.text.includes('lowered in non-compute stage'),
    );
    expect(placeholderComments?.length ?? 0).toBe(0);
  });

  it('covers render-math opcode lowering without incomplete-lowering warnings', () => {
    const result = compile(buildRenderPatch());
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const artifact = result.program.nagaLoweringProgram;
    expect(artifact).toBeDefined();
    if (!artifact) return;
    expect(artifact.coverage.droppedComputeStepCount).toBe(0);
    const warningCodes = result.warnings.map((warning) => warning.code);
    expect(warningCodes).not.toContain('W_NAGA_LOWERING_INCOMPLETE');
  });
});
