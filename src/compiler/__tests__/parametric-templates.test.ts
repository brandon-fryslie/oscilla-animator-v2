import { describe, expect, it } from 'vitest';
import { buildPatch } from '../../graph';
import { compile } from '../compile';
import { buildCompiledRuntimeInstallContract } from '../backend/compiled-runtime-install-contract';
import { ShapeBankHeaderWord } from '../../runtime/RuntimeState';
import { ShapeClass } from '../../shapes/types';

describe('ParametricTemplates vertical slice', () => {
  it('lowers CubicBezierRibbon2D into a packed SoA render path and installs template t values', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot');

      const p0 = b.addBlock('Const');
      b.setConfig(p0, 'value', [0, 0]);
      const p1 = b.addBlock('Const');
      b.setConfig(p1, 'value', [0.2, 0.4]);
      const p2 = b.addBlock('Const');
      b.setConfig(p2, 'value', [0.8, -0.2]);
      const p3 = b.addBlock('Const');
      b.setConfig(p3, 'value', [1, 0.1]);

      const ribbon = b.addBlock('CubicBezierRibbon2D');
      b.setPortDefault(ribbon, 'resolution', 8);
      b.setPortDefault(ribbon, 'thickness', 0.05);

      b.wire(p0, 'out', ribbon, 'p0');
      b.wire(p1, 'out', ribbon, 'p1');
      b.wire(p2, 'out', ribbon, 'p2');
      b.wire(p3, 'out', ribbon, 'p3');
    });

    const result = compile(patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const renderStep = result.program.schedule.steps.find(
      (step): step is Extract<typeof result.program.schedule.steps[number], { kind: 'render' }> => step.kind === 'render',
    );
    expect(renderStep).toBeDefined();
    expect(renderStep?.parametricParamsSlot).toBeDefined();

    const paramSlot = renderStep!.parametricParamsSlot!;
    const paramMaterializeSteps = result.program.schedule.steps.filter(
      (step): step is Extract<typeof result.program.schedule.steps[number], { kind: 'materialize' }> =>
        step.kind === 'materialize' && step.target === paramSlot,
    );
    expect(paramMaterializeSteps.map((step) => step.componentOffset)).toEqual([0, 2, 4, 6, 8]);

    const paramSlotDescriptor = result.program.runtimeAddressTable.slotToArena.get(paramSlot);
    expect(paramSlotDescriptor).toBeDefined();
    expect(paramSlotDescriptor?.stride).toBe(9);

    expect(result.program.drawPrepProgram.sinks).toHaveLength(1);
    expect(result.program.drawPrepProgram.sinks[0]?.shapeClass).toBe(ShapeClass.ParametricTemplate);

    const install = buildCompiledRuntimeInstallContract(result.program);
    const header = install.shapeBank.words;
    expect(header[ShapeBankHeaderWord.Kind]).toBe(ShapeClass.ParametricTemplate);
    expect(header[ShapeBankHeaderWord.VertexCount]).toBe(18);
    expect(header[ShapeBankHeaderWord.ParamBlockWords]).toBe(9);

    const tWordOffset = header[ShapeBankHeaderWord.ParamBlockOffset]!;
    const tWords = header.slice(tWordOffset, tWordOffset + 9);
    const tValues = new Float32Array(tWords.buffer, tWords.byteOffset, tWords.length);
    expect(Array.from(tValues)).toEqual([0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1]);
  });
});
