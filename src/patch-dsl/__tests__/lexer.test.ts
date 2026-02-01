/**
 * Lexer tests for Patch DSL.
 */

import { describe, it, expect } from 'vitest';
import { tokenize, TokenKind } from '../lexer';

describe('lexer', () => {
  it('tokenizes empty input', () => {
    const tokens = tokenize('');
    expect(tokens).toHaveLength(1);
    expect(tokens[0].kind).toBe(TokenKind.EOF);
  });

  it('tokenizes simple block', () => {
    const input = 'block "Ellipse" "dot" {}';
    const tokens = tokenize(input);
    expect(tokens[0].kind).toBe(TokenKind.IDENT);
    expect(tokens[0].value).toBe('block');
    expect(tokens[1].kind).toBe(TokenKind.STRING);
    expect(tokens[1].value).toBe('Ellipse');
    expect(tokens[2].kind).toBe(TokenKind.STRING);
    expect(tokens[2].value).toBe('dot');
    expect(tokens[3].kind).toBe(TokenKind.LBRACE);
    expect(tokens[4].kind).toBe(TokenKind.RBRACE);
    expect(tokens[5].kind).toBe(TokenKind.EOF);
  });

  it('tokenizes numbers (integers)', () => {
    const tokens = tokenize('123 456');
    expect(tokens[0].kind).toBe(TokenKind.NUMBER);
    expect(tokens[0].value).toBe('123');
    expect(tokens[1].kind).toBe(TokenKind.NUMBER);
    expect(tokens[1].value).toBe('456');
  });

  it('tokenizes numbers (floats)', () => {
    const tokens = tokenize('45.67 0.5');
    expect(tokens[0].kind).toBe(TokenKind.NUMBER);
    expect(tokens[0].value).toBe('45.67');
    expect(tokens[1].kind).toBe(TokenKind.NUMBER);
    expect(tokens[1].value).toBe('0.5');
  });

  it('tokenizes booleans', () => {
    const tokens = tokenize('true false');
    expect(tokens[0].kind).toBe(TokenKind.BOOL);
    expect(tokens[0].value).toBe('true');
    expect(tokens[1].kind).toBe(TokenKind.BOOL);
    expect(tokens[1].value).toBe('false');
  });

  it('tokenizes identifiers', () => {
    const tokens = tokenize('foo bar_baz test123');
    expect(tokens[0].kind).toBe(TokenKind.IDENT);
    expect(tokens[0].value).toBe('foo');
    expect(tokens[1].kind).toBe(TokenKind.IDENT);
    expect(tokens[1].value).toBe('bar_baz');
    expect(tokens[2].kind).toBe(TokenKind.IDENT);
    expect(tokens[2].value).toBe('test123');
  });

  it('tokenizes punctuation', () => {
    const tokens = tokenize('{}[]=.,');
    expect(tokens[0].kind).toBe(TokenKind.LBRACE);
    expect(tokens[1].kind).toBe(TokenKind.RBRACE);
    expect(tokens[2].kind).toBe(TokenKind.LBRACKET);
    expect(tokens[3].kind).toBe(TokenKind.RBRACKET);
    expect(tokens[4].kind).toBe(TokenKind.EQUALS);
    expect(tokens[5].kind).toBe(TokenKind.DOT);
    expect(tokens[6].kind).toBe(TokenKind.COMMA);
    expect(tokens[7].kind).toBe(TokenKind.EOF);
  });

  it('skips comments', () => {
    const tokens = tokenize('# comment\nblock');
    // Comment is skipped, only NEWLINE and IDENT emitted
    expect(tokens[0].kind).toBe(TokenKind.NEWLINE);
    expect(tokens[1].kind).toBe(TokenKind.IDENT);
    expect(tokens[1].value).toBe('block');
    expect(tokens[2].kind).toBe(TokenKind.EOF);
  });

  it('emits newlines', () => {
    const tokens = tokenize('a\nb\n');
    expect(tokens[0].kind).toBe(TokenKind.IDENT);
    expect(tokens[1].kind).toBe(TokenKind.NEWLINE);
    expect(tokens[2].kind).toBe(TokenKind.IDENT);
    expect(tokens[3].kind).toBe(TokenKind.NEWLINE);
    expect(tokens[4].kind).toBe(TokenKind.EOF);
  });

  it('tracks position accurately', () => {
    const tokens = tokenize('abc');
    expect(tokens[0].pos).toEqual({ start: 0, end: 3 });
  });

  it('tracks position with spaces', () => {
    const tokens = tokenize('  abc  ');
    expect(tokens[0].pos).toEqual({ start: 2, end: 5 });
  });

  it('handles string escapes', () => {
    const tokens = tokenize('"hello\\nworld"');
    expect(tokens[0].kind).toBe(TokenKind.STRING);
    expect(tokens[0].value).toBe('hello\nworld');
  });

  it('handles all string escapes', () => {
    const tokens = tokenize('"\\n\\t\\\\\\""');
    expect(tokens[0].kind).toBe(TokenKind.STRING);
    expect(tokens[0].value).toBe('\n\t\\"');
  });

  it('handles empty string', () => {
    const tokens = tokenize('""');
    expect(tokens[0].kind).toBe(TokenKind.STRING);
    expect(tokens[0].value).toBe('');
  });

  it('throws on unterminated string', () => {
    expect(() => tokenize('"hello')).toThrow('Unterminated string');
  });

  it('throws on invalid character', () => {
    expect(() => tokenize('@')).toThrow("Unexpected character '@'");
  });

  it('handles complex HCL', () => {
    const input = `
patch "Test" {
  block "Ellipse" "dot" {
    rx = 0.02
    ry = 0.02
  }
}
`;
    const tokens = tokenize(input);
    // Verify it doesn't throw
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens[tokens.length - 1].kind).toBe(TokenKind.EOF);
  });

  it('handles references', () => {
    const tokens = tokenize('osc.out');
    expect(tokens[0].kind).toBe(TokenKind.IDENT);
    expect(tokens[0].value).toBe('osc');
    expect(tokens[1].kind).toBe(TokenKind.DOT);
    expect(tokens[2].kind).toBe(TokenKind.IDENT);
    expect(tokens[2].value).toBe('out');
  });

  it('handles objects', () => {
    const tokens = tokenize('{ r = 1.0, g = 0.5 }');
    expect(tokens[0].kind).toBe(TokenKind.LBRACE);
    expect(tokens[1].kind).toBe(TokenKind.IDENT);
    expect(tokens[1].value).toBe('r');
    expect(tokens[2].kind).toBe(TokenKind.EQUALS);
    expect(tokens[3].kind).toBe(TokenKind.NUMBER);
    expect(tokens[4].kind).toBe(TokenKind.COMMA);
    expect(tokens[5].kind).toBe(TokenKind.IDENT);
    expect(tokens[5].value).toBe('g');
  });

  it('handles lists', () => {
    const tokens = tokenize('[1, 2, 3]');
    expect(tokens[0].kind).toBe(TokenKind.LBRACKET);
    expect(tokens[1].kind).toBe(TokenKind.NUMBER);
    expect(tokens[2].kind).toBe(TokenKind.COMMA);
    expect(tokens[3].kind).toBe(TokenKind.NUMBER);
    expect(tokens[4].kind).toBe(TokenKind.COMMA);
    expect(tokens[5].kind).toBe(TokenKind.NUMBER);
    expect(tokens[6].kind).toBe(TokenKind.RBRACKET);
  });

  it('handles trailing comment', () => {
    const tokens = tokenize('foo # comment');
    expect(tokens[0].kind).toBe(TokenKind.IDENT);
    expect(tokens[1].kind).toBe(TokenKind.EOF);
  });

  it('handles CR LF line endings', () => {
    const tokens = tokenize('a\r\nb');
    // \r is skipped (whitespace), \n is NEWLINE
    expect(tokens[0].kind).toBe(TokenKind.IDENT);
    expect(tokens[1].kind).toBe(TokenKind.NEWLINE);
    expect(tokens[2].kind).toBe(TokenKind.IDENT);
  });
});
