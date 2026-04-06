/**
 * Parser tests for the expression DSL.
 *
 * Focus: grammar coverage and error reporting. Compiler-level semantics
 * (field resolution, function validation) are tested separately in
 * compile.test.ts.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '../parse';
import type { BinaryExpr, CallExpr, NumberLiteral, UnaryExpr } from '../ast';

describe('expression DSL parser', () => {
  it('parses a single assignment', () => {
    const { program, errors } = parse('pos_x = 0.75');
    expect(errors).toEqual([]);
    expect(program.assignments).toHaveLength(1);
    const a = program.assignments[0];
    expect(a.field).toBe('pos_x');
    expect(a.value.kind).toBe('Number');
    expect((a.value as NumberLiteral).value).toBe(0.75);
  });

  it('parses multiple assignments separated by newlines', () => {
    const src = `
      pos_x = pos_x * 0.75
      pos_y = pos_y * 0.75
      color_r = 0.2
    `;
    const { program, errors } = parse(src);
    expect(errors).toEqual([]);
    expect(program.assignments).toHaveLength(3);
    expect(program.assignments.map((a) => a.field)).toEqual([
      'pos_x', 'pos_y', 'color_r',
    ]);
  });

  it('respects operator precedence: * binds tighter than +', () => {
    // 1 + 2 * 3  →  1 + (2 * 3), not (1 + 2) * 3
    const { program, errors } = parse('x = 1 + 2 * 3');
    expect(errors).toEqual([]);
    const top = program.assignments[0].value as BinaryExpr;
    expect(top.kind).toBe('BinaryExpr');
    expect(top.op).toBe('+');
    expect((top.left as NumberLiteral).value).toBe(1);
    const right = top.right as BinaryExpr;
    expect(right.kind).toBe('BinaryExpr');
    expect(right.op).toBe('*');
    expect((right.left as NumberLiteral).value).toBe(2);
    expect((right.right as NumberLiteral).value).toBe(3);
  });

  it('parentheses override precedence', () => {
    // (1 + 2) * 3  →  (1 + 2) at top-left of a *
    const { program, errors } = parse('x = (1 + 2) * 3');
    expect(errors).toEqual([]);
    const top = program.assignments[0].value as BinaryExpr;
    expect(top.kind).toBe('BinaryExpr');
    expect(top.op).toBe('*');
    const left = top.left as BinaryExpr;
    expect(left.kind).toBe('BinaryExpr');
    expect(left.op).toBe('+');
  });

  it('parses unary minus on factors', () => {
    const { program, errors } = parse('x = -5');
    expect(errors).toEqual([]);
    const top = program.assignments[0].value as UnaryExpr;
    expect(top.kind).toBe('UnaryExpr');
    expect(top.op).toBe('-');
    expect((top.operand as NumberLiteral).value).toBe(5);
  });

  it('parses nested function calls', () => {
    const { program, errors } = parse('x = sin(cos(y) * 2)');
    expect(errors).toEqual([]);
    const top = program.assignments[0].value as CallExpr;
    expect(top.kind).toBe('CallExpr');
    expect(top.func).toBe('sin');
    expect(top.args).toHaveLength(1);
    const arg = top.args[0] as BinaryExpr;
    expect(arg.kind).toBe('BinaryExpr');
    const inner = arg.left as CallExpr;
    expect(inner.kind).toBe('CallExpr');
    expect(inner.func).toBe('cos');
  });

  it('parses function calls with multiple args', () => {
    const { program, errors } = parse('x = clamp(y, 0, 1)');
    expect(errors).toEqual([]);
    const top = program.assignments[0].value as CallExpr;
    expect(top.kind).toBe('CallExpr');
    expect(top.func).toBe('clamp');
    expect(top.args).toHaveLength(3);
  });

  it('parses no-arg function calls', () => {
    const { program, errors } = parse('x = something()');
    expect(errors).toEqual([]);
    const top = program.assignments[0].value as CallExpr;
    expect(top.kind).toBe('CallExpr');
    expect(top.args).toHaveLength(0);
  });

  it('skips # line comments', () => {
    const src = `
      # this is a comment
      pos_x = 1
      # another comment
      pos_y = 2
    `;
    const { program, errors } = parse(src);
    expect(errors).toEqual([]);
    expect(program.assignments).toHaveLength(2);
  });

  it('skips // line comments', () => {
    const src = `
      // this is a comment
      x = 1 // trailing
      y = 2
    `;
    const { program, errors } = parse(src);
    expect(errors).toEqual([]);
    expect(program.assignments).toHaveLength(2);
  });

  it('tolerates blank lines', () => {
    const src = '\n\n  x = 1\n\n  y = 2\n\n';
    const { program, errors } = parse(src);
    expect(errors).toEqual([]);
    expect(program.assignments).toHaveLength(2);
  });

  it('reports error with line number on malformed assignment', () => {
    const src = `
      x = 1
      = 2
      y = 3
    `;
    const { program, errors } = parse(src);
    expect(errors.length).toBeGreaterThan(0);
    // Line 3 should be flagged
    expect(errors.some((e) => e.line === 3)).toBe(true);
    // Recovery: x and y should still parse
    const fields = program.assignments.map((a) => a.field);
    expect(fields).toContain('x');
    expect(fields).toContain('y');
  });

  it('reports error on unclosed paren', () => {
    const { errors } = parse('x = (1 + 2');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain("')'");
  });

  it('reports error on missing equals', () => {
    const { errors } = parse('x 5');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain("'='");
  });

  it('parses field-on-field expressions', () => {
    const { program, errors } = parse('pos_y = sin(pos_x * 2)');
    expect(errors).toEqual([]);
    const top = program.assignments[0].value as CallExpr;
    expect(top.kind).toBe('CallExpr');
    expect(top.func).toBe('sin');
  });

  it('handles decimal numbers correctly', () => {
    const { program, errors } = parse('x = 0.75');
    expect(errors).toEqual([]);
    expect((program.assignments[0].value as NumberLiteral).value).toBe(0.75);
  });
});
