/**
 * src/pillars/expression/tokenize.ts
 *
 * Hand-rolled lexer for the expression DSL. No regex-based state machines —
 * a simple character-by-character scanner that tracks line and column for
 * error reporting.
 *
 * Token kinds:
 *   - identifier: [a-zA-Z_][a-zA-Z0-9_]*
 *   - number:     [0-9]+(.[0-9]+)?   (no exponents or hex — add if needed)
 *   - operator:   one of + - * / %
 *   - equals:     =
 *   - lparen:     (
 *   - rparen:     )
 *   - comma:      ,
 *   - dot:        .  (used for namespace-qualified field refs, e.g. `clock.time`)
 *   - newline:    \n (significant — separates assignments)
 *   - eof:        end of input
 *
 * Whitespace (spaces, tabs, carriage returns) is skipped. Line comments
 * start with `#` or `//` and run to the next newline; the newline itself
 * is preserved as a token.
 *
 * NOTE on number vs dot disambiguation: a leading digit always starts a
 * number literal, so `.5` is NOT parsed as a number (the current grammar
 * requires a leading digit, e.g. `0.5`). A dot after a digit is consumed
 * as part of the number literal. This keeps the dot/number distinction
 * unambiguous for the lexer.
 */

export type TokenKind =
  | 'identifier'
  | 'number'
  | 'operator'
  | 'equals'
  | 'lparen'
  | 'rparen'
  | 'comma'
  | 'dot'
  | 'newline'
  | 'eof';

export interface Token {
  readonly kind: TokenKind;
  readonly text: string;
  readonly line: number;
  readonly column: number;
}

export interface TokenizeError {
  readonly message: string;
  readonly line: number;
  readonly column: number;
}

export interface TokenizeResult {
  readonly tokens: readonly Token[];
  readonly errors: readonly TokenizeError[];
}

export function tokenize(input: string): TokenizeResult {
  const tokens: Token[] = [];
  const errors: TokenizeError[] = [];
  let i = 0;
  let line = 1;
  let col = 1;

  const push = (kind: TokenKind, text: string, startLine: number, startCol: number): void => {
    tokens.push({ kind, text, line: startLine, column: startCol });
  };

  while (i < input.length) {
    const ch = input[i];

    // Whitespace (but not newlines)
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      i++;
      col++;
      continue;
    }

    // Newline
    if (ch === '\n') {
      push('newline', '\n', line, col);
      i++;
      line++;
      col = 1;
      continue;
    }

    // Line comments: '#' or '//'
    if (ch === '#' || (ch === '/' && input[i + 1] === '/')) {
      while (i < input.length && input[i] !== '\n') {
        i++;
        col++;
      }
      continue;
    }

    // Identifiers
    if (isIdentStart(ch)) {
      const startCol = col;
      let text = '';
      while (i < input.length && isIdentPart(input[i])) {
        text += input[i];
        i++;
        col++;
      }
      push('identifier', text, line, startCol);
      continue;
    }

    // Numbers
    if (isDigit(ch)) {
      const startCol = col;
      let text = '';
      let sawDot = false;
      while (i < input.length) {
        const next = input[i];
        if (isDigit(next)) {
          text += next;
          i++;
          col++;
        } else if (next === '.' && !sawDot) {
          sawDot = true;
          text += next;
          i++;
          col++;
        } else {
          break;
        }
      }
      push('number', text, line, startCol);
      continue;
    }

    // Single-character tokens
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '%') {
      push('operator', ch, line, col);
      i++;
      col++;
      continue;
    }
    if (ch === '=') {
      push('equals', '=', line, col);
      i++;
      col++;
      continue;
    }
    if (ch === '(') {
      push('lparen', '(', line, col);
      i++;
      col++;
      continue;
    }
    if (ch === ')') {
      push('rparen', ')', line, col);
      i++;
      col++;
      continue;
    }
    if (ch === ',') {
      push('comma', ',', line, col);
      i++;
      col++;
      continue;
    }
    if (ch === '.') {
      push('dot', '.', line, col);
      i++;
      col++;
      continue;
    }

    // Anything else is an error — skip the character but record the issue.
    errors.push({
      message: `unexpected character '${ch}'`,
      line,
      column: col,
    });
    i++;
    col++;
  }

  tokens.push({ kind: 'eof', text: '', line, column: col });
  return { tokens, errors };
}

function isIdentStart(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
}

function isIdentPart(ch: string): boolean {
  return isIdentStart(ch) || isDigit(ch);
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}
