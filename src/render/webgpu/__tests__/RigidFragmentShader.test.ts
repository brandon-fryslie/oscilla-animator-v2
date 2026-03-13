import { describe, expect, it } from 'vitest';
import { buildRigidFragmentShader } from '../RigidFragmentShader';

describe('buildRigidFragmentShader', () => {
  it('produces a valid NagaModule with fragment entry point', () => {
    const { module } = buildRigidFragmentShader();

    expect(module.entry_points).toHaveLength(1);
    expect(module.entry_points[0].stage).toBe('fragment');
    expect(module.entry_points[0].function).toBe('fragment_main');

    expect(module.functions).toHaveLength(1);
    const fn = module.functions[0];
    expect(fn.name).toBe('fragment_main');
    expect(fn.arguments).toHaveLength(1);
    expect(fn.returnType).not.toBeNull();
  });

  it('has no global buffer bindings (pass-through shader)', () => {
    const { module } = buildRigidFragmentShader();
    expect(module.global_variables).toHaveLength(0);
  });

  it('input struct has @builtin(position) and @location(0) fields', () => {
    const { module } = buildRigidFragmentShader();

    const structType = module.types.find(
      (t) => t.kind === 'Struct' && t.name === 'FragmentInput',
    );
    expect(structType).toBeDefined();
    if (structType?.kind !== 'Struct') return;

    expect(structType.fields).toHaveLength(2);
    expect(structType.fields[0].builtin).toBe('position');
    expect(structType.fields[1].location).toBe(0);
  });

  it('extracts color from input struct via AccessIndex', () => {
    const { module } = buildRigidFragmentShader();
    const fn = module.functions[0];

    const accessIndexExprs = fn.expressions.filter(
      (e) => e.type === 'AccessIndex',
    );
    expect(accessIndexExprs.length).toBe(1);
    // Access color field at index 1
    if (accessIndexExprs[0].type === 'AccessIndex') {
      expect(accessIndexExprs[0].index).toBe(1);
    }
  });

  it('returns the color value directly', () => {
    const { module } = buildRigidFragmentShader();
    const fn = module.functions[0];

    const returnStmts = fn.statements.filter((s) => s.type === 'Return');
    expect(returnStmts.length).toBe(1);
    // Return statement should have a value (the color)
    if (returnStmts[0].type === 'Return') {
      expect(returnStmts[0].value).toBeDefined();
    }
  });
});
