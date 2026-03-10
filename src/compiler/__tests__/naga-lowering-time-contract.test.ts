import { describe, expect, it } from 'vitest';
import { buildPatch } from '../../graph';
import { compile } from '../compile';

function buildPhasePatch() {
  return buildPatch((b) => {
    const time = b.addBlock('InfiniteTimeRoot');
    b.setPortDefault(time, 'periodAMs', 1000);
    b.setPortDefault(time, 'periodBMs', 2000);

    const osc = b.addBlock('Oscillator');
    b.wire(time, 'phaseA', osc, 'phase');
  });
}

describe('naga lowering time contract', () => {
  it('declares uniforms as fixed vec4 array matching runtime ABI', () => {
    const result = compile(buildPhasePatch());
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const module = result.program.nagaLoweringProgram?.module;
    expect(module).toBeDefined();
    if (!module) return;

    const uniformsGlobal = module.global_variables.find((global) => global.name === 'uniforms');
    expect(uniformsGlobal).toBeDefined();
    if (!uniformsGlobal) return;

    const uniformsType = module.types[uniformsGlobal.type];
    expect(uniformsType?.kind).toBe('array');
    if (!uniformsType || uniformsType.kind !== 'array') return;
    expect(uniformsType.size).toBe(5);

    const baseType = module.types[uniformsType.base];
    expect(baseType).toEqual({
      kind: 'vector',
      size: 4,
      scalar: 'f32',
      width: 4,
    });
  });

  it('lowers phase-driven animation through uniforms instead of constants', () => {
    const result = compile(buildPhasePatch());
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const expressions = result.program.nagaLoweringProgram?.module.functions[0]?.expressions ?? [];

    const uniformLoads = expressions.filter(
      (expression) => expression.kind === 'buffer_load' && expression.buffer === 'uniforms',
    );
    expect(uniformLoads.length).toBeGreaterThan(0);

    const fractCalls = expressions.filter(
      (expression) => expression.kind === 'call' && expression.function === 'fract',
    );
    expect(fractCalls.length).toBeGreaterThan(0);
  });
});
