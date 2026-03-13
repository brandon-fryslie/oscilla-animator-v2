import { describe, expect, it } from 'vitest';
import { buildPatch } from '../../graph';
import { compile } from '../compile';
import { NagaBuilder } from '../ir/naga-emitter/NagaBuilder';
import { lowerToNagaModule } from '../ir/naga-emitter/lower-to-naga-module';
import { collectNagaValidationIssues } from '../ir/naga-emitter/NagaValidator';
import { NagaScalarKind } from '../ir/naga-emitter/naga-types';
import { buildDrawPrepModule } from '../../render/webgpu/DrawPrepKernel';

function buildSimplePatch() {
  return buildPatch((b) => {
    const time = b.addBlock('InfiniteTimeRoot');
    b.setPortDefault(time, 'periodAMs', 1000);
    b.setPortDefault(time, 'periodBMs', 2000);
    const osc = b.addBlock('Oscillator');
    b.wire(time, 'phaseA', osc, 'phase');
  });
}

describe('Naga structure validation', () => {
  it('lowers compile output to a Naga module without loweringError', () => {
    const compiled = compile(buildSimplePatch());
    expect(compiled.kind).toBe('ok');
    if (compiled.kind !== 'ok') return;

    const lowered = lowerToNagaModule({
      schedule: compiled.program.schedule,
      valueExprs: compiled.program.valueExprs.nodes,
      arenaLayout: compiled.program.arenaLayout,
      arenaRuntimeLayout: compiled.program.arenaRuntimeLayout,
      runtimeAddressTable: compiled.program.runtimeAddressTable,
      maxActiveLanes: compiled.program.generatedComputeProgram.maxActiveLanes,
    });

    expect(lowered.loweringError).toBeUndefined();
    const module = lowered.module as { functions: readonly unknown[]; entry_points: readonly unknown[] } | null;
    expect(module).not.toBeNull();
    expect(module?.functions.length).toBeGreaterThan(0);
    expect(module?.entry_points.length).toBeGreaterThan(0);
  });

  it('builds DrawPrepKernel module with access expressions rooted in buffer refs', () => {
    const module = buildDrawPrepModule();
    expect(module.functions.length).toBeGreaterThan(0);
    const fn = module.functions[0];

    const accessExpressions = fn.expressions.filter(
      (expr): expr is Extract<(typeof fn.expressions)[number], { type: 'Access' }> => expr.type === 'Access',
    );
    expect(accessExpressions.length).toBeGreaterThan(0);

    for (const accessExpr of accessExpressions) {
      const baseExpr = fn.expressions[accessExpr.base];
      expect(baseExpr).toBeDefined();
      if (!baseExpr) continue;
      expect(baseExpr.type).not.toBe('FunctionArgument');
    }
  });

  it('validates per-function arenas (not only legacy arena)', () => {
    const builder = new NagaBuilder();
    const f32 = builder.getOrCreateScalarType(NagaScalarKind.Float);
    const arrayF32 = builder.getOrCreateArrayType(f32, 'dynamic');
    const bufferVar = builder.declareGlobalVariable('buf', 'storage', 'read', 0, 0, arrayF32);
    const meta = { visualBlockId: 'validator-per-function' } as const;

    builder.beginFunction('main', [], null);
    builder.buildBlock(() => {
      const bufferRef = builder.globalVariableRef(bufferVar, arrayF32, meta);
      const floatIndex = builder.literalFloat(1, meta);
      builder.unsafeAppendExpressionForTesting(
        { type: 'Access', base: bufferRef.nagaHandle, index: floatIndex.nagaHandle },
        meta,
      );
    });
    builder.endFunction();

    expect(builder.expressions.toArray()).toHaveLength(0);
    const issues = collectNagaValidationIssues(builder);
    expect(
      issues.some((issue) => issue.message.includes('Access (array indexing) requires integer scalar index.')),
    ).toBe(true);
  });
});
