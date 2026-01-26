/**
 * Type Checker Tests
 */

import { describe, it, expect } from 'vitest';
import { tokenize } from '../lexer';
import { parse } from '../parser';
import { typecheck } from '../typecheck';
import { FLOAT, INT, BOOL } from '../../core/canonical-types';

describe('Type Checker', () => {
  describe('Literal Type Inference', () => {
    it('infers int for integer literals', () => {
      const ast = parse(tokenize('42'));
      const env = new Map();
      const typed = typecheck(ast, env);
      expect(typed.type).toBe(INT);
    });

    it('infers float for float literals', () => {
      const ast = parse(tokenize('3.14'));
      const env = new Map();
      const typed = typecheck(ast, env);
      expect(typed.type).toBe(FLOAT);
    });
  });

  describe('Identifier Type Lookup', () => {
    it('looks up identifier type from env', () => {
      const ast = parse(tokenize('phase'));
      const env = new Map([['phase', FLOAT]]);
      const typed = typecheck(ast, env);
      expect(typed.type).toBe(FLOAT);
    });

    it('throws error for undefined identifier', () => {
      const ast = parse(tokenize('unknown'));
      const env = new Map([['phase', FLOAT]]);
      expect(() => typecheck(ast, env)).toThrow(/Undefined input 'unknown'/);
    });
  });

  describe('Arithmetic Type Rules', () => {
    it('int + int → int', () => {
      const ast = parse(tokenize('1 + 2'));
      const env = new Map();
      const typed = typecheck(ast, env);
      expect(typed.type).toBe(INT);
    });

    it('int + float → float', () => {
      const ast = parse(tokenize('x + 1'));
      const env = new Map([['x', FLOAT]]);
      const typed = typecheck(ast, env);
      expect(typed.type).toBe(FLOAT);
    });

    it('float + float → float', () => {
      const ast = parse(tokenize('phase + 0.5'));
      const env = new Map([['phase', FLOAT]]);
      const typed = typecheck(ast, env);
      expect(typed.type).toBe(FLOAT);
    });
  });

  describe('Comparison Type Rules', () => {
    it('comparison returns bool', () => {
      const ast = parse(tokenize('x > 0'));
      const env = new Map([['x', FLOAT]]);
      const typed = typecheck(ast, env);
      expect(typed.type).toBe(BOOL);
    });

    it('int and float comparison is allowed', () => {
      const ast = parse(tokenize('x > 1'));
      const env = new Map([['x', FLOAT]]);
      const typed = typecheck(ast, env);
      expect(typed.type).toBe(BOOL);
    });
  });

  describe('Logical Type Rules', () => {
    it('AND requires bool operands', () => {
      const ast = parse(tokenize('a && b'));
      const env = new Map([
        ['a', FLOAT],
        ['b', FLOAT],
      ]);
      expect(() => typecheck(ast, env)).toThrow(/Logical AND requires bool/);
    });

    it('AND with bool operands returns bool', () => {
      const ast = parse(tokenize('(x > 0) && (y < 1)'));
      const env = new Map([
        ['x', FLOAT],
        ['y', FLOAT],
      ]);
      const typed = typecheck(ast, env);
      expect(typed.type).toBe(BOOL);
    });
  });

  describe('Unary Type Rules', () => {
    it('negation preserves numeric type', () => {
      const ast = parse(tokenize('-x'));
      const env = new Map([['x', FLOAT]]);
      const typed = typecheck(ast, env);
      expect(typed.type).toBe(FLOAT);
    });

    it('NOT requires bool', () => {
      const ast = parse(tokenize('!x'));
      const env = new Map([['x', FLOAT]]);
      expect(() => typecheck(ast, env)).toThrow(/Logical NOT requires bool/);
    });

    it('NOT with bool returns bool', () => {
      const ast = parse(tokenize('!(x > 0)'));
      const env = new Map([['x', FLOAT]]);
      const typed = typecheck(ast, env);
      expect(typed.type).toBe(BOOL);
    });
  });

  describe('Ternary Type Rules', () => {
    it('condition must be bool', () => {
      const ast = parse(tokenize('x ? 1 : 2'));
      const env = new Map([['x', FLOAT]]);
      expect(() => typecheck(ast, env)).toThrow(/condition must be bool/);
    });

    it('branches must have compatible types', () => {
      const ast = parse(tokenize('(x > 0) ? 1 : 2'));
      const env = new Map([['x', FLOAT]]);
      const typed = typecheck(ast, env);
      expect(typed.type).toBe(INT);
    });

    it('int/float branches unify to float', () => {
      const ast = parse(tokenize('(x > 0) ? 1 : 2.0'));
      const env = new Map([['x', FLOAT]]);
      const typed = typecheck(ast, env);
      expect(typed.type).toBe(FLOAT);
    });
  });

  describe('Function Type Checking', () => {
    it('checks function exists', () => {
      const ast = parse(tokenize('unknown(x)'));
      const env = new Map([['x', FLOAT]]);
      expect(() => typecheck(ast, env)).toThrow(/Unknown function 'unknown'/);
    });

    it('checks function arity', () => {
      const ast = parse(tokenize('sin(x, y)'));
      const env = new Map([
        ['x', FLOAT],
        ['y', FLOAT],
      ]);
      expect(() => typecheck(ast, env)).toThrow(/expects 1 argument, got 2/);
    });

    it('checks argument types', () => {
      const ast = parse(tokenize('sin(x)'));
      const env = new Map([['x', FLOAT]]);
      const typed = typecheck(ast, env);
      expect(typed.type).toBe(FLOAT);
    });

    it('allows int → float coercion', () => {
      const ast = parse(tokenize('sin(42)'));
      const env = new Map();
      const typed = typecheck(ast, env);
      expect(typed.type).toBe(FLOAT);
    });
  });

  describe('Error Messages', () => {
    it('suggests similar identifier', () => {
      const ast = parse(tokenize('phas'));
      const env = new Map([['phase', FLOAT]]);
      try {
        typecheck(ast, env);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).toContain('phase');
      }
    });

    it('suggests similar function', () => {
      const ast = parse(tokenize('sine(x)'));
      const env = new Map([['x', FLOAT]]);
      try {
        typecheck(ast, env);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).toContain('sin');
      }
    });
  });
});
