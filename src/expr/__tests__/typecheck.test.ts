/**
 * Type Checker Tests
 */

import { describe, it, expect } from 'vitest';
import { tokenize } from '../lexer';
import { parse } from '../parser';
import { typecheck } from '../typecheck';
import { FLOAT, INT, BOOL, VEC2, VEC3, COLOR } from '../../core/canonical-types';

describe('Type Checker', () => {
  describe('Literal Type Inference', () => {
    it('infers int for integer literals', () => {
      const ast = parse(tokenize('42'));
      const env = new Map();
      const typed = typecheck(ast, { inputs: env });
      expect(typed.type).toBe(INT);
    });

    it('infers float for float literals', () => {
      const ast = parse(tokenize('3.14'));
      const env = new Map();
      const typed = typecheck(ast, { inputs: env });
      expect(typed.type).toBe(FLOAT);
    });
  });

  describe('Identifier Type Lookup', () => {
    it('looks up identifier type from env', () => {
      const ast = parse(tokenize('phase'));
      const env = new Map([['phase', FLOAT]]);
      const typed = typecheck(ast, { inputs: env });
      expect(typed.type).toBe(FLOAT);
    });

    it('throws error for undefined identifier', () => {
      const ast = parse(tokenize('unknown'));
      const env = new Map([['phase', FLOAT]]);
      expect(() => typecheck(ast, { inputs: env })).toThrow(/Undefined input 'unknown'/);
    });
  });

  describe('Arithmetic Type Rules', () => {
    it('int + int → int', () => {
      const ast = parse(tokenize('1 + 2'));
      const env = new Map();
      const typed = typecheck(ast, { inputs: env });
      expect(typed.type).toBe(INT);
    });

    it('int + float → float', () => {
      const ast = parse(tokenize('x + 1'));
      const env = new Map([['x', FLOAT]]);
      const typed = typecheck(ast, { inputs: env });
      expect(typed.type).toBe(FLOAT);
    });

    it('float + float → float', () => {
      const ast = parse(tokenize('phase + 0.5'));
      const env = new Map([['phase', FLOAT]]);
      const typed = typecheck(ast, { inputs: env });
      expect(typed.type).toBe(FLOAT);
    });
  });

  describe('Comparison Type Rules', () => {
    it('comparison returns bool', () => {
      const ast = parse(tokenize('x > 0'));
      const env = new Map([['x', FLOAT]]);
      const typed = typecheck(ast, { inputs: env });
      expect(typed.type).toBe(BOOL);
    });

    it('int and float comparison is allowed', () => {
      const ast = parse(tokenize('x > 1'));
      const env = new Map([['x', FLOAT]]);
      const typed = typecheck(ast, { inputs: env });
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
      expect(() => typecheck(ast, { inputs: env })).toThrow(/Logical AND requires bool/);
    });

    it('AND with bool operands returns bool', () => {
      const ast = parse(tokenize('(x > 0) && (y < 1)'));
      const env = new Map([
        ['x', FLOAT],
        ['y', FLOAT],
      ]);
      const typed = typecheck(ast, { inputs: env });
      expect(typed.type).toBe(BOOL);
    });
  });

  describe('Unary Type Rules', () => {
    it('negation preserves numeric type', () => {
      const ast = parse(tokenize('-x'));
      const env = new Map([['x', FLOAT]]);
      const typed = typecheck(ast, { inputs: env });
      expect(typed.type).toBe(FLOAT);
    });

    it('NOT requires bool', () => {
      const ast = parse(tokenize('!x'));
      const env = new Map([['x', FLOAT]]);
      expect(() => typecheck(ast, { inputs: env })).toThrow(/Logical NOT requires bool/);
    });

    it('NOT with bool returns bool', () => {
      const ast = parse(tokenize('!(x > 0)'));
      const env = new Map([['x', FLOAT]]);
      const typed = typecheck(ast, { inputs: env });
      expect(typed.type).toBe(BOOL);
    });
  });

  describe('Ternary Type Rules', () => {
    it('condition must be bool', () => {
      const ast = parse(tokenize('x ? 1 : 2'));
      const env = new Map([['x', FLOAT]]);
      expect(() => typecheck(ast, { inputs: env })).toThrow(/condition must be bool/);
    });

    it('branches must have compatible types', () => {
      const ast = parse(tokenize('(x > 0) ? 1 : 2'));
      const env = new Map([['x', FLOAT]]);
      const typed = typecheck(ast, { inputs: env });
      expect(typed.type).toBe(INT);
    });

    it('int/float branches unify to float', () => {
      const ast = parse(tokenize('(x > 0) ? 1 : 2.0'));
      const env = new Map([['x', FLOAT]]);
      const typed = typecheck(ast, { inputs: env });
      expect(typed.type).toBe(FLOAT);
    });
  });

  describe('Function Type Checking', () => {
    it('checks function exists', () => {
      const ast = parse(tokenize('unknown(x)'));
      const env = new Map([['x', FLOAT]]);
      expect(() => typecheck(ast, { inputs: env })).toThrow(/Unknown function 'unknown'/);
    });

    it('checks function arity', () => {
      const ast = parse(tokenize('sin(x, y)'));
      const env = new Map([
        ['x', FLOAT],
        ['y', FLOAT],
      ]);
      expect(() => typecheck(ast, { inputs: env })).toThrow(/expects 1 argument, got 2/);
    });

    it('checks argument types', () => {
      const ast = parse(tokenize('sin(x)'));
      const env = new Map([['x', FLOAT]]);
      const typed = typecheck(ast, { inputs: env });
      expect(typed.type).toBe(FLOAT);
    });

    it('allows int → float coercion', () => {
      const ast = parse(tokenize('sin(42)'));
      const env = new Map();
      const typed = typecheck(ast, { inputs: env });
      expect(typed.type).toBe(FLOAT);
    });
  });

  describe('Component Access Type Checking', () => {
    describe('vec3 single component access', () => {
      it('vec3Input.x type-checks to FLOAT', () => {
        const ast = parse(tokenize('v.x'));
        const env = new Map([['v', VEC3]]);
        const typed = typecheck(ast, { inputs: env });
        expect(typed.type).toEqual(FLOAT);
      });

      it('vec3Input.y type-checks to FLOAT', () => {
        const ast = parse(tokenize('v.y'));
        const env = new Map([['v', VEC3]]);
        const typed = typecheck(ast, { inputs: env });
        expect(typed.type).toEqual(FLOAT);
      });

      it('vec3Input.z type-checks to FLOAT', () => {
        const ast = parse(tokenize('v.z'));
        const env = new Map([['v', VEC3]]);
        const typed = typecheck(ast, { inputs: env });
        expect(typed.type).toEqual(FLOAT);
      });
    });

    describe('vec3 cross-access', () => {
      it('vec3Input.r type-checks to FLOAT (cross-access)', () => {
        const ast = parse(tokenize('v.r'));
        const env = new Map([['v', VEC3]]);
        const typed = typecheck(ast, { inputs: env });
        expect(typed.type).toEqual(FLOAT);
      });

      it('vec3Input.g type-checks to FLOAT (cross-access)', () => {
        const ast = parse(tokenize('v.g'));
        const env = new Map([['v', VEC3]]);
        const typed = typecheck(ast, { inputs: env });
        expect(typed.type).toEqual(FLOAT);
      });

      it('vec3Input.b type-checks to FLOAT (cross-access)', () => {
        const ast = parse(tokenize('v.b'));
        const env = new Map([['v', VEC3]]);
        const typed = typecheck(ast, { inputs: env });
        expect(typed.type).toEqual(FLOAT);
      });
    });

    describe('vec3 multi-component swizzle', () => {
      it('vec3Input.xy type-checks to VEC2', () => {
        const ast = parse(tokenize('v.xy'));
        const env = new Map([['v', VEC3]]);
        const typed = typecheck(ast, { inputs: env });
        expect(typed.type).toEqual(VEC2);
      });

      it('vec3Input.xz type-checks to VEC2', () => {
        const ast = parse(tokenize('v.xz'));
        const env = new Map([['v', VEC3]]);
        const typed = typecheck(ast, { inputs: env });
        expect(typed.type).toEqual(VEC2);
      });

      it('vec3Input.xyz type-checks to VEC3', () => {
        const ast = parse(tokenize('v.xyz'));
        const env = new Map([['v', VEC3]]);
        const typed = typecheck(ast, { inputs: env });
        expect(typed.type).toEqual(VEC3);
      });

      it('vec3Input.zyx type-checks to VEC3 (reverse)', () => {
        const ast = parse(tokenize('v.zyx'));
        const env = new Map([['v', VEC3]]);
        const typed = typecheck(ast, { inputs: env });
        expect(typed.type).toEqual(VEC3);
      });
    });

    describe('color component access', () => {
      it('colorInput.r type-checks to FLOAT', () => {
        const ast = parse(tokenize('c.r'));
        const env = new Map([['c', COLOR]]);
        const typed = typecheck(ast, { inputs: env });
        expect(typed.type).toEqual(FLOAT);
      });

      it('colorInput.g type-checks to FLOAT', () => {
        const ast = parse(tokenize('c.g'));
        const env = new Map([['c', COLOR]]);
        const typed = typecheck(ast, { inputs: env });
        expect(typed.type).toEqual(FLOAT);
      });

      it('colorInput.b type-checks to FLOAT', () => {
        const ast = parse(tokenize('c.b'));
        const env = new Map([['c', COLOR]]);
        const typed = typecheck(ast, { inputs: env });
        expect(typed.type).toEqual(FLOAT);
      });

      it('colorInput.a type-checks to FLOAT', () => {
        const ast = parse(tokenize('c.a'));
        const env = new Map([['c', COLOR]]);
        const typed = typecheck(ast, { inputs: env });
        expect(typed.type).toEqual(FLOAT);
      });

      it('colorInput.rgb type-checks to VEC3', () => {
        const ast = parse(tokenize('c.rgb'));
        const env = new Map([['c', COLOR]]);
        const typed = typecheck(ast, { inputs: env });
        expect(typed.type).toEqual(VEC3);
      });

      it('colorInput.rgba type-checks to COLOR', () => {
        const ast = parse(tokenize('c.rgba'));
        const env = new Map([['c', COLOR]]);
        const typed = typecheck(ast, { inputs: env });
        expect(typed.type).toEqual(COLOR);
      });

      it('colorInput.bgra type-checks to COLOR (swizzle)', () => {
        const ast = parse(tokenize('c.bgra'));
        const env = new Map([['c', COLOR]]);
        const typed = typecheck(ast, { inputs: env });
        expect(typed.type).toEqual(COLOR);
      });
    });

    describe('vec2 component access', () => {
      it('vec2Input.x type-checks to FLOAT', () => {
        const ast = parse(tokenize('v.x'));
        const env = new Map([['v', VEC2]]);
        const typed = typecheck(ast, { inputs: env });
        expect(typed.type).toEqual(FLOAT);
      });

      it('vec2Input.xy type-checks to VEC2', () => {
        const ast = parse(tokenize('v.xy'));
        const env = new Map([['v', VEC2]]);
        const typed = typecheck(ast, { inputs: env });
        expect(typed.type).toEqual(VEC2);
      });
    });

    describe('error cases', () => {
      it('vec3Input.w throws error (no 4th component)', () => {
        const ast = parse(tokenize('v.w'));
        const env = new Map([['v', VEC3]]);
        expect(() => typecheck(ast, { inputs: env })).toThrow(/has no component 'w'/);
      });

      it('vec3Input.a throws error (no 4th component)', () => {
        const ast = parse(tokenize('v.a'));
        const env = new Map([['v', VEC3]]);
        expect(() => typecheck(ast, { inputs: env })).toThrow(/has no component 'a'/);
      });

      it('floatInput.x throws error (not a vector)', () => {
        const ast = parse(tokenize('f.x'));
        const env = new Map([['f', FLOAT]]);
        expect(() => typecheck(ast, { inputs: env })).toThrow(/not a vector type/);
      });

      it('intInput.x throws error (not a vector)', () => {
        const ast = parse(tokenize('i.x'));
        const env = new Map([['i', INT]]);
        expect(() => typecheck(ast, { inputs: env })).toThrow(/not a vector type/);
      });

      it('vec3Input.q throws error (invalid component)', () => {
        const ast = parse(tokenize('v.q'));
        const env = new Map([['v', VEC3]]);
        expect(() => typecheck(ast, { inputs: env })).toThrow(/Invalid component 'q'/);
      });

      it('vec2Input.z throws error (vec2 has no z)', () => {
        const ast = parse(tokenize('v.z'));
        const env = new Map([['v', VEC2]]);
        expect(() => typecheck(ast, { inputs: env })).toThrow(/has no component 'z'/);
      });
    });

    describe('expressions with component access', () => {
      it('v.x + v.y type-checks correctly', () => {
        const ast = parse(tokenize('v.x + v.y'));
        const env = new Map([['v', VEC3]]);
        const typed = typecheck(ast, { inputs: env });
        expect(typed.type).toEqual(FLOAT);
      });

      it('sin(v.x) type-checks correctly', () => {
        const ast = parse(tokenize('sin(v.x)'));
        const env = new Map([['v', VEC3]]);
        const typed = typecheck(ast, { inputs: env });
        expect(typed.type).toEqual(FLOAT);
      });

      it('c.r * 2.0 type-checks correctly', () => {
        const ast = parse(tokenize('c.r * 2.0'));
        const env = new Map([['c', COLOR]]);
        const typed = typecheck(ast, { inputs: env });
        expect(typed.type).toEqual(FLOAT);
      });
    });
  });

  describe('Error Messages', () => {
    it('suggests similar identifier', () => {
      const ast = parse(tokenize('phas'));
      const env = new Map([['phase', FLOAT]]);
      try {
        typecheck(ast, { inputs: env });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).toContain('phase');
      }
    });

    it('suggests similar function', () => {
      const ast = parse(tokenize('sine(x)'));
      const env = new Map([['x', FLOAT]]);
      try {
        typecheck(ast, { inputs: env });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).toContain('sin');
      }
    });
  });
});
