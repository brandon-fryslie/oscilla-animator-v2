/**
 * Expression DSL Parser
 *
 * Hand-written recursive descent parser.
 * Converts token stream to AST.
 *
 * Grammar reference: src/expr/GRAMMAR.md
 * Operator precedence (highest to lowest):
 * 1. Member access: .
 * 2. Unary: !, -, +
 * 3. Multiplicative: *, /, %
 * 4. Additive: +, -
 * 5. Comparison: <, >, <=, >=, ==, !=
 * 6. Logical AND: &&
 * 7. Logical OR: ||
 * 8. Ternary: ? :
 */

import type { ExprNode, Position } from './ast';
import {
  astLiteral,
  astIdentifier,
  astMemberAccess,
  astUnary,
  astBinary,
  astTernary,
  astCall,
} from './ast';
import { TokenKind, type Token } from './lexer';

/**
 * Parse error with position information.
 */
export class ParseError extends Error {
  constructor(
    message: string,
    public readonly pos: Position,
    public readonly expected?: string[],
    public readonly got?: string
  ) {
    super(message);
    this.name = 'ParseError';
  }
}

/**
 * Parser state (mutable, but encapsulated).
 */
class Parser {
  private tokens: Token[];
  private current: number;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.current = 0;
  }

  /**
   * Parse expression (entry point).
   * Grammar: expression := ternary
   */
  parse(): ExprNode {
    const expr = this.ternary();

    // Ensure all tokens consumed (except EOF)
    if (!this.isAtEnd()) {
      const tok = this.peek();
      throw new ParseError(
        `Unexpected token '${tok.value}' after expression`,
        tok.pos,
        ['end of input'],
        tok.value
      );
    }

    return expr;
  }

  /**
   * Parse ternary conditional (right-associative).
   * Grammar: ternary := logical ("?" expression ":" expression)?
   */
  private ternary(): ExprNode {
    let expr = this.logical();

    if (this.match(TokenKind.QUESTION)) {
      const start = expr.pos.start;
      const thenBranch = this.ternary(); // Right-associative: recurse for nested ternaries
      this.consume(TokenKind.COLON, "Expected ':' after then branch of ternary");
      const elseBranch = this.ternary();
      const end = elseBranch.pos.end;
      expr = astTernary(expr, thenBranch, elseBranch, { start, end });
    }

    return expr;
  }

  /**
   * Parse logical OR (left-associative).
   * Grammar: logical := compare (("&&" | "||") compare)*
   * Note: Split into two levels for precedence (AND before OR)
   */
  private logical(): ExprNode {
    return this.logicalOr();
  }

  /**
   * Logical OR level.
   */
  private logicalOr(): ExprNode {
    let expr = this.logicalAnd();

    while (this.match(TokenKind.OR)) {
      const op = '||';
      const start = expr.pos.start;
      const right = this.logicalAnd();
      const end = right.pos.end;
      expr = astBinary(op, expr, right, { start, end });
    }

    return expr;
  }

  /**
   * Logical AND level.
   */
  private logicalAnd(): ExprNode {
    let expr = this.compare();

    while (this.match(TokenKind.AND)) {
      const op = '&&';
      const start = expr.pos.start;
      const right = this.compare();
      const end = right.pos.end;
      expr = astBinary(op, expr, right, { start, end });
    }

    return expr;
  }

  /**
   * Parse comparison operators (left-associative).
   * Grammar: compare := additive (("<" | ">" | "<=" | ">=" | "==" | "!=") additive)*
   */
  private compare(): ExprNode {
    let expr = this.additive();

    while (this.matchAny([TokenKind.LT, TokenKind.GT, TokenKind.LTE, TokenKind.GTE, TokenKind.EQ, TokenKind.NEQ])) {
      const opToken = this.previous();
      const op = this.tokenToCompareOp(opToken.kind);
      const start = expr.pos.start;
      const right = this.additive();
      const end = right.pos.end;
      expr = astBinary(op, expr, right, { start, end });
    }

    return expr;
  }

  /**
   * Parse additive operators (left-associative).
   * Grammar: additive := multiplicative (("+" | "-") multiplicative)*
   */
  private additive(): ExprNode {
    let expr = this.multiplicative();

    while (this.matchAny([TokenKind.PLUS, TokenKind.MINUS])) {
      const opToken = this.previous();
      const op = opToken.kind === TokenKind.PLUS ? '+' : '-';
      const start = expr.pos.start;
      const right = this.multiplicative();
      const end = right.pos.end;
      expr = astBinary(op, expr, right, { start, end });
    }

    return expr;
  }

  /**
   * Parse multiplicative operators (left-associative).
   * Grammar: multiplicative := unary (("*" | "/" | "%") unary)*
   */
  private multiplicative(): ExprNode {
    let expr = this.unary();

    while (this.matchAny([TokenKind.STAR, TokenKind.SLASH, TokenKind.PERCENT])) {
      const opToken = this.previous();
      const op = this.tokenToMulOp(opToken.kind);
      const start = expr.pos.start;
      const right = this.unary();
      const end = right.pos.end;
      expr = astBinary(op, expr, right, { start, end });
    }

    return expr;
  }

  /**
   * Parse unary operators (right-associative).
   * Grammar: unary := ("!" | "-" | "+") unary | call
   */
  private unary(): ExprNode {
    if (this.matchAny([TokenKind.NOT, TokenKind.MINUS, TokenKind.PLUS])) {
      const opToken = this.previous();
      const op = this.tokenToUnaryOp(opToken.kind);
      const start = opToken.pos.start;
      const arg = this.unary(); // Right-associative: recurse
      const end = arg.pos.end;
      return astUnary(op, arg, { start, end });
    }

    return this.call();
  }

  /**
   * Parse function call.
   * Grammar: call := member ("(" arguments? ")")?
   */
  private call(): ExprNode {
    let expr = this.member();

    if (this.match(TokenKind.LPAREN)) {
      // Function call
      if (expr.kind !== 'identifier') {
        throw new ParseError(
          'Only identifiers can be called as functions',
          expr.pos
        );
      }

      const fnName = expr.name;
      const start = expr.pos.start;
      const args = this.arguments();
      const closeParen = this.consume(TokenKind.RPAREN, "Expected ')' after arguments");
      const end = closeParen.pos.end;
      expr = astCall(fnName, args, { start, end });
    }

    return expr;
  }

  /**
   * Parse member access (left-associative).
   * Grammar: member := primary ("." IDENTIFIER)*
   *
   * Member access has highest precedence - it binds tighter than function calls.
   * Examples:
   *   Circle1.radius   → MemberAccess(identifier "Circle1", "radius")
   *   a.b.c            → MemberAccess(MemberAccess(identifier "a", "b"), "c")
   */
  private member(): ExprNode {
    let expr = this.primary();

    // Handle chained member access (left-associative)
    while (this.match(TokenKind.DOT)) {
      if (!this.check(TokenKind.IDENT)) {
        throw new ParseError(
          'Expected identifier after "."',
          this.peek().pos,
          ['identifier'],
          this.peek().value
        );
      }
      const memberToken = this.advance();
      const start = expr.pos.start;
      const end = memberToken.pos.end;
      expr = astMemberAccess(expr, memberToken.value, { start, end });
    }

    return expr;
  }

  /**
   * Parse function arguments.
   * Grammar: arguments := expression ("," expression)*
   * Returns empty array if no arguments.
   */
  private arguments(): ExprNode[] {
    const args: ExprNode[] = [];

    // Check for empty argument list
    if (this.check(TokenKind.RPAREN)) {
      return args;
    }

    // Parse first argument
    args.push(this.ternary()); // Use ternary, not expression, to avoid ambiguity with comma

    // Parse remaining arguments
    while (this.match(TokenKind.COMMA)) {
      args.push(this.ternary());
    }

    return args;
  }

  /**
   * Parse primary expression.
   * Grammar: primary := NUMBER | IDENTIFIER | "(" expression ")"
   */
  private primary(): ExprNode {
    // Number literal
    if (this.match(TokenKind.NUMBER)) {
      const token = this.previous();
      const value = parseFloat(token.value);
      return astLiteral(value, token.value, token.pos);
    }

    // Identifier
    if (this.match(TokenKind.IDENT)) {
      const token = this.previous();
      return astIdentifier(token.value, token.pos);
    }

    // Parenthesized expression
    if (this.match(TokenKind.LPAREN)) {
      const start = this.previous().pos.start;
      const expr = this.ternary(); // Parse full expression inside parens
      const closeParen = this.consume(TokenKind.RPAREN, "Expected ')' after expression");
      const end = closeParen.pos.end;
      // Return expr with updated position spanning parens
      return { ...expr, pos: { start, end } };
    }

    // Error: unexpected token
    const token = this.peek();
    throw new ParseError(
      `Expected expression, got '${token.value}'`,
      token.pos,
      ['number', 'identifier', '('],
      token.value
    );
  }

  // Token helpers
  private match(kind: TokenKind): boolean {
    if (this.check(kind)) {
      this.advance();
      return true;
    }
    return false;
  }

  private matchAny(kinds: TokenKind[]): boolean {
    for (const kind of kinds) {
      if (this.check(kind)) {
        this.advance();
        return true;
      }
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

  private previous(): Token {
    return this.tokens[this.current - 1];
  }

  private consume(kind: TokenKind, message: string): Token {
    if (this.check(kind)) {
      return this.advance();
    }

    const token = this.peek();
    throw new ParseError(message, token.pos, [kind], token.value);
  }

  // Operator conversion
  private tokenToUnaryOp(kind: TokenKind): '!' | '-' | '+' {
    switch (kind) {
      case TokenKind.NOT:
        return '!';
      case TokenKind.MINUS:
        return '-';
      case TokenKind.PLUS:
        return '+';
      default:
        throw new Error(`Invalid unary operator: ${kind}`);
    }
  }

  private tokenToMulOp(kind: TokenKind): '*' | '/' | '%' {
    switch (kind) {
      case TokenKind.STAR:
        return '*';
      case TokenKind.SLASH:
        return '/';
      case TokenKind.PERCENT:
        return '%';
      default:
        throw new Error(`Invalid multiplicative operator: ${kind}`);
    }
  }

  private tokenToCompareOp(kind: TokenKind): '<' | '>' | '<=' | '>=' | '==' | '!=' {
    switch (kind) {
      case TokenKind.LT:
        return '<';
      case TokenKind.GT:
        return '>';
      case TokenKind.LTE:
        return '<=';
      case TokenKind.GTE:
        return '>=';
      case TokenKind.EQ:
        return '==';
      case TokenKind.NEQ:
        return '!=';
      default:
        throw new Error(`Invalid comparison operator: ${kind}`);
    }
  }
}

/**
 * Public API: Parse expression string to AST.
 * @param tokens Token stream from lexer
 * @returns AST root node
 * @throws ParseError if syntax is invalid
 */
export function parse(tokens: Token[]): ExprNode {
  const parser = new Parser(tokens);
  return parser.parse();
}
