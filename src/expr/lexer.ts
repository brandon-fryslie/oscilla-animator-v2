/**
 * Expression DSL Lexer (Tokenizer)
 *
 * Converts expression string to token stream.
 * Lexical grammar reference: src/expr/GRAMMAR.md
 *
 * Token types:
 * - NUMBER: Integer or float literals
 * - IDENT: Identifiers (input names, function names)
 * - Operators: +, -, *, /, %, <, >, <=, >=, ==, !=, &&, ||, !, ?,:
 * - Punctuation: (, ), ,
 * - EOF: End of input
 */

import type { Position } from './ast';

/**
 * Token type enumeration.
 */
export enum TokenKind {
  // Literals
  NUMBER = 'NUMBER',
  IDENT = 'IDENT',

  // Arithmetic operators
  PLUS = 'PLUS',
  MINUS = 'MINUS',
  STAR = 'STAR',
  SLASH = 'SLASH',
  PERCENT = 'PERCENT',

  // Comparison operators
  LT = 'LT',
  GT = 'GT',
  LTE = 'LTE',
  GTE = 'GTE',
  EQ = 'EQ',
  NEQ = 'NEQ',

  // Logical operators
  AND = 'AND',
  OR = 'OR',
  NOT = 'NOT',

  // Ternary
  QUESTION = 'QUESTION',
  COLON = 'COLON',

  // Punctuation
  LPAREN = 'LPAREN',
  RPAREN = 'RPAREN',
  COMMA = 'COMMA',

  // Special
  EOF = 'EOF',
}

/**
 * Token with position information.
 */
export interface Token {
  readonly kind: TokenKind;
  readonly value: string;      // Raw text (for NUMBER, IDENT)
  readonly pos: Position;
}

/**
 * Lexer state (mutable, but encapsulated).
 */
class Lexer {
  private input: string;
  private pos: number;

  constructor(input: string) {
    this.input = input;
    this.pos = 0;
  }

  /**
   * Tokenize entire input string.
   * Returns array of tokens (excluding whitespace).
   */
  tokenize(): Token[] {
    const tokens: Token[] = [];
    while (true) {
      const token = this.nextToken();
      tokens.push(token);
      if (token.kind === TokenKind.EOF) {
        break;
      }
    }
    return tokens;
  }

  /**
   * Read next token, skipping whitespace.
   */
  private nextToken(): Token {
    this.skipWhitespace();

    const start = this.pos;

    // EOF
    if (this.isAtEnd()) {
      return this.makeToken(TokenKind.EOF, '', start);
    }

    const ch = this.peek();

    // Number literal (integer or float)
    if (this.isDigit(ch)) {
      return this.number(start);
    }

    // Identifier or keyword
    if (this.isAlpha(ch) || ch === '_') {
      return this.identifier(start);
    }

    // Two-character operators
    if (this.pos + 1 < this.input.length) {
      const twoChar = this.input.slice(this.pos, this.pos + 2);
      switch (twoChar) {
        case '<=':
          this.pos += 2;
          return this.makeToken(TokenKind.LTE, twoChar, start);
        case '>=':
          this.pos += 2;
          return this.makeToken(TokenKind.GTE, twoChar, start);
        case '==':
          this.pos += 2;
          return this.makeToken(TokenKind.EQ, twoChar, start);
        case '!=':
          this.pos += 2;
          return this.makeToken(TokenKind.NEQ, twoChar, start);
        case '&&':
          this.pos += 2;
          return this.makeToken(TokenKind.AND, twoChar, start);
        case '||':
          this.pos += 2;
          return this.makeToken(TokenKind.OR, twoChar, start);
      }
    }

    // Single-character tokens
    this.pos++;
    switch (ch) {
      case '+':
        return this.makeToken(TokenKind.PLUS, ch, start);
      case '-':
        return this.makeToken(TokenKind.MINUS, ch, start);
      case '*':
        return this.makeToken(TokenKind.STAR, ch, start);
      case '/':
        return this.makeToken(TokenKind.SLASH, ch, start);
      case '%':
        return this.makeToken(TokenKind.PERCENT, ch, start);
      case '<':
        return this.makeToken(TokenKind.LT, ch, start);
      case '>':
        return this.makeToken(TokenKind.GT, ch, start);
      case '!':
        return this.makeToken(TokenKind.NOT, ch, start);
      case '?':
        return this.makeToken(TokenKind.QUESTION, ch, start);
      case ':':
        return this.makeToken(TokenKind.COLON, ch, start);
      case '(':
        return this.makeToken(TokenKind.LPAREN, ch, start);
      case ')':
        return this.makeToken(TokenKind.RPAREN, ch, start);
      case ',':
        return this.makeToken(TokenKind.COMMA, ch, start);
      default:
        throw this.error(`Unexpected character '${ch}'`, start);
    }
  }

  /**
   * Read number literal (integer or float).
   * Grammar: INTEGER | FLOAT
   * INTEGER: [0-9]+
   * FLOAT: [0-9]+ "." [0-9]+
   */
  private number(start: number): Token {
    // Read integer part
    while (this.isDigit(this.peek())) {
      this.pos++;
    }

    // Check for decimal point
    if (this.peek() === '.' && this.isDigit(this.peekNext())) {
      // Consume '.'
      this.pos++;
      // Read fractional part
      while (this.isDigit(this.peek())) {
        this.pos++;
      }
    }

    const value = this.input.slice(start, this.pos);
    return this.makeToken(TokenKind.NUMBER, value, start);
  }

  /**
   * Read identifier.
   * Grammar: [a-zA-Z_][a-zA-Z0-9_]*
   */
  private identifier(start: number): Token {
    while (this.isAlphaNumeric(this.peek())) {
      this.pos++;
    }
    const value = this.input.slice(start, this.pos);
    return this.makeToken(TokenKind.IDENT, value, start);
  }

  /**
   * Skip whitespace characters.
   */
  private skipWhitespace(): void {
    while (this.isWhitespace(this.peek())) {
      this.pos++;
    }
  }

  // Character classification
  private isDigit(ch: string): boolean {
    return ch >= '0' && ch <= '9';
  }

  private isAlpha(ch: string): boolean {
    return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
  }

  private isAlphaNumeric(ch: string): boolean {
    return this.isAlpha(ch) || this.isDigit(ch) || ch === '_';
  }

  private isWhitespace(ch: string): boolean {
    return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
  }

  // Lookahead
  private peek(): string {
    if (this.isAtEnd()) return '\0';
    return this.input[this.pos];
  }

  private peekNext(): string {
    if (this.pos + 1 >= this.input.length) return '\0';
    return this.input[this.pos + 1];
  }

  private isAtEnd(): boolean {
    return this.pos >= this.input.length;
  }

  // Token creation
  private makeToken(kind: TokenKind, value: string, start: number): Token {
    return {
      kind,
      value,
      pos: { start, end: this.pos },
    };
  }

  // Error reporting
  private error(message: string, start: number): Error {
    return new Error(`Lexer error at position ${start}: ${message}`);
  }
}

/**
 * Public API: Tokenize expression string.
 * @param input Expression string
 * @returns Array of tokens (including EOF token)
 * @throws Error if invalid characters found
 */
export function tokenize(input: string): Token[] {
  const lexer = new Lexer(input);
  return lexer.tokenize();
}
