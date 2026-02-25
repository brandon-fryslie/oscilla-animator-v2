/**
 * Patch DSL Lexer (Tokenizer)
 *
 * Converts HCL text to token stream.
 * Follows src/expr/lexer.ts pattern.
 *
 * Token types:
 * - Literals: NUMBER, STRING, BOOL, NULL, IDENT
 * - Punctuation: LBRACE, RBRACE, LBRACKET, RBRACKET, EQUALS, DOT, COMMA
 * - Multiline strings: heredoc (<<EOF ... EOF, <<-EOF ... EOF)
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
  NULL = 'NULL',
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
      this.skipLineComment();
      return null; // Comments are not emitted
    }

    // Line comment (// to end of line, skipped)
    if (ch === '/' && this.peekNext() === '/') {
      this.skipLineComment();
      return null; // Comments are not emitted
    }

    // Inline comment (/* ... */, skipped)
    if (ch === '/' && this.peekNext() === '*') {
      this.skipInlineComment(start);
      return null; // Comments are not emitted
    }

    // String literal (double-quoted)
    if (ch === '"') {
      return this.string(start);
    }

    // Heredoc literal (<<EOF ... EOF or <<-EOF ... EOF)
    if (ch === '<' && this.peekNext() === '<') {
      return this.heredoc(start);
    }

    // Number literal (integer or float)
    if (this.isDigit(ch)) {
      return this.number(start);
    }

    // Negative number literal (requires adjacency: no space between - and digit)
    // Must check before identifier because '-' at token start is never an identifier
    if (ch === '-') {
      const next = this.peekNext();
      // Check for -1, -1.5, -1e-3
      if (this.isDigit(next)) {
        return this.number(start);
      }
    }

    // Identifier or boolean/null keyword
    // Grammar: [a-zA-Z_][a-zA-Z0-9_-]*
    // Note: Identifiers can contain dashes but cannot START with dash
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
   * Escape sequences: \n, \r, \t, \\, \", \uNNNN, \UNNNNNNNN
   * Literal newlines are invalid in quoted strings.
   */
  private string(start: number): Token {
    // Consume opening quote
    this.pos++;

    let value = '';
    while (!this.isAtEnd() && this.peek() !== '"') {
      const ch = this.peek();
      if (ch === '\n' || ch === '\r') {
        throw this.error('Quoted strings cannot contain literal newlines', this.pos);
      }
      // [LAW:one-source-of-truth] Dynamic expression behavior is represented by
      // graph/expression blocks, not template interpolation side channels in HCL strings.
      if ((ch === '$' || ch === '%') && this.peekNext() === '{') {
        throw this.error('Template interpolation/directives are not supported in Patch DSL strings', this.pos);
      }
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
          case 'r':
            value += '\r';
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
          case 'u': {
            value += this.readUnicodeEscape(4, start);
            continue;
          }
          case 'U': {
            value += this.readUnicodeEscape(8, start);
            continue;
          }
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
   * Read heredoc literal.
   * Grammar:
   *   heredoc := "<<" ("-")? IDENT NEWLINE heredoc_body heredoc_end
   *   heredoc_end := IDENT on its own line
   *
   * Supports:
   * - <<EOF
   * - <<-EOF (indented terminator line allowed)
   */
  private heredoc(start: number): Token {
    // Consume << and optional -
    this.pos += 2;
    const allowIndentedTerminator = this.peek() === '-';
    if (allowIndentedTerminator) {
      this.pos++;
    }

    // Delimiter identifier: [A-Za-z_][A-Za-z0-9_]* (dashes are not allowed per HCL2 spec)
    const delimiterStart = this.pos;
    if (!(this.isAlpha(this.peek()) || this.peek() === '_')) {
      throw this.error('Expected heredoc delimiter after <<', start);
    }
    while (this.isAlpha(this.peek()) || this.isDigit(this.peek()) || this.peek() === '_') {
      this.pos++;
    }
    const delimiter = this.input.slice(delimiterStart, this.pos);

    // Delimiter line must terminate immediately
    if (this.peek() === '\r') {
      this.pos++;
    }
    if (this.peek() !== '\n') {
      throw this.error('Expected newline after heredoc delimiter', this.pos);
    }
    this.pos++; // consume newline after delimiter

    const bodyStart = this.pos;
    let lineStart = this.pos;

    while (true) {
      if (lineStart >= this.input.length) {
        throw this.error(`Unterminated heredoc '${delimiter}'`, start);
      }

      let lineEnd = this.input.indexOf('\n', lineStart);
      if (lineEnd === -1) {
        lineEnd = this.input.length;
      }
      const rawLine = this.input.slice(lineStart, lineEnd);
      const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
      // [LAW:single-enforcer] Lexer is the single boundary that recognizes
      // heredoc terminators and converts them to canonical STRING tokens.
      const isTerminator = allowIndentedTerminator
        ? (() => {
          const leadingSpaces = line.match(/^ */)?.[0] ?? '';
          const rest = line.slice(leadingSpaces.length);
          return rest === delimiter;
        })()
        : line === delimiter;

      if (isTerminator) {
        const rawBody = this.input.slice(bodyStart, lineStart);
        if (rawBody.includes('${') || rawBody.includes('%{')) {
          throw this.error('Template interpolation/directives are not supported in Patch DSL strings', bodyStart);
        }
        const body = allowIndentedTerminator
          ? this.trimHeredocIndent(rawBody)
          : rawBody;
        this.pos = lineEnd;
        return this.makeToken(TokenKind.STRING, body, start);
      }

      lineStart = lineEnd + 1;
    }
  }

  /**
   * Strip indentation according to <<- heredoc semantics.
   * Finds minimum leading spaces on non-empty lines and removes that prefix.
   */
  private trimHeredocIndent(value: string): string {
    const lines = value.split('\n');
    let minSpaces: number | null = null;

    for (const line of lines) {
      if (line.trim().length === 0) continue;
      let spaces = 0;
      while (spaces < line.length && line[spaces] === ' ') spaces++;
      if (minSpaces === null || spaces < minSpaces) {
        minSpaces = spaces;
      }
    }

    if (minSpaces === null || minSpaces === 0) {
      return value;
    }

    return lines
      .map((line) => {
        if (line.trim().length === 0) return line;
        return line.startsWith(' '.repeat(minSpaces))
          ? line.slice(minSpaces)
          : line;
      })
      .join('\n');
  }

  /**
   * Parse \uNNNN and \UNNNNNNNN escapes from the current cursor position.
   * Cursor starts at 'u' or 'U' and advances past all consumed characters.
   */
  private readUnicodeEscape(digits: 4 | 8, stringStart: number): string {
    const prefix = this.peek();
    const hexStart = this.pos + 1;
    const hexEnd = hexStart + digits;

    if (hexEnd > this.input.length) {
      throw this.error(`Invalid unicode escape: \\${prefix} requires ${digits} hex digits`, stringStart);
    }

    const hex = this.input.slice(hexStart, hexEnd);
    if (![...hex].every((char) => this.isHexDigit(char))) {
      throw this.error(`Invalid unicode escape: \\${prefix}${hex}`, this.pos - 1);
    }

    const codePoint = Number.parseInt(hex, 16);
    try {
      const value = String.fromCodePoint(codePoint);
      this.pos = hexEnd;
      return value;
    } catch {
      throw this.error(`Invalid unicode code point: ${hex}`, this.pos - 1);
    }
  }

  /**
   * Read number literal (integer/float/exponent, optionally negative).
   * Grammar: "-"? [0-9]+ ("." [0-9]+)? (("e" | "E") ("+" | "-")? [0-9]+)?
   * Note: Negative sign must be adjacent (no whitespace) for it to be part of number
   */
  private number(start: number): Token {
    // Handle optional negative sign
    if (this.peek() === '-') {
      this.pos++;
    }

    // Integer part is required
    if (!this.isDigit(this.peek())) {
      throw this.error('Expected digit in number literal', start);
    }
    while (this.isDigit(this.peek())) {
      this.pos++;
    }

    // Optional fractional part
    if (this.peek() === '.' && this.isDigit(this.peekNext())) {
      this.pos++; // consume '.'
      while (this.isDigit(this.peek())) {
        this.pos++;
      }
    }

    // Optional exponent part
    if (this.peek() === 'e' || this.peek() === 'E') {
      this.pos++; // consume e/E
      if (this.peek() === '+' || this.peek() === '-') {
        this.pos++; // consume exponent sign
      }
      if (!this.isDigit(this.peek())) {
        throw this.error('Expected digit after exponent marker', start);
      }
      while (this.isDigit(this.peek())) {
        this.pos++;
      }
    }

    const value = this.input.slice(start, this.pos);
    return this.makeToken(TokenKind.NUMBER, value, start);
  }

  /**
   * Read identifier or keyword (boolean/null).
   * Grammar: [a-zA-Z_][a-zA-Z0-9_-]*
   * Keywords: true, false, null
   * Note: Identifiers can contain dashes after the first character
   */
  private identifier(start: number): Token {
    while (this.isAlphaNumeric(this.peek())) {
      this.pos++;
    }
    const value = this.input.slice(start, this.pos);

    // Check for keywords
    if (value === 'true' || value === 'false') {
      return this.makeToken(TokenKind.BOOL, value, start);
    }
    if (value === 'null') {
      return this.makeToken(TokenKind.NULL, value, start);
    }

    return this.makeToken(TokenKind.IDENT, value, start);
  }

  /**
   * Skip line comment (# or // to end of line).
   * Comment is consumed but not emitted as token.
   */
  private skipLineComment(): void {
    if (this.peek() === '/' && this.peekNext() === '/') {
      this.pos += 2;
    } else if (this.peek() === '#') {
      this.pos++;
    }

    // Skip until newline or EOF
    while (!this.isAtEnd() && this.peek() !== '\n') {
      this.pos++;
    }
    // Don't consume the newline (it will be emitted as NEWLINE token)
  }

  /**
   * Skip inline comment (/* ... *\/).
   * Comment is consumed but not emitted as token.
   */
  private skipInlineComment(start: number): void {
    this.pos += 2; // consume /*

    while (!this.isAtEnd()) {
      if (this.peek() === '*' && this.peekNext() === '/') {
        this.pos += 2;
        return;
      }
      this.pos++;
    }

    throw this.error('Unterminated inline comment (EOF)', start);
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
    return this.isAlpha(ch) || this.isDigit(ch) || ch === '_' || ch === '-';
  }

  private isWhitespace(ch: string): boolean {
    return ch === ' ' || ch === '\r';
  }

  private isHexDigit(ch: string): boolean {
    return (
      (ch >= '0' && ch <= '9') ||
      (ch >= 'a' && ch <= 'f') ||
      (ch >= 'A' && ch <= 'F')
    );
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
