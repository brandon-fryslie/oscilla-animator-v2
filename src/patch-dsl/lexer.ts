/**
 * Patch DSL Lexer (Tokenizer)
 *
 * Converts HCL text to token stream.
 * Follows src/expr/lexer.ts pattern.
 *
 * Token types:
 * - Literals: NUMBER, STRING, BOOL, IDENT
 * - Punctuation: LBRACE, RBRACE, LBRACKET, RBRACKET, EQUALS, DOT, COMMA
 * - Structural: COMMENT, NEWLINE
 * - Special: EOF
 */

import type { Position } from './ast';

/**
 * Token type enumeration.
 */
export enum TokenKind {
  // Literals
  NUMBER = 'NUMBER',
  STRING = 'STRING',
  BOOL = 'BOOL',
  IDENT = 'IDENT',

  // Punctuation
  LBRACE = 'LBRACE',      // {
  RBRACE = 'RBRACE',      // }
  LBRACKET = 'LBRACKET',  // [
  RBRACKET = 'RBRACKET',  // ]
  EQUALS = 'EQUALS',      // =
  DOT = 'DOT',            // .
  COMMA = 'COMMA',        // ,

  // Structural
  COMMENT = 'COMMENT',    // # ... (skipped, not emitted)
  NEWLINE = 'NEWLINE',    // \n

  // Special
  EOF = 'EOF',
}

/**
 * Token with position information.
 */
export interface Token {
  readonly kind: TokenKind;
  readonly value: string;  // Raw text (for literals/idents) or original token
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
   * Returns array of tokens (comments are skipped, not emitted).
   */
  tokenize(): Token[] {
    const tokens: Token[] = [];
    while (true) {
      const token = this.nextToken();
      if (token) {
        tokens.push(token);
        if (token.kind === TokenKind.EOF) {
          break;
        }
      }
      // If null returned, it was a comment (skipped)
    }
    return tokens;
  }

  /**
   * Read next token, skipping whitespace (but not newlines).
   * Returns null for comments (which are skipped).
   */
  private nextToken(): Token | null {
    this.skipWhitespace();

    const start = this.pos;

    // EOF
    if (this.isAtEnd()) {
      return this.makeToken(TokenKind.EOF, '', start);
    }

    const ch = this.peek();

    // Newline (significant for attribute separation)
    if (ch === '\n') {
      this.pos++;
      return this.makeToken(TokenKind.NEWLINE, '\n', start);
    }

    // Comment (# to end of line, skipped)
    if (ch === '#') {
      this.skipComment();
      return null; // Comments are not emitted
    }

    // String literal (double-quoted)
    if (ch === '"') {
      return this.string(start);
    }

    // Number literal (integer or float)
    if (this.isDigit(ch)) {
      return this.number(start);
    }

    // Identifier or boolean keyword
    if (this.isAlpha(ch) || ch === '_') {
      return this.identifier(start);
    }

    // Single-character tokens
    this.pos++;
    switch (ch) {
      case '{':
        return this.makeToken(TokenKind.LBRACE, ch, start);
      case '}':
        return this.makeToken(TokenKind.RBRACE, ch, start);
      case '[':
        return this.makeToken(TokenKind.LBRACKET, ch, start);
      case ']':
        return this.makeToken(TokenKind.RBRACKET, ch, start);
      case '=':
        return this.makeToken(TokenKind.EQUALS, ch, start);
      case '.':
        return this.makeToken(TokenKind.DOT, ch, start);
      case ',':
        return this.makeToken(TokenKind.COMMA, ch, start);
      default:
        throw this.error(`Unexpected character '${ch}'`, start);
    }
  }

  /**
   * Read string literal (double-quoted with escape sequences).
   * Grammar: '"' (char | escape)* '"'
   * Escape sequences: \n, \t, \\, \"
   */
  private string(start: number): Token {
    // Consume opening quote
    this.pos++;

    let value = '';
    while (!this.isAtEnd() && this.peek() !== '"') {
      const ch = this.peek();
      if (ch === '\\') {
        // Escape sequence
        this.pos++;
        if (this.isAtEnd()) {
          throw this.error('Unterminated string (EOF after backslash)', start);
        }
        const escaped = this.peek();
        switch (escaped) {
          case 'n':
            value += '\n';
            break;
          case 't':
            value += '\t';
            break;
          case '\\':
            value += '\\';
            break;
          case '"':
            value += '"';
            break;
          default:
            throw this.error(`Invalid escape sequence: \\${escaped}`, this.pos - 1);
        }
        this.pos++;
      } else {
        value += ch;
        this.pos++;
      }
    }

    if (this.isAtEnd()) {
      throw this.error('Unterminated string (EOF)', start);
    }

    // Consume closing quote
    this.pos++;

    return this.makeToken(TokenKind.STRING, value, start);
  }

  /**
   * Read number literal (integer or float).
   * Grammar: [0-9]+ ("." [0-9]+)?
   * Note: Scientific notation is optional (not implemented for simplicity)
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
   * Read identifier or boolean keyword.
   * Grammar: [a-zA-Z_][a-zA-Z0-9_]*
   * Keywords: true, false
   */
  private identifier(start: number): Token {
    while (this.isAlphaNumeric(this.peek())) {
      this.pos++;
    }
    const value = this.input.slice(start, this.pos);

    // Check for boolean keywords
    if (value === 'true' || value === 'false') {
      return this.makeToken(TokenKind.BOOL, value, start);
    }

    return this.makeToken(TokenKind.IDENT, value, start);
  }

  /**
   * Skip comment (# to end of line).
   * Comment is consumed but not emitted as token.
   */
  private skipComment(): void {
    // Skip until newline or EOF
    while (!this.isAtEnd() && this.peek() !== '\n') {
      this.pos++;
    }
    // Don't consume the newline (it will be emitted as NEWLINE token)
  }

  /**
   * Skip whitespace characters (space, tab, CR).
   * Does NOT skip newlines (they are significant).
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
    return ch === ' ' || ch === '\t' || ch === '\r';
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
 * Public API: Tokenize HCL string.
 * @param input HCL text
 * @returns Array of tokens (including EOF token, excluding comments)
 * @throws Error if invalid characters or unterminated strings found
 */
export function tokenize(input: string): Token[] {
  const lexer = new Lexer(input);
  return lexer.tokenize();
}
