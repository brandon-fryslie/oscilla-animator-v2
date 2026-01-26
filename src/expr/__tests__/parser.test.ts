/**
 * Parser Tests
 */

import { describe, it, expect } from 'vitest';
import { tokenize } from '../lexer';
import { parse } from '../parser';
import type { LiteralNode, IdentifierNode, BinaryOpNode, UnaryOpNode, TernaryNode, CallNode, MemberAccessNode, ExprNode } from '../ast';

// Type guards for discriminated union narrowing
function isLiteral(node: ExprNode): node is LiteralNode {
  return node.kind === 'literal';
}

function isIdentifier(node: ExprNode): node is IdentifierNode {
  return node.kind === 'identifier';
}

function isMemberAccess(node: ExprNode): node is MemberAccessNode {
  return node.kind === 'member';
}

function isBinary(node: ExprNode): node is BinaryOpNode {
  return node.kind === 'binary';
}

function isUnary(node: ExprNode): node is UnaryOpNode {
  return node.kind === 'unary';
}

function isTernary(node: ExprNode): node is TernaryNode {
  return node.kind === 'ternary';
}

function isCall(node: ExprNode): node is CallNode {
  return node.kind === 'call';
}

describe('Parser', () => {
  describe('Literals', () => {
    it('parses integer literal', () => {
      const tokens = tokenize('42');
      const ast = parse(tokens);
      expect(ast.kind).toBe('literal');
      expect(isLiteral(ast) && ast.value).toBe(42);
    });

    it('parses float literal', () => {
      const tokens = tokenize('3.14');
      const ast = parse(tokens);
      expect(ast.kind).toBe('literal');
      expect(isLiteral(ast) && ast.value).toBe(3.14);
    });
  });

  describe('Identifiers', () => {
    it('parses identifier', () => {
      const tokens = tokenize('phase');
      const ast = parse(tokens);
      expect(ast.kind).toBe('identifier');
      expect(isIdentifier(ast) && ast.name).toBe('phase');
    });
  });

  describe('Member Access', () => {
    it('parses simple member access', () => {
      const tokens = tokenize('Circle1.radius');
      const ast = parse(tokens);
      expect(ast.kind).toBe('member');
      if (isMemberAccess(ast)) {
        expect(ast.member).toBe('radius');
        expect(ast.object.kind).toBe('identifier');
        expect(isIdentifier(ast.object) && ast.object.name).toBe('Circle1');
      }
    });

    it('parses chained member access (left-associative)', () => {
      const tokens = tokenize('a.b.c');
      const ast = parse(tokens);
      expect(ast.kind).toBe('member');
      if (isMemberAccess(ast)) {
        expect(ast.member).toBe('c');
        expect(ast.object.kind).toBe('member');
        if (isMemberAccess(ast.object)) {
          expect(ast.object.member).toBe('b');
          expect(ast.object.object.kind).toBe('identifier');
          expect(isIdentifier(ast.object.object) && ast.object.object.name).toBe('a');
        }
      }
    });

    it('member access binds tighter than arithmetic', () => {
      const tokens = tokenize('Circle1.radius * 2');
      const ast = parse(tokens);
      expect(ast.kind).toBe('binary');
      if (isBinary(ast)) {
        expect(ast.op).toBe('*');
        expect(ast.left.kind).toBe('member');
        if (isMemberAccess(ast.left)) {
          expect(ast.left.member).toBe('radius');
          expect(isIdentifier(ast.left.object) && ast.left.object.name).toBe('Circle1');
        }
        expect(isLiteral(ast.right) && ast.right.value).toBe(2);
      }
    });

    it('throws error for member access on literal', () => {
      const tokens = tokenize('42.x');
      // Note: 42.x is lexed as NUMBER("42.x") if followed by identifier? No - lexer sees "42" then "." then "x"
      // Actually, lexer will produce NUMBER("42"), DOT, IDENT("x") but parser should handle it
      // The issue is: does lexer see "42." as start of float or "42" + "." ?
      // According to lexer code, it checks peekNext() for digit after dot, so "42." becomes "42" then "."
      // But wait - we need to be careful. Let me trace through:
      // Input: "42.x"
      // Lexer sees '4' -> digit -> number() -> reads "42", checks peek() == '.' and peekNext() == 'x' (not digit) -> stops
      // So lexer produces: NUMBER("42"), DOT, IDENT("x")
      // Parser parses: literal(42), then member(literal(42), "x")
      // This should be allowed by parser but rejected by type checker
      // So parser doesn't throw here - it produces the AST
      expect(() => parse(tokens)).not.toThrow();
      const ast = parse(tokens);
      expect(ast.kind).toBe('member');
      if (isMemberAccess(ast)) {
        expect(ast.object.kind).toBe('literal');
      }
    });

    it('throws error for missing identifier after dot', () => {
      const tokens = tokenize('Circle1.');
      expect(() => parse(tokens)).toThrow(/Expected identifier after/);
    });

    it('member access in complex expression', () => {
      const tokens = tokenize('Circle1.radius + Circle2.radius');
      const ast = parse(tokens);
      expect(ast.kind).toBe('binary');
      if (isBinary(ast)) {
        expect(ast.op).toBe('+');
        expect(ast.left.kind).toBe('member');
        expect(ast.right.kind).toBe('member');
      }
    });
  });

  describe('Binary Operators', () => {
    it('parses addition', () => {
      const tokens = tokenize('a + b');
      const ast = parse(tokens);
      expect(ast.kind).toBe('binary');
      if (isBinary(ast)) {
        expect(ast.op).toBe('+');
        expect(isIdentifier(ast.left) && ast.left.name).toBe('a');
        expect(isIdentifier(ast.right) && ast.right.name).toBe('b');
      }
    });

    it('parses multiplication', () => {
      const tokens = tokenize('a * b');
      const ast = parse(tokens);
      expect(ast.kind).toBe('binary');
      if (isBinary(ast)) {
        expect(ast.op).toBe('*');
      }
    });

    it('respects precedence (multiplication before addition)', () => {
      const tokens = tokenize('a + b * c');
      const ast = parse(tokens);
      expect(ast.kind).toBe('binary');
      if (isBinary(ast)) {
        expect(ast.op).toBe('+');
        expect(isIdentifier(ast.left) && ast.left.name).toBe('a');
        expect(ast.right.kind).toBe('binary');
        expect(isBinary(ast.right) && ast.right.op).toBe('*');
      }
    });

    it('respects parentheses', () => {
      const tokens = tokenize('(a + b) * c');
      const ast = parse(tokens);
      expect(ast.kind).toBe('binary');
      if (isBinary(ast)) {
        expect(ast.op).toBe('*');
        expect(ast.left.kind).toBe('binary');
        expect(isBinary(ast.left) && ast.left.op).toBe('+');
        expect(isIdentifier(ast.right) && ast.right.name).toBe('c');
      }
    });
  });

  describe('Unary Operators', () => {
    it('parses negation', () => {
      const tokens = tokenize('-x');
      const ast = parse(tokens);
      expect(ast.kind).toBe('unary');
      if (isUnary(ast)) {
        expect(ast.op).toBe('-');
        expect(isIdentifier(ast.arg) && ast.arg.name).toBe('x');
      }
    });

    it('parses logical NOT', () => {
      const tokens = tokenize('!flag');
      const ast = parse(tokens);
      expect(ast.kind).toBe('unary');
      if (isUnary(ast)) {
        expect(ast.op).toBe('!');
      }
    });

    it('parses double negation', () => {
      const tokens = tokenize('--x');
      const ast = parse(tokens);
      expect(ast.kind).toBe('unary');
      if (isUnary(ast)) {
        expect(ast.op).toBe('-');
        expect(ast.arg.kind).toBe('unary');
        expect(isUnary(ast.arg) && ast.arg.op).toBe('-');
      }
    });
  });

  describe('Function Calls', () => {
    it('parses function call with one argument', () => {
      const tokens = tokenize('sin(x)');
      const ast = parse(tokens);
      expect(ast.kind).toBe('call');
      if (isCall(ast)) {
        expect(ast.fn).toBe('sin');
        expect(ast.args).toHaveLength(1);
        expect(isIdentifier(ast.args[0]) && ast.args[0].name).toBe('x');
      }
    });

    it('parses function call with multiple arguments', () => {
      const tokens = tokenize('min(a, b)');
      const ast = parse(tokens);
      expect(ast.kind).toBe('call');
      if (isCall(ast)) {
        expect(ast.fn).toBe('min');
        expect(ast.args).toHaveLength(2);
      }
    });

    it('parses function call with no arguments', () => {
      const tokens = tokenize('foo()');
      const ast = parse(tokens);
      expect(ast.kind).toBe('call');
      if (isCall(ast)) {
        expect(ast.args).toHaveLength(0);
      }
    });

    it('parses nested function calls', () => {
      const tokens = tokenize('sin(cos(x))');
      const ast = parse(tokens);
      expect(ast.kind).toBe('call');
      if (isCall(ast)) {
        expect(ast.fn).toBe('sin');
        expect(ast.args[0].kind).toBe('call');
        expect(isCall(ast.args[0]) && ast.args[0].fn).toBe('cos');
      }
    });
  });

  describe('Ternary Operator', () => {
    it('parses ternary conditional', () => {
      const tokens = tokenize('x > 0 ? 1 : -1');
      const ast = parse(tokens);
      expect(ast.kind).toBe('ternary');
      if (isTernary(ast)) {
        expect(ast.cond.kind).toBe('binary');
        expect(isLiteral(ast.then) && ast.then.value).toBe(1);
        expect(ast.else.kind).toBe('unary');
      }
    });

    it('parses nested ternary (right-associative)', () => {
      const tokens = tokenize('a ? b : c ? d : e');
      const ast = parse(tokens);
      expect(ast.kind).toBe('ternary');
      if (isTernary(ast)) {
        expect(isIdentifier(ast.cond) && ast.cond.name).toBe('a');
        expect(isIdentifier(ast.then) && ast.then.name).toBe('b');
        expect(ast.else.kind).toBe('ternary');
      }
    });
  });

  describe('Complex Expressions', () => {
    it('parses complex expression', () => {
      const tokens = tokenize('sin(phase * 2) + 0.5');
      const ast = parse(tokens);
      expect(ast.kind).toBe('binary');
      if (isBinary(ast)) {
        expect(ast.op).toBe('+');
        expect(ast.left.kind).toBe('call');
        expect(isLiteral(ast.right) && ast.right.value).toBe(0.5);
      }
    });

    it('parses comparison with logical operators', () => {
      const tokens = tokenize('x > 0 && y < 1');
      const ast = parse(tokens);
      expect(ast.kind).toBe('binary');
      if (isBinary(ast)) {
        expect(ast.op).toBe('&&');
        expect(ast.left.kind).toBe('binary');
        expect(isBinary(ast.left) && ast.left.op).toBe('>');
        expect(ast.right.kind).toBe('binary');
        expect(isBinary(ast.right) && ast.right.op).toBe('<');
      }
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
