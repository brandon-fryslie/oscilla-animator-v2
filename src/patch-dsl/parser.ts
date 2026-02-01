/**
 * Patch DSL Parser
 *
 * Hand-written recursive descent parser.
 * Converts token stream to HCL AST.
 * Includes error recovery (skip to recovery points on error).
 *
 * Grammar:
 * document     := block*
 * block        := IDENT label* LBRACE body RBRACE
 * label        := STRING
 * body         := (attribute | block)*
 * attribute    := (IDENT | STRING) EQUALS value
 * value        := NUMBER | STRING | BOOL | NULL | reference | object | list
 * reference    := IDENT (DOT IDENT)*
 * object       := LBRACE ((IDENT | STRING) EQUALS value (COMMA? (IDENT | STRING) EQUALS value)*)? RBRACE
 * list         := LBRACKET (value (COMMA value)*)? RBRACKET
 */

import type { HclDocument, HclBlock, HclValue, Position } from './ast';
import { PatchDslError } from './errors';
import { TokenKind, type Token } from './lexer';

/**
 * Parse result containing document and errors.
 * Errors are collected, not thrown, to support partial parsing.
 */
export interface ParseResult {
  readonly document: HclDocument;
  readonly errors: PatchDslError[];
}

/**
 * Parser state (mutable, but encapsulated).
 */
class Parser {
  private tokens: Token[];
  private current: number;
  private errors: PatchDslError[];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.current = 0;
    this.errors = [];
  }

  /**
   * Parse document (entry point).
   * Grammar: document := block*
   */
  parseDocument(): HclDocument {
    const blocks: HclBlock[] = [];

    // Skip leading newlines
    this.skipNewlines();

    // Parse blocks until EOF
    while (!this.isAtEnd()) {
      const block = this.parseBlock();
      if (block) {
        blocks.push(block);
      }
      this.skipNewlines();
    }

    return { blocks };
  }

  /**
   * Get collected errors.
   */
  getErrors(): PatchDslError[] {
    return this.errors;
  }

  /**
   * Parse block.
   * Grammar: block := IDENT label* LBRACE body RBRACE
   */
  private parseBlock(): HclBlock | null {
    const start = this.peek().pos.start;

    // Block type (identifier)
    if (!this.check(TokenKind.IDENT)) {
      this.addError('Expected block type (identifier)', this.peek().pos);
      this.recoverToBlockEnd();
      return null;
    }
    const typeToken = this.advance();
    const type = typeToken.value;

    // Block labels (zero or more strings)
    const labels: string[] = [];
    while (this.match(TokenKind.STRING)) {
      labels.push(this.previous().value);
    }

    // Opening brace
    if (!this.match(TokenKind.LBRACE)) {
      this.addError("Expected '{' after block header", this.peek().pos);
      this.recoverToBlockEnd();
      return null;
    }

    // Body (attributes and nested blocks)
    const { attributes, children } = this.parseBody();

    // Closing brace
    if (!this.match(TokenKind.RBRACE)) {
      this.addError("Expected '}' to close block", this.peek().pos);
      this.recoverToBlockEnd();
      // Construct partial block anyway
    }

    const end = this.previous().pos.end;

    return {
      type,
      labels,
      attributes,
      children,
      pos: { start, end },
    };
  }

  /**
   * Parse block body (attributes and nested blocks).
   * Grammar: body := (attribute | block)*
   */
  private parseBody(): { attributes: Record<string, HclValue>; children: HclBlock[] } {
    const attributes: Record<string, HclValue> = {};
    const children: HclBlock[] = [];

    this.skipNewlines();

    while (!this.check(TokenKind.RBRACE) && !this.isAtEnd()) {
      // Check if it's a nested block (IDENT followed by STRING or LBRACE)
      if (this.check(TokenKind.IDENT)) {
        const lookahead = this.peekAhead(1);
        if (lookahead.kind === TokenKind.STRING || lookahead.kind === TokenKind.LBRACE) {
          // It's a nested block
          const block = this.parseBlock();
          if (block) {
            children.push(block);
          }
          this.skipNewlines();
          continue;
        }
      }

      // Otherwise, it's an attribute
      const attr = this.parseAttribute();
      if (attr) {
        attributes[attr.key] = attr.value;
      }
      this.skipNewlines();
    }

    return { attributes, children };
  }

  /**
   * Parse attribute.
   * Grammar: attribute := (IDENT | STRING) EQUALS value
   * Attributes can have quoted keys to support special characters in param names.
   */
  private parseAttribute(): { key: string; value: HclValue } | null {
    // Accept both IDENT and STRING as attribute key
    if (!this.check(TokenKind.IDENT) && !this.check(TokenKind.STRING)) {
      this.addError('Expected attribute name (identifier or quoted string)', this.peek().pos);
      this.recoverToNewline();
      return null;
    }
    const key = this.advance().value;

    if (!this.match(TokenKind.EQUALS)) {
      this.addError("Expected '=' after attribute name", this.peek().pos);
      this.recoverToNewline();
      return null;
    }

    const value = this.parseValue();
    if (!value) {
      this.addError('Expected value after =', this.peek().pos);
      this.recoverToNewline();
      return null;
    }

    return { key, value };
  }

  /**
   * Parse value.
   * Grammar: value := NUMBER | STRING | BOOL | NULL | reference | object | list
   */
  private parseValue(): HclValue | null {
    // Number literal
    if (this.match(TokenKind.NUMBER)) {
      const token = this.previous();
      return { kind: 'number', value: parseFloat(token.value) };
    }

    // String literal
    if (this.match(TokenKind.STRING)) {
      const token = this.previous();
      return { kind: 'string', value: token.value };
    }

    // Boolean literal
    if (this.match(TokenKind.BOOL)) {
      const token = this.previous();
      return { kind: 'bool', value: token.value === 'true' };
    }

    // Null literal
    if (this.match(TokenKind.NULL)) {
      return { kind: 'null' };
    }

    // Object
    if (this.check(TokenKind.LBRACE)) {
      return this.parseObject();
    }

    // List
    if (this.check(TokenKind.LBRACKET)) {
      return this.parseList();
    }

    // Reference (IDENT followed by optional DOT IDENT...)
    if (this.check(TokenKind.IDENT)) {
      return this.parseReference();
    }

    // Unexpected token
    this.addError(`Expected value, got '${this.peek().value}'`, this.peek().pos);
    return null;
  }

  /**
   * Parse reference (traversal).
   * Grammar: reference := IDENT (DOT IDENT)*
   */
  private parseReference(): HclValue | null {
    const parts: string[] = [];

    if (!this.check(TokenKind.IDENT)) {
      return null;
    }
    parts.push(this.advance().value);

    while (this.match(TokenKind.DOT)) {
      if (!this.check(TokenKind.IDENT)) {
        this.addError("Expected identifier after '.'", this.peek().pos);
        return null;
      }
      parts.push(this.advance().value);
    }

    return { kind: 'reference', parts };
  }

  /**
   * Parse object.
   * Grammar: object := LBRACE ((IDENT | STRING) EQUALS value (COMMA? (IDENT | STRING) EQUALS value)*)? RBRACE
   * Object keys can be quoted strings to support special characters.
   */
  private parseObject(): HclValue | null {
    if (!this.match(TokenKind.LBRACE)) {
      return null;
    }

    const entries: Record<string, HclValue> = {};

    this.skipNewlines();

    // Handle empty object
    if (this.match(TokenKind.RBRACE)) {
      return { kind: 'object', entries };
    }

    // Parse first entry
    if (this.check(TokenKind.IDENT) || this.check(TokenKind.STRING)) {
      const key = this.advance().value;
      if (!this.match(TokenKind.EQUALS)) {
        this.addError("Expected '=' after object key", this.peek().pos);
        this.recoverToBlockEnd();
        return null;
      }
      const value = this.parseValue();
      if (!value) {
        this.addError('Expected value after =', this.peek().pos);
        this.recoverToBlockEnd();
        return null;
      }
      entries[key] = value;

      // Parse remaining entries
      while (this.match(TokenKind.COMMA) || this.check(TokenKind.NEWLINE)) {
        this.skipNewlines();
        this.match(TokenKind.COMMA); // Consume optional comma after newline
        this.skipNewlines();

        if (this.check(TokenKind.RBRACE)) {
          break; // Trailing comma/newline before closing brace
        }

        if (!this.check(TokenKind.IDENT) && !this.check(TokenKind.STRING)) {
          break; // End of object entries
        }

        const entryKey = this.advance().value;
        if (!this.match(TokenKind.EQUALS)) {
          this.addError("Expected '=' after object key", this.peek().pos);
          this.recoverToBlockEnd();
          return null;
        }
        const entryValue = this.parseValue();
        if (!entryValue) {
          this.addError('Expected value after =', this.peek().pos);
          this.recoverToBlockEnd();
          return null;
        }
        entries[entryKey] = entryValue;
      }
    }

    this.skipNewlines();

    if (!this.match(TokenKind.RBRACE)) {
      this.addError("Expected '}' to close object", this.peek().pos);
      this.recoverToBlockEnd();
      return null;
    }

    return { kind: 'object', entries };
  }

  /**
   * Parse list.
   * Grammar: list := LBRACKET (value (COMMA value)*)? RBRACKET
   */
  private parseList(): HclValue | null {
    if (!this.match(TokenKind.LBRACKET)) {
      return null;
    }

    const items: HclValue[] = [];

    this.skipNewlines();

    // Handle empty list
    if (this.match(TokenKind.RBRACKET)) {
      return { kind: 'list', items };
    }

    // Parse first item
    const firstItem = this.parseValue();
    if (!firstItem) {
      this.addError('Expected value in list', this.peek().pos);
      this.recoverToBlockEnd();
      return null;
    }
    items.push(firstItem);

    // Parse remaining items
    while (this.match(TokenKind.COMMA)) {
      this.skipNewlines();

      if (this.check(TokenKind.RBRACKET)) {
        break; // Trailing comma before closing bracket
      }

      const item = this.parseValue();
      if (!item) {
        this.addError('Expected value after comma in list', this.peek().pos);
        this.recoverToBlockEnd();
        return null;
      }
      items.push(item);
    }

    this.skipNewlines();

    if (!this.match(TokenKind.RBRACKET)) {
      this.addError("Expected ']' to close list", this.peek().pos);
      this.recoverToBlockEnd();
      return null;
    }

    return { kind: 'list', items };
  }

  // Error recovery
  private recoverToBlockEnd(): void {
    // Skip tokens until we find balanced RBRACE or EOF
    // Track both brace depth and bracket depth to avoid escaping list/object containers
    let braceDepth = 1; // We're already inside a block
    let bracketDepth = 0;

    while (!this.isAtEnd() && (braceDepth > 0 || bracketDepth > 0)) {
      if (this.check(TokenKind.LBRACE)) {
        braceDepth++;
      } else if (this.check(TokenKind.RBRACE)) {
        braceDepth--;
        if (braceDepth === 0 && bracketDepth === 0) {
          this.advance(); // Consume the closing brace
          break;
        }
      } else if (this.check(TokenKind.LBRACKET)) {
        bracketDepth++;
      } else if (this.check(TokenKind.RBRACKET)) {
        bracketDepth--;
        // Don't consume past container boundaries
        if (bracketDepth < 0) {
          break;
        }
      }
      this.advance();
    }
  }

  private recoverToNewline(): void {
    // Skip tokens until we find NEWLINE, RBRACE, or EOF
    while (!this.isAtEnd() && !this.check(TokenKind.NEWLINE) && !this.check(TokenKind.RBRACE)) {
      this.advance();
    }
    if (this.check(TokenKind.NEWLINE)) {
      this.advance(); // Consume newline
    }
  }

  // Token helpers
  private match(kind: TokenKind): boolean {
    if (this.check(kind)) {
      this.advance();
      return true;
    }
    return false;
  }

  private check(kind: TokenKind): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().kind === kind;
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  private isAtEnd(): boolean {
    return this.peek().kind === TokenKind.EOF;
  }

  private peek(): Token {
    return this.tokens[this.current];
  }

  private peekAhead(offset: number): Token {
    const index = this.current + offset;
    if (index >= this.tokens.length) {
      return this.tokens[this.tokens.length - 1]; // Return EOF
    }
    return this.tokens[index];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }

  private skipNewlines(): void {
    while (this.match(TokenKind.NEWLINE)) {
      // Keep consuming newlines
    }
  }

  private addError(message: string, pos: Position): void {
    this.errors.push(new PatchDslError(message, pos));
  }
}

/**
 * Public API: Parse HCL tokens to AST.
 * @param tokens Token stream from lexer
 * @returns Parse result with document and errors
 */
export function parse(tokens: Token[]): ParseResult {
  const parser = new Parser(tokens);
  const document = parser.parseDocument();
  const errors = parser.getErrors();
  return { document, errors };
}
