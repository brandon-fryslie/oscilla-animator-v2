/**
 * Lexer Tests
 */

import { describe, it, expect } from 'vitest';
import { tokenize, TokenKind } from '../lexer';

describe('Lexer', () => {
  describe('Numbers', () => {
    it('tokenizes integer literals', () => {
      const tokens = tokenize('42');
      expect(tokens).toHaveLength(2); // NUMBER + EOF
      expect(tokens[0].kind).toBe(TokenKind.NUMBER);
      expect(tokens[0].value).toBe('42');
    });

    it('tokenizes float literals', () => {
      const tokens = tokenize('3.14');
      expect(tokens).toHaveLength(2); // NUMBER + EOF
      expect(tokens[0].kind).toBe(TokenKind.NUMBER);
      expect(tokens[0].value).toBe('3.14');
    });

    it('tokenizes zero', () => {
      const tokens = tokenize('0');
      expect(tokens[0].kind).toBe(TokenKind.NUMBER);
      expect(tokens[0].value).toBe('0');
    });
  });

  describe('Identifiers', () => {
    it('tokenizes simple identifiers', () => {
      const tokens = tokenize('phase');
      expect(tokens[0].kind).toBe(TokenKind.IDENT);
      expect(tokens[0].value).toBe('phase');
    });

    it('tokenizes identifiers with underscores', () => {
      const tokens = tokenize('my_value');
      expect(tokens[0].kind).toBe(TokenKind.IDENT);
      expect(tokens[0].value).toBe('my_value');
    });

    it('tokenizes identifiers starting with underscore', () => {
      const tokens = tokenize('_internal');
      expect(tokens[0].kind).toBe(TokenKind.IDENT);
      expect(tokens[0].value).toBe('_internal');
    });
  });

  describe('Operators', () => {
    it('tokenizes arithmetic operators', () => {
      const tokens = tokenize('+ - * / %');
      expect(tokens[0].kind).toBe(TokenKind.PLUS);
      expect(tokens[1].kind).toBe(TokenKind.MINUS);
      expect(tokens[2].kind).toBe(TokenKind.STAR);
      expect(tokens[3].kind).toBe(TokenKind.SLASH);
      expect(tokens[4].kind).toBe(TokenKind.PERCENT);
    });

    it('tokenizes comparison operators', () => {
      const tokens = tokenize('< > <= >= == !=');
      expect(tokens[0].kind).toBe(TokenKind.LT);
      expect(tokens[1].kind).toBe(TokenKind.GT);
      expect(tokens[2].kind).toBe(TokenKind.LTE);
      expect(tokens[3].kind).toBe(TokenKind.GTE);
      expect(tokens[4].kind).toBe(TokenKind.EQ);
      expect(tokens[5].kind).toBe(TokenKind.NEQ);
    });

    it('tokenizes logical operators', () => {
      const tokens = tokenize('&& || !');
      expect(tokens[0].kind).toBe(TokenKind.AND);
      expect(tokens[1].kind).toBe(TokenKind.OR);
      expect(tokens[2].kind).toBe(TokenKind.NOT);
    });

    it('tokenizes ternary operators', () => {
      const tokens = tokenize('? :');
      expect(tokens[0].kind).toBe(TokenKind.QUESTION);
      expect(tokens[1].kind).toBe(TokenKind.COLON);
    });
  });

  describe('Punctuation', () => {
    it('tokenizes parentheses', () => {
      const tokens = tokenize('( )');
      expect(tokens[0].kind).toBe(TokenKind.LPAREN);
      expect(tokens[1].kind).toBe(TokenKind.RPAREN);
    });

    it('tokenizes comma', () => {
      const tokens = tokenize(',');
      expect(tokens[0].kind).toBe(TokenKind.COMMA);
    });
  });

  describe('Whitespace', () => {
    it('ignores whitespace', () => {
      const tokens = tokenize('  1  +  2  ');
      expect(tokens).toHaveLength(4); // NUMBER + PLUS + NUMBER + EOF
    });

    it('ignores newlines and tabs', () => {
      const tokens = tokenize('1\n+\t2');
      expect(tokens).toHaveLength(4); // NUMBER + PLUS + NUMBER + EOF
    });
  });

  describe('Complex Expressions', () => {
    it('tokenizes function call', () => {
      const tokens = tokenize('sin(phase)');
      expect(tokens[0].kind).toBe(TokenKind.IDENT);
      expect(tokens[0].value).toBe('sin');
      expect(tokens[1].kind).toBe(TokenKind.LPAREN);
      expect(tokens[2].kind).toBe(TokenKind.IDENT);
      expect(tokens[2].value).toBe('phase');
      expect(tokens[3].kind).toBe(TokenKind.RPAREN);
    });

    it('tokenizes arithmetic expression', () => {
      const tokens = tokenize('a + b * c');
      expect(tokens).toHaveLength(6); // IDENT + PLUS + IDENT + STAR + IDENT + EOF
    });
  });

  describe('Position Tracking', () => {
    it('tracks token positions', () => {
      const tokens = tokenize('42 + 3');
      expect(tokens[0].pos).toEqual({ start: 0, end: 2 });
      expect(tokens[1].pos).toEqual({ start: 3, end: 4 });
      expect(tokens[2].pos).toEqual({ start: 5, end: 6 });
    });
  });

  describe('Error Handling', () => {
    it('throws error for invalid character', () => {
      expect(() => tokenize('@')).toThrow(/Unexpected character '@'/);
    });

    it('throws error for invalid character in expression', () => {
      expect(() => tokenize('phase $ 2')).toThrow(/Unexpected character '\$'/);
    });
  });
});
