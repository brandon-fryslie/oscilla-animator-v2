/**
 * src/pillars/expression/parse.ts
 *
 * Recursive-descent parser for the expression DSL. Consumes tokens from
 * `tokenize.ts` and produces a typed AST from `ast.ts`.
 *
 * Error recovery: on a malformed statement the parser records an error,
 * skips to the next newline, and continues. This means a single syntax
 * error in one assignment doesn't hide errors in subsequent assignments.
 *
 * Operator precedence (lowest to highest):
 *   additive:       + -
 *   multiplicative: * / %
 *   unary minus:    -
 *   primary:        number, field, call, parenthesized
 */

import type {
  Assignment,
  BinaryExpr,
  CallExpr,
  Expr,
  FieldRef,
  NumberLiteral,
  Program,
  UnaryExpr,
} from './ast';
import type { Token } from './tokenize';
import { tokenize } from './tokenize';

export interface ParseError {
  readonly message: string;
  readonly line: number;
  readonly column: number;
}

export interface ParseResult {
  readonly program: Program;
  readonly errors: readonly ParseError[];
}

export function parse(input: string): ParseResult {
  const tokenizeResult = tokenize(input);
  const errors: ParseError[] = [];
  for (const err of tokenizeResult.errors) {
    errors.push({ message: err.message, line: err.line, column: err.column });
  }

  const parser = new Parser(tokenizeResult.tokens, errors);
  const program = parser.parseProgram();
  return { program, errors };
}

class Parser {
  private pos = 0;

  constructor(
    private readonly tokens: readonly Token[],
    private readonly errors: ParseError[],
  ) {}

  parseProgram(): Program {
    const assignments: Assignment[] = [];
    this.skipNewlines();
    while (this.peek().kind !== 'eof') {
      const assignment = this.parseAssignment();
      if (assignment) {
        assignments.push(assignment);
      }
      // After an assignment we require a newline or EOF. Anything else is
      // a stray token that we skip over as part of error recovery.
      const next = this.peek();
      if (next.kind === 'newline') {
        this.skipNewlines();
      } else if (next.kind !== 'eof') {
        this.error(next, `expected newline after assignment, got '${next.text || next.kind}'`);
        this.skipUntilNewlineOrEof();
        this.skipNewlines();
      }
    }
    return { kind: 'Program', assignments };
  }

  private parseAssignment(): Assignment | null {
    const nameTok = this.peek();
    if (nameTok.kind !== 'identifier') {
      this.error(nameTok, `expected field name at start of assignment, got '${nameTok.text || nameTok.kind}'`);
      this.skipUntilNewlineOrEof();
      return null;
    }
    this.pos++;

    const eqTok = this.peek();
    if (eqTok.kind !== 'equals') {
      this.error(eqTok, `expected '=' after field name '${nameTok.text}', got '${eqTok.text || eqTok.kind}'`);
      this.skipUntilNewlineOrEof();
      return null;
    }
    this.pos++;

    const value = this.parseExpression();
    if (!value) {
      this.skipUntilNewlineOrEof();
      return null;
    }

    return {
      kind: 'Assignment',
      field: nameTok.text,
      value,
      line: nameTok.line,
      column: nameTok.column,
    };
  }

  private parseExpression(): Expr | null {
    let left = this.parseTerm();
    if (!left) return null;
    while (true) {
      const t = this.peek();
      if (t.kind !== 'operator' || (t.text !== '+' && t.text !== '-')) break;
      this.pos++;
      const right = this.parseTerm();
      if (!right) return null;
      const node: BinaryExpr = {
        kind: 'BinaryExpr',
        op: t.text as '+' | '-',
        left,
        right,
        line: t.line,
        column: t.column,
      };
      left = node;
    }
    return left;
  }

  private parseTerm(): Expr | null {
    let left = this.parseFactor();
    if (!left) return null;
    while (true) {
      const t = this.peek();
      if (t.kind !== 'operator' || (t.text !== '*' && t.text !== '/' && t.text !== '%')) break;
      this.pos++;
      const right = this.parseFactor();
      if (!right) return null;
      const node: BinaryExpr = {
        kind: 'BinaryExpr',
        op: t.text as '*' | '/' | '%',
        left,
        right,
        line: t.line,
        column: t.column,
      };
      left = node;
    }
    return left;
  }

  private parseFactor(): Expr | null {
    const t = this.peek();
    if (t.kind === 'operator' && t.text === '-') {
      this.pos++;
      const operand = this.parseFactor();
      if (!operand) return null;
      const node: UnaryExpr = {
        kind: 'UnaryExpr',
        op: '-',
        operand,
        line: t.line,
        column: t.column,
      };
      return node;
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Expr | null {
    const t = this.peek();

    if (t.kind === 'number') {
      this.pos++;
      const value = Number(t.text);
      if (!Number.isFinite(value)) {
        this.error(t, `invalid number literal '${t.text}'`);
        return null;
      }
      const node: NumberLiteral = {
        kind: 'Number',
        value,
        line: t.line,
        column: t.column,
      };
      return node;
    }

    if (t.kind === 'identifier') {
      this.pos++;
      // Function call if followed by '('
      if (this.peek().kind === 'lparen') {
        this.pos++; // consume '('
        const args: Expr[] = [];
        if (this.peek().kind !== 'rparen') {
          while (true) {
            const arg = this.parseExpression();
            if (!arg) return null;
            args.push(arg);
            const after = this.peek();
            if (after.kind === 'comma') {
              this.pos++;
              continue;
            }
            break;
          }
        }
        const rparen = this.peek();
        if (rparen.kind !== 'rparen') {
          this.error(rparen, `expected ')' to close call to '${t.text}', got '${rparen.text || rparen.kind}'`);
          return null;
        }
        this.pos++;
        const node: CallExpr = {
          kind: 'CallExpr',
          func: t.text,
          args,
          line: t.line,
          column: t.column,
        };
        return node;
      }
      // Otherwise it's a field reference — possibly namespace-qualified.
      //
      // Grammar: `ident` or `ident '.' ident`. Only single-level namespaces
      // are supported; `a.b.c` is a parse error caught on the second dot.
      if (this.peek().kind === 'dot') {
        this.pos++; // consume '.'
        const fieldTok = this.peek();
        if (fieldTok.kind !== 'identifier') {
          this.error(
            fieldTok,
            `expected field name after '${t.text}.', got '${fieldTok.text || fieldTok.kind}'`,
          );
          return null;
        }
        this.pos++;
        // Reject deeper namespaces like `a.b.c` explicitly so the error
        // message points at the offending second dot rather than silently
        // accepting `a.b` and leaving `.c` as a stray token.
        if (this.peek().kind === 'dot') {
          const extraDot = this.peek();
          this.error(
            extraDot,
            `nested field access is not supported: '${t.text}.${fieldTok.text}' cannot be followed by another '.'`,
          );
          return null;
        }
        const qualifiedNode: FieldRef = {
          kind: 'FieldRef',
          bundle: t.text,
          name: fieldTok.text,
          line: t.line,
          column: t.column,
        };
        return qualifiedNode;
      }

      const node: FieldRef = {
        kind: 'FieldRef',
        name: t.text,
        line: t.line,
        column: t.column,
      };
      return node;
    }

    if (t.kind === 'lparen') {
      this.pos++;
      const inner = this.parseExpression();
      if (!inner) return null;
      const rparen = this.peek();
      if (rparen.kind !== 'rparen') {
        this.error(rparen, `expected ')' after parenthesized expression, got '${rparen.text || rparen.kind}'`);
        return null;
      }
      this.pos++;
      return inner;
    }

    this.error(t, `unexpected token '${t.text || t.kind}' in expression`);
    return null;
  }

  // --- helpers ---

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private skipNewlines(): void {
    while (this.peek().kind === 'newline') {
      this.pos++;
    }
  }

  private skipUntilNewlineOrEof(): void {
    while (this.peek().kind !== 'newline' && this.peek().kind !== 'eof') {
      this.pos++;
    }
  }

  private error(token: Token, message: string): void {
    this.errors.push({ message, line: token.line, column: token.column });
  }
}
