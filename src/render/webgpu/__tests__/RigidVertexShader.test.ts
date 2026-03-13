import { describe, expect, it } from 'vitest';
import {
  buildRigidVertexShader,
  DEFAULT_RIGID_INSTANCE_LAYOUT,
} from '../RigidVertexShader';

describe('buildRigidVertexShader', () => {
  it('produces a valid NagaModule with vertex entry point', () => {
    const { module } = buildRigidVertexShader();

    // Entry point
    expect(module.entry_points).toHaveLength(1);
    expect(module.entry_points[0].stage).toBe('vertex');
    expect(module.entry_points[0].function).toBe('vertex_main');

    // Functions
    expect(module.functions).toHaveLength(1);
    const fn = module.functions[0];
    expect(fn.name).toBe('vertex_main');
    expect(fn.arguments).toHaveLength(2);
    expect(fn.arguments[0].builtin).toBe('vertex_index');
    expect(fn.arguments[1].builtin).toBe('instance_index');
    expect(fn.returnType).not.toBeNull();

    // Global variables (buffer bindings)
    expect(module.global_variables).toHaveLength(2);
    expect(module.global_variables[0].name).toBe('arena');
    expect(module.global_variables[0].binding).toEqual({ group: 0, binding: 0 });
    expect(module.global_variables[1].name).toBe('shape_bank');
    expect(module.global_variables[1].binding).toEqual({ group: 0, binding: 1 });
  });

  it('uses custom layout when provided', () => {
    const customLayout = {
      ...DEFAULT_RIGID_INSTANCE_LAYOUT,
      instanceStride: 12,
      scaleOffset: 5,
    };
    const { module } = buildRigidVertexShader(customLayout);

    // Should still produce a valid module
    expect(module.entry_points).toHaveLength(1);
    expect(module.functions).toHaveLength(1);
    expect(module.global_variables).toHaveLength(2);
  });

  it('produces expressions with proper GlobalVariable references', () => {
    const { module } = buildRigidVertexShader();
    const fn = module.functions[0];

    // Expression arena should contain GlobalVariable expressions
    const globalVarExprs = fn.expressions.filter(
      (e) => e.type === 'GlobalVariable',
    );
    expect(globalVarExprs.length).toBe(2); // arena + shape_bank

    // Access expressions should reference GlobalVariable expression handles
    const accessExprs = fn.expressions.filter((e) => e.type === 'Access');
    expect(accessExprs.length).toBeGreaterThan(0);

    // Every Access.base should point to a GlobalVariable or another Access (not FunctionArgument)
    for (const access of accessExprs) {
      if (access.type !== 'Access') continue;
      const baseExpr = fn.expressions[access.base];
      expect(
        baseExpr.type === 'GlobalVariable' || baseExpr.type === 'Access',
      ).toBe(true);
    }
  });

  it('output struct has @builtin(position) and @location(0) fields', () => {
    const { module } = buildRigidVertexShader();

    // Find the VertexOutput struct type
    const structType = module.types.find(
      (t) => t.kind === 'Struct' && t.name === 'VertexOutput',
    );
    expect(structType).toBeDefined();
    if (structType?.kind !== 'Struct') return;

    expect(structType.fields).toHaveLength(2);
    expect(structType.fields[0].name).toBe('position');
    expect(structType.fields[0].builtin).toBe('position');
    expect(structType.fields[1].name).toBe('color');
    expect(structType.fields[1].location).toBe(0);
  });

  it('function body contains Return statement', () => {
    const { module } = buildRigidVertexShader();
    const fn = module.functions[0];

    const returnStmts = fn.statements.filter((s) => s.type === 'Return');
    expect(returnStmts.length).toBeGreaterThanOrEqual(1);
  });

  it('produces Compose expressions for vec4 and struct outputs', () => {
    const { module } = buildRigidVertexShader();
    const fn = module.functions[0];

    const composeExprs = fn.expressions.filter((e) => e.type === 'Compose');
    // At minimum: 2 vec4f (position, color) + 1 struct (VertexOutput)
    expect(composeExprs.length).toBeGreaterThanOrEqual(3);
  });

  it('applies bitcast (As with convert=false) for f32↔u32 conversions', () => {
    const { module } = buildRigidVertexShader();
    const fn = module.functions[0];

    const asExprs = fn.expressions.filter((e) => e.type === 'As');
    // shapeId: f32→u32 bitcast, localX: u32→f32, localY: u32→f32
    expect(asExprs.length).toBeGreaterThanOrEqual(3);
    for (const asExpr of asExprs) {
      if (asExpr.type !== 'As') continue;
      expect(asExpr.convert).toBe(false);
    }
  });
});
