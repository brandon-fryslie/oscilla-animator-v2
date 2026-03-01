import { describe, expect, it } from 'vitest';
import { buildPatch } from '../../graph';
import { compile } from '../compile';
import { compileProgramWithNaga } from '../naga-compile';

function buildSimplePatch() {
  return buildPatch((b) => {
    const time = b.addBlock('InfiniteTimeRoot');
    b.setPortDefault(time, 'periodAMs', 1000);
    b.setPortDefault(time, 'periodBMs', 2000);

    const osc = b.addBlock('Oscillator');
    b.wire(time, 'phaseA', osc, 'phase');
  });
}

describe('compileProgramWithNaga', () => {
  it('compiles lowering artifact to WGSL', async () => {
    const result = compile(buildSimplePatch());
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const compiled = await compileProgramWithNaga(result.program);
    expect(compiled.kind).toBe('ok');
    if (compiled.kind !== 'ok') return;

    expect(compiled.wgsl).toContain('@compute @workgroup_size(');
    expect(compiled.wgsl).toContain('fn compute_main');
  });

  it('emits lane bounds guard using canonical MAX_ACTIVE_LANES value', async () => {
    const result = compile(buildSimplePatch());
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const expected = result.program.nagaLoweringProgram?.compute.maxActiveLanes;
    expect(expected).toBeDefined();
    if (!expected) return;

    const compiled = await compileProgramWithNaga(result.program);
    expect(compiled.kind).toBe('ok');
    if (compiled.kind !== 'ok') return;

    expect(compiled.wgsl).toContain(`const MAX_ACTIVE_LANES: u32 = ${expected}u;`);
    expect(compiled.wgsl).toContain('if (lane >= MAX_ACTIVE_LANES) {');
  });

  it('fails when compiled program has no lowering artifact', async () => {
    const result = compile(buildSimplePatch());
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const withoutLowering = {
      ...result.program,
      nagaLoweringProgram: undefined,
    };
    const compiled = await compileProgramWithNaga(withoutLowering as typeof result.program);
    expect(compiled.kind).toBe('error');
    if (compiled.kind !== 'error') return;
    expect(compiled.errors.some((error) => error.code === 'IRValidationFailed')).toBe(true);
  });

  it('fails when compiled program has no compute metadata', async () => {
    const result = compile(buildSimplePatch());
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const withoutComputeMetadata = {
      ...result.program,
      nagaLoweringProgram: {
        ...result.program.nagaLoweringProgram!,
        compute: undefined,
      },
    };
    const compiled = await compileProgramWithNaga(withoutComputeMetadata as unknown as typeof result.program);
    expect(compiled.kind).toBe('error');
    if (compiled.kind !== 'error') return;
    expect(
      compiled.errors.some((error) =>
        error.message.includes('Missing or invalid nagaLoweringProgram.compute.maxActiveLanes'),
      ),
    ).toBe(true);
  });

  it('maps validation failures to source block IDs via sourceMap', async () => {
    const result = compile(buildSimplePatch());
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const lowering = result.program.nagaLoweringProgram;
    expect(lowering).toBeDefined();
    if (!lowering) return;

    const fn = lowering.module.functions[0];
    const referencedExprIds = fn.body
      .flatMap((stmt) => (stmt.kind === 'store' ? [stmt.index, stmt.value] : []))
      .filter((exprId) => {
        const source = lowering.sourceMap[`Expr_${exprId}`];
        return source?.blockId !== null && source?.blockId !== undefined;
      });
    expect(referencedExprIds.length).toBeGreaterThan(0);
    if (referencedExprIds.length === 0) return;

    const targetExprId = referencedExprIds[0]!;
    const targetBlockId = lowering.sourceMap[`Expr_${targetExprId}`]!.blockId;
    expect(typeof targetBlockId).toBe('string');
    if (typeof targetBlockId !== 'string') return;

    const baseModule = structuredClone(lowering.module);
    const firstFn = baseModule.functions[0]!;
    const mutatedExpressions = [...firstFn.expressions];
    mutatedExpressions[targetExprId] = {
      kind: 'argument',
      argument: 999,
    };
    const mutatedModule = {
      ...baseModule,
      functions: [
        {
          ...firstFn,
          expressions: mutatedExpressions,
        },
        ...baseModule.functions.slice(1),
      ],
    };

    const faultyProgram = {
      ...result.program,
      nagaLoweringProgram: {
        module: mutatedModule,
        sourceMap: lowering.sourceMap,
        compute: lowering.compute,
      },
    };

    const compiled = await compileProgramWithNaga(faultyProgram as unknown as typeof result.program);
    expect(compiled.kind).toBe('error');
    if (compiled.kind !== 'error') return;
    expect(
      compiled.errors.some((error) => error.where?.blockId === targetBlockId),
    ).toBe(true);
  });

  it('fails fast when lowering module references missing type indices', async () => {
    const result = compile(buildSimplePatch());
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const lowering = result.program.nagaLoweringProgram;
    expect(lowering).toBeDefined();
    if (!lowering) return;

    const faultyProgram = {
      ...result.program,
      nagaLoweringProgram: {
        ...lowering,
        module: {
          ...lowering.module,
          global_variables: lowering.module.global_variables.map((global, index) =>
            index === 0 ? { ...global, type: 999 } : global
          ),
        },
      },
    };

    const compiled = await compileProgramWithNaga(faultyProgram as typeof result.program);
    expect(compiled.kind).toBe('error');
    if (compiled.kind !== 'error') return;
    expect(compiled.errors.some((error) => error.message.includes('Emission Failure'))).toBe(true);
  });

  it('fails when lowering compute metadata has invalid MAX_ACTIVE_LANES', async () => {
    const result = compile(buildSimplePatch());
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const faultyProgram = {
      ...result.program,
      nagaLoweringProgram: {
        ...result.program.nagaLoweringProgram!,
        compute: {
          maxActiveLanes: 0,
        },
      },
    };

    const compiled = await compileProgramWithNaga(faultyProgram as typeof result.program);
    expect(compiled.kind).toBe('error');
    if (compiled.kind !== 'error') return;
    expect(
      compiled.errors.some((error) =>
        error.message.includes('Missing or invalid nagaLoweringProgram.compute.maxActiveLanes')
      ),
    ).toBe(true);
  });
});
