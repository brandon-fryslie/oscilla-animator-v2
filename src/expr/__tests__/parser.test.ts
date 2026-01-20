/**
 * Parser Tests
 */

import { describe, it, expect } from 'vitest';
import { tokenize } from '../lexer';
import { parse } from '../parser';

describe('Parser', () => {
  describe('Literals', () => {
    it('parses integer literal', () => {
      const tokens = tokenize('42');
      const ast = parse(tokens);
      expect(ast.kind).toBe('literal');
      expect((ast as any).value).toBe(42);
    });

    it('parses float literal', () => {
      const tokens = tokenize('3.14');
      const ast = parse(tokens);
      expect(ast.kind).toBe('literal');
      expect((ast as any).value).toBe(3.14);
    });
  });

  describe('Identifiers', () => {
    it('parses identifier', () => {
      const tokens = tokenize('phase');
      const ast = parse(tokens);
      expect(ast.kind).toBe('identifier');
      expect((ast as any).name).toBe('phase');
    });
  });

  describe('Binary Operators', () => {
    it('parses addition', () => {
      const tokens = tokenize('a + b');
      const ast = parse(tokens);
      expect(ast.kind).toBe('binary');
      expect((ast as any).op).toBe('+');
      expect((ast as any).left.name).toBe('a');
      expect((ast as any).right.name).toBe('b');
    });

    it('parses multiplication', () => {
      const tokens = tokenize('a * b');
      const ast = parse(tokens);
      expect(ast.kind).toBe('binary');
      expect((ast as any).op).toBe('*');
    });

    it('respects precedence (multiplication before addition)', () => {
      const tokens = tokenize('a + b * c');
      const ast = parse(tokens);
      expect(ast.kind).toBe('binary');
      expect((ast as any).op).toBe('+');
      expect((ast as any).left.name).toBe('a');
      expect((ast as any).right.kind).toBe('binary');
      expect((ast as any).right.op).toBe('*');
    });

    it('respects parentheses', () => {
      const tokens = tokenize('(a + b) * c');
      const ast = parse(tokens);
      expect(ast.kind).toBe('binary');
      expect((ast as any).op).toBe('*');
      expect((ast as any).left.kind).toBe('binary');
      expect((ast as any).left.op).toBe('+');
      expect((ast as any).right.name).toBe('c');
    });
  });

  describe('Unary Operators', () => {
    it('parses negation', () => {
      const tokens = tokenize('-x');
      const ast = parse(tokens);
      expect(ast.kind).toBe('unary');
      expect((ast as any).op).toBe('-');
      expect((ast as any).arg.name).toBe('x');
    });

    it('parses logical NOT', () => {
      const tokens = tokenize('!flag');
      const ast = parse(tokens);
      expect(ast.kind).toBe('unary');
      expect((ast as any).op).toBe('!');
    });

    it('parses double negation', () => {
      const tokens = tokenize('--x');
      const ast = parse(tokens);
      expect(ast.kind).toBe('unary');
      expect((ast as any).op).toBe('-');
      expect((ast as any).arg.kind).toBe('unary');
      expect((ast as any).arg.op).toBe('-');
    });
  });

  describe('Function Calls', () => {
    it('parses function call with one argument', () => {
      const tokens = tokenize('sin(x)');
      const ast = parse(tokens);
      expect(ast.kind).toBe('call');
      expect((ast as any).fn).toBe('sin');
      expect((ast as any).args).toHaveLength(1);
      expect((ast as any).args[0].name).toBe('x');
    });

    it('parses function call with multiple arguments', () => {
      const tokens = tokenize('min(a, b)');
      const ast = parse(tokens);
      expect(ast.kind).toBe('call');
      expect((ast as any).fn).toBe('min');
      expect((ast as any).args).toHaveLength(2);
    });

    it('parses function call with no arguments', () => {
      const tokens = tokenize('foo()');
      const ast = parse(tokens);
      expect(ast.kind).toBe('call');
      expect((ast as any).args).toHaveLength(0);
    });

    it('parses nested function calls', () => {
      const tokens = tokenize('sin(cos(x))');
      const ast = parse(tokens);
      expect(ast.kind).toBe('call');
      expect((ast as any).fn).toBe('sin');
      expect((ast as any).args[0].kind).toBe('call');
      expect((ast as any).args[0].fn).toBe('cos');
    });
  });

  describe('Ternary Operator', () => {
    it('parses ternary conditional', () => {
      const tokens = tokenize('x > 0 ? 1 : -1');
      const ast = parse(tokens);
      expect(ast.kind).toBe('ternary');
      expect((ast as any).cond.kind).toBe('binary');
      expect((ast as any).then.value).toBe(1);
      expect((ast as any).else.kind).toBe('unary');
    });

    it('parses nested ternary (right-associative)', () => {
      const tokens = tokenize('a ? b : c ? d : e');
      const ast = parse(tokens);
      expect(ast.kind).toBe('ternary');
      expect((ast as any).cond.name).toBe('a');
      expect((ast as any).then.name).toBe('b');
      expect((ast as any).else.kind).toBe('ternary');
    });
  });

  describe('Complex Expressions', () => {
    it('parses complex expression', () => {
      const tokens = tokenize('sin(phase * 2) + 0.5');
      const ast = parse(tokens);
      expect(ast.kind).toBe('binary');
      expect((ast as any).op).toBe('+');
      expect((ast as any).left.kind).toBe('call');
      expect((ast as any).right.value).toBe(0.5);
    });

    it('parses comparison with logical operators', () => {
      const tokens = tokenize('x > 0 && y < 1');
      const ast = parse(tokens);
      expect(ast.kind).toBe('binary');
      expect((ast as any).op).toBe('&&');
      expect((ast as any).left.kind).toBe('binary');
      expect((ast as any).left.op).toBe('>');
      expect((ast as any).right.kind).toBe('binary');
      expect((ast as any).right.op).toBe('<');
    });
  });

  describe('Error Handling', () => {
    it('throws error for missing operand', () => {
      const tokens = tokenize('phase +');
      expect(() => parse(tokens)).toThrow(/Expected expression/);
    });

    it('throws error for unclosed parenthesis', () => {
      const tokens = tokenize('sin(phase');
      expect(() => parse(tokens)).toThrow(/Expected '\)'/);
    });

    it('throws error for unexpected token', () => {
      const tokens = tokenize('42 42');
      expect(() => parse(tokens)).toThrow(/Unexpected token/);
    });
  });
});
