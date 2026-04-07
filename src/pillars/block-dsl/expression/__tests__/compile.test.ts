/**
 * Compiler tests for the expression DSL.
 *
 * Focus: semantic validation (field existence, function validation,
 * duplicate detection) and ExprIR shape correctness.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '../parse';
import { applyExpression, compileProgram } from '../compile';
import { litF32, binop } from '../../../../render/gpu-ir/ir-builders';
import type { SourceBundle } from '../../types';

function makeBundle(): SourceBundle {
  return {
    pos_x: litF32(0.1),
    pos_y: litF32(0.2),
    color_r: litF32(1),
    color_g: litF32(0.5),
    color_b: litF32(0.25),
  };
}

describe('expression DSL compiler', () => {
  it('compiles a literal assignment to LiteralF32', () => {
    const { program } = parse('color_r = 0.2');
    const { assignments, errors } = compileProgram(program, makeBundle());
    expect(errors).toEqual([]);
    expect(assignments.size).toBe(1);
    const expr = assignments.get('color_r')!;
    expect(expr.type).toBe('LiteralF32');
    expect((expr as { value: number }).value).toBe(0.2);
  });

  it('resolves FieldRef against the input bundle', () => {
    const bundle: SourceBundle = { x: binop('+', litF32(1), litF32(2)), y: litF32(0) };
    const { program } = parse('y = x');
    const { assignments, errors } = compileProgram(program, bundle);
    expect(errors).toEqual([]);
    // The compiled expression for y should be IDENTICAL to x's ExprIR
    // (same reference — FieldRef just looks up the upstream tree).
    expect(assignments.get('y')).toBe(bundle.x);
  });

  it('compiles BinaryExpr to a matching binop node', () => {
    const { program } = parse('pos_x = pos_x * 0.75');
    const { assignments, errors } = compileProgram(program, makeBundle());
    expect(errors).toEqual([]);
    const expr = assignments.get('pos_x') as { type: string; op: string; right: { type: string; value: number } };
    expect(expr.type).toBe('BinaryOp');
    expect(expr.op).toBe('*');
    expect(expr.right.type).toBe('LiteralF32');
    expect(expr.right.value).toBe(0.75);
  });

  it('compiles CallExpr to CallBuiltin for known functions', () => {
    const { program } = parse('pos_y = sin(pos_x)');
    const { assignments, errors } = compileProgram(program, makeBundle());
    expect(errors).toEqual([]);
    const expr = assignments.get('pos_y') as { type: string; func: string };
    expect(expr.type).toBe('CallBuiltin');
    expect(expr.func).toBe('sin');
  });

  it('errors when assigning to a non-existent field', () => {
    const { program } = parse('bogus = 1');
    const { errors } = compileProgram(program, makeBundle());
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain("'bogus'");
  });

  it('errors when referencing a non-existent field', () => {
    const { program } = parse('pos_x = bogus');
    const { errors } = compileProgram(program, makeBundle());
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain("'bogus'");
  });

  it('errors on unknown function', () => {
    const { program } = parse('pos_x = wobble(pos_y)');
    const { errors } = compileProgram(program, makeBundle());
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain("'wobble'");
  });

  it('errors on duplicate assignment to the same field', () => {
    const src = `
      pos_x = 1
      pos_x = 2
    `;
    const { program } = parse(src);
    const { errors } = compileProgram(program, makeBundle());
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.message.includes('duplicate'))).toBe(true);
  });

  it('accumulates multiple errors instead of stopping at the first', () => {
    const src = `
      bogus1 = 1
      bogus2 = 2
    `;
    const { program } = parse(src);
    const { errors } = compileProgram(program, makeBundle());
    expect(errors.length).toBe(2);
  });

  it('applyExpression returns a new bundle with modified fields', () => {
    const bundle = makeBundle();
    const result = applyExpression('color_r = 0.2', bundle);
    expect(result.color_r).not.toBe(bundle.color_r);
    expect((result.color_r as { value: number }).value).toBe(0.2);
    // Unmodified fields pass through by reference
    expect(result.pos_x).toBe(bundle.pos_x);
    expect(result.pos_y).toBe(bundle.pos_y);
    expect(result.color_g).toBe(bundle.color_g);
    expect(result.color_b).toBe(bundle.color_b);
  });

  it('applyExpression throws on parse error', () => {
    expect(() => applyExpression('x =', makeBundle())).toThrow(/parse/i);
  });

  it('applyExpression throws on compile error', () => {
    expect(() => applyExpression('bogus = 1', makeBundle())).toThrow(/compile/i);
  });

  it('compiles the orbit-ring fixture expression end-to-end', () => {
    // Matches SHRINK_AND_TINT in src/pillars/fixtures/orbit-ring.ts
    const src = `
      pos_x = pos_x * 0.75
      pos_y = pos_y * 0.75
      color_r = 0.2
    `;
    const bundle = makeBundle();
    const result = applyExpression(src, bundle);
    // pos_x: BinaryOp('*', originalPosX, 0.75)
    const posX = result.pos_x as { type: string; op: string; right: { value: number } };
    expect(posX.type).toBe('BinaryOp');
    expect(posX.op).toBe('*');
    expect(posX.right.value).toBe(0.75);
    // color_r: LiteralF32(0.2)
    const colorR = result.color_r as { type: string; value: number };
    expect(colorR.type).toBe('LiteralF32');
    expect(colorR.value).toBe(0.2);
    // color_g and color_b pass through by reference — the record spread
    // copies the original ExprIR trees unchanged.
    expect(result.color_g).toBe(bundle.color_g);
    expect(result.color_b).toBe(bundle.color_b);
  });

  it('compiles a nested call like sin(pos_x * 2)', () => {
    const result = applyExpression('pos_y = sin(pos_x * 2)', makeBundle());
    const expr = result.pos_y as { type: string; func: string; args: readonly unknown[] };
    expect(expr.type).toBe('CallBuiltin');
    expect(expr.func).toBe('sin');
    expect(expr.args).toHaveLength(1);
  });

  // ---------------------------------------------------------------------
  // Namespace-qualified references (slice 3)
  // ---------------------------------------------------------------------

  it('resolves qualified FieldRef against a secondary bundle', () => {
    const primary = makeBundle();
    const clockBundle: SourceBundle = { time: litF32(1.5) };
    const result = applyExpression(
      'pos_x = clock.time',
      primary,
      { clock: clockBundle },
    );
    // pos_x should now reference the clock bundle's `time` expression
    // (same reference — FieldRef just looks up the upstream tree).
    expect(result.pos_x).toBe(clockBundle.time);
  });

  it('resolves explicit primary.field the same as bare field', () => {
    const primary = makeBundle();
    const result = applyExpression('pos_x = primary.pos_y', primary);
    // primary.pos_y resolves to the same ExprIR as pos_y
    expect(result.pos_x).toBe(primary.pos_y);
  });

  it('compiles mixed primary + clock expression', () => {
    const primary = makeBundle();
    const clockBundle: SourceBundle = { time: litF32(0) };
    const result = applyExpression(
      'pos_x = primary.pos_x + sin(clock.time * 2.0) * 0.1',
      primary,
      { clock: clockBundle },
    );
    // Top level: + with primary.pos_x on the left
    const posX = result.pos_x as {
      type: string;
      op: string;
      left: unknown;
      right: { type: string; op: string; left: { type: string; func: string } };
    };
    expect(posX.type).toBe('BinaryOp');
    expect(posX.op).toBe('+');
    expect(posX.left).toBe(primary.pos_x);
    // Right: sin(...) * 0.1
    expect(posX.right.type).toBe('BinaryOp');
    expect(posX.right.op).toBe('*');
    expect(posX.right.left.type).toBe('CallBuiltin');
    expect(posX.right.left.func).toBe('sin');
  });

  it('errors on unknown bundle namespace', () => {
    const { program } = parse('pos_x = unknown.foo');
    const { errors } = compileProgram(program, makeBundle());
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain("unknown bundle 'unknown'");
    // Available bundles message lists 'primary'
    expect(errors[0].message).toContain('primary');
  });

  it('errors on unknown field within a known bundle', () => {
    const { program } = parse('pos_x = clock.missing');
    const clockBundle: SourceBundle = { time: litF32(0) };
    const { errors } = compileProgram(program, makeBundle(), { clock: clockBundle });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain("unknown field 'clock.missing'");
    // Error message names the bundle that was searched
    expect(errors[0].message).toContain("bundle 'clock'");
    // And lists the available fields in that bundle
    expect(errors[0].message).toContain('time');
  });

  it('primary bundle is always visible under its own name', () => {
    // Even when the caller passes inputBundles without an explicit `primary`
    // entry, `primary.field` still resolves.
    const primary = makeBundle();
    const result = applyExpression('pos_x = primary.pos_y', primary, {});
    expect(result.pos_x).toBe(primary.pos_y);
  });
});
