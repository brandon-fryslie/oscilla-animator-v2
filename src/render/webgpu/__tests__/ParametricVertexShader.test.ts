import { describe, expect, it } from 'vitest';
import {
  buildParametricVertexShader,
  DEFAULT_PARAMETRIC_INSTANCE_LAYOUT,
} from '../ParametricVertexShader';

describe('buildParametricVertexShader', () => {
  it('produces a valid NagaModule with vertex entry point', () => {
    const { module } = buildParametricVertexShader();

    expect(module.entry_points).toHaveLength(1);
    expect(module.entry_points[0].stage).toBe('vertex');
    expect(module.entry_points[0].function).toBe('vertex_main');

    expect(module.functions).toHaveLength(1);
    const fn = module.functions[0];
    expect(fn.name).toBe('vertex_main');
    expect(fn.arguments).toHaveLength(2);
    expect(fn.arguments[0].builtin).toBe('vertex_index');
    expect(fn.arguments[1].builtin).toBe('instance_index');
    expect(fn.returnType).not.toBeNull();
  });

  it('declares arena and shape_bank buffer bindings', () => {
    const { module } = buildParametricVertexShader();

    expect(module.global_variables).toHaveLength(2);
    expect(module.global_variables[0].name).toBe('arena');
    expect(module.global_variables[0].binding).toEqual({ group: 0, binding: 0 });
    expect(module.global_variables[1].name).toBe('shape_bank');
    expect(module.global_variables[1].binding).toEqual({ group: 0, binding: 1 });
  });

  it('uses custom layout when provided', () => {
    const customLayout = {
      ...DEFAULT_PARAMETRIC_INSTANCE_LAYOUT,
      instanceStride: 16,
    };
    const { module } = buildParametricVertexShader(customLayout);

    expect(module.entry_points).toHaveLength(1);
    expect(module.functions).toHaveLength(1);
  });

  it('does NOT use dynamic array indexing for control points (AC 3.1)', () => {
    const { module } = buildParametricVertexShader();
    const fn = module.functions[0];

    // All buffer reads use Access expressions, not dynamic array loads
    // from a control-point array. Each control point is a separate
    // Access+Load from the arena at a static offset from arenaBase.
    //
    // The Access expressions should reference GlobalVariable (buffer ref)
    // as base, never another Access (which would indicate array-of-arrays).
    const accessExprs = fn.expressions.filter((e) => e.type === 'Access');
    for (const access of accessExprs) {
      if (access.type !== 'Access') continue;
      const baseExpr = fn.expressions[access.base];
      // Base should be GlobalVariable (direct buffer access)
      expect(baseExpr.type).toBe('GlobalVariable');
    }
  });

  it('produces Compose expressions for vec4 and struct outputs', () => {
    const { module } = buildParametricVertexShader();
    const fn = module.functions[0];

    const composeExprs = fn.expressions.filter((e) => e.type === 'Compose');
    // At minimum: 2 vec4f (position, color) + 1 struct (VertexOutput)
    expect(composeExprs.length).toBeGreaterThanOrEqual(3);
  });

  it('includes Math expressions for Bezier evaluation (sin/cos/sqrt)', () => {
    const { module } = buildParametricVertexShader();
    const fn = module.functions[0];

    // Bezier evaluation uses sqrt for tangent length
    const mathExprs = fn.expressions.filter((e) => e.type === 'Math');
    const hasSqrt = mathExprs.some(
      (e) => e.type === 'Math' && e.fun === 'Sqrt',
    );
    expect(hasSqrt).toBe(true);
  });

  it('output struct has @builtin(position) and @location(0)', () => {
    const { module } = buildParametricVertexShader();

    const structType = module.types.find(
      (t) => t.kind === 'Struct' && t.name === 'VertexOutput',
    );
    expect(structType).toBeDefined();
    if (structType?.kind !== 'Struct') return;

    expect(structType.fields).toHaveLength(2);
    expect(structType.fields[0].builtin).toBe('position');
    expect(structType.fields[1].location).toBe(0);
  });

  it('has bitcast for t-value (u32→f32) from ShapeBank', () => {
    const { module } = buildParametricVertexShader();
    const fn = module.functions[0];

    const asExprs = fn.expressions.filter((e) => e.type === 'As');
    // At least one bitcast: t-value u32→f32
    expect(asExprs.length).toBeGreaterThanOrEqual(1);
    const hasBitcast = asExprs.some(
      (e) => e.type === 'As' && e.kind === 'Float' && e.convert === false,
    );
    expect(hasBitcast).toBe(true);
  });
});
