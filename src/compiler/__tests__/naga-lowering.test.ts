import { describe, expect, it } from 'vitest';
import { buildPatch } from '../../graph';
import { collectNagaLoweringCoverageDiagnostics, compile } from '../compile';
import { lowerScheduleToNagaModule } from '../ir/naga-emitter';
import type { RuntimeAddressTableIR } from '../ir/program';
import type { ScheduleIR } from '../backend/schedule-program';
import type { ValueExpr } from '../ir/value-expr';

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

function buildMinimalSchedule(steps: readonly unknown[]): ScheduleIR {
  return {
    timeModel: {
      periodAMs: 1000,
      periodBMs: 2000,
    },
    instances: new Map(),
    steps: steps as ScheduleIR['steps'],
    stateSlotCount: 0,
    stateMappings: [],
    eventSlotCount: 0,
    eventCount: 0,
  };
}

function buildRuntimeAddressTable(args: {
  readonly slotEntries?: ReadonlyArray<{ readonly slot: number; readonly offset: number; readonly laneCount: number; readonly stride: number }>;
} = {}): RuntimeAddressTableIR {
  const slotLookup = new Map();
  const slotToArena = new Map();
  for (const entry of args.slotEntries ?? []) {
    slotLookup.set(entry.slot, {
      storage: 'f32',
    });
    slotToArena.set(entry.slot, {
      offset: entry.offset,
      laneCount: entry.laneCount,
      stride: entry.stride,
      packing: 'soa',
      laneStride: 1,
      componentStride: entry.laneCount,
      length: entry.stride,
    });
  }
  return {
    slotLookup,
    fieldExprToSlot: new Map(),
    scalarExprToArenaAddress: new Map(),
    slotToArena,
  } as RuntimeAddressTableIR;
}

describe('naga lowering artifact metadata', () => {
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
});

describe('naga lowering artifact render coverage', () => {
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
    expect(artifact.coverage.fallbackValueCount).toBe(0);
    expect(artifact.coverage.maxFallbackCascadeDepth).toBe(0);
    const warningCodes = result.warnings.map((warning) => warning.code);
    expect(warningCodes).not.toContain('W_NAGA_LOWERING_INCOMPLETE');
  });
});

describe('naga lowering coverage diagnostics', () => {
  it('emits hard-drop compile diagnostics when compute step metadata is missing', () => {
    const schedule = buildMinimalSchedule([
      {
        kind: 'materialize',
        field: 0,
        instanceId: 0,
        target: 17,
      },
    ]);
    const valueExprs = [
      {
        kind: 'const',
        type: {} as ValueExpr['type'],
        value: { kind: 'float', value: 1 },
      },
    ] as readonly ValueExpr[];
    const lowered = lowerScheduleToNagaModule({
      schedule,
      runtimeAddressTable: buildRuntimeAddressTable(),
      valueExprs,
      exprToBlock: new Map(),
    });

    expect(lowered.coverage.droppedComputeStepCount).toBeGreaterThan(0);
    expect(lowered.coverage.hardDropReasonCounts.missing_target_slot_metadata).toBeGreaterThan(0);

    const diagnostics = collectNagaLoweringCoverageDiagnostics(lowered.coverage);
    expect(diagnostics.errors.length).toBe(1);
    expect(diagnostics.warnings.length).toBe(0);
  });

  it('emits fallback warning diagnostics without hard drops for unsupported expression lowering', () => {
    const schedule = buildMinimalSchedule([
      {
        kind: 'materialize',
        field: 0,
        instanceId: 0,
        target: 1,
      },
    ]);
    const valueExprs = [
      {
        kind: 'kernel',
        kernelKind: 'map',
        type: {} as ValueExpr['type'],
        input: 1,
        fn: { kind: 'expr', expr: 'x' },
      },
      {
        kind: 'const',
        type: {} as ValueExpr['type'],
        value: { kind: 'float', value: 1 },
      },
    ] as readonly ValueExpr[];
    const lowered = lowerScheduleToNagaModule({
      schedule,
      runtimeAddressTable: buildRuntimeAddressTable({
        slotEntries: [{ slot: 1, offset: 0, laneCount: 1, stride: 1 }],
      }),
      valueExprs,
      exprToBlock: new Map(),
    });

    expect(lowered.coverage.droppedComputeStepCount).toBe(0);
    expect(lowered.coverage.fallbackValueCount).toBeGreaterThan(0);
    expect(lowered.coverage.maxFallbackCascadeDepth).toBeGreaterThanOrEqual(0);

    const diagnostics = collectNagaLoweringCoverageDiagnostics(lowered.coverage);
    expect(diagnostics.errors.length).toBe(0);
    expect(diagnostics.warnings.length).toBe(1);
    expect(diagnostics.warnings[0]?.code).toBe('W_NAGA_LOWERING_INCOMPLETE');
  });
});

describe('naga lowering artifact lane addressing', () => {
  it('clamps lane addressing to slot cardinality in compute lowering', () => {
    const result = compile(buildRenderPatch());
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const artifact = result.program.nagaLoweringProgram;
    expect(artifact).toBeDefined();
    if (!artifact) return;

    const mainFn = artifact.module.functions[0];
    const argumentExprId = mainFn.expressions.findIndex(
      (expr) => expr.kind === 'argument' && expr.argument === 0,
    );
    expect(argumentExprId).toBeGreaterThanOrEqual(0);

    const laneExprId = mainFn.expressions.findIndex(
      (expr) => expr.kind === 'access_index' && expr.base === argumentExprId && expr.index === 0,
    );
    expect(laneExprId).toBeGreaterThanOrEqual(0);

    const laneBoundsChecks = mainFn.expressions.filter((expr) => {
      if (expr.kind !== 'binary' || expr.op !== 'lt' || expr.left !== laneExprId) {
        return false;
      }
      const rightExpr = mainFn.expressions[expr.right];
      return rightExpr?.kind === 'constant';
    });
    expect(laneBoundsChecks.length).toBeGreaterThan(0);
  });
});
