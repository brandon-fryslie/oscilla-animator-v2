/**
 * src/pillars/expression/ast.ts
 *
 * AST types for the expression DSL used by ExpressionModifier blocks.
 *
 * Grammar (slice 2 — single primary bundle, no namespace qualification):
 *
 *   program     = { newline } { assignment [ newline ] }
 *   assignment  = identifier '=' expression
 *   expression  = term { ('+' | '-') term }
 *   term        = factor { ('*' | '/' | '%') factor }
 *   factor      = '-' factor | primary
 *   primary     = number | call | identifier | '(' expression ')'
 *   call        = identifier '(' [ expression { ',' expression } ] ')'
 *
 * A program is a sequence of assignments, each of which replaces one field
 * of the primary SourceBundle with a new expression. Unassigned fields pass
 * through unchanged.
 *
 * Every node carries source position (line, column) for error messages.
 *
 * Cross-bundle namespaces (`clock.time`, `other.pos_x`) are NOT supported
 * in slice 2 — those come in slice 3 alongside secondary bundle inputs.
 */

export interface Program {
  readonly kind: 'Program';
  readonly assignments: readonly Assignment[];
}

export interface Assignment {
  readonly kind: 'Assignment';
  /** The LHS field name to be overwritten on the output bundle. */
  readonly field: string;
  readonly value: Expr;
  readonly line: number;
  readonly column: number;
}

export type Expr =
  | NumberLiteral
  | FieldRef
  | BinaryExpr
  | UnaryExpr
  | CallExpr;

export interface NumberLiteral {
  readonly kind: 'Number';
  readonly value: number;
  readonly line: number;
  readonly column: number;
}

export interface FieldRef {
  readonly kind: 'FieldRef';
  /** Resolves against the primary input bundle at compile time. */
  readonly name: string;
  readonly line: number;
  readonly column: number;
}

export interface BinaryExpr {
  readonly kind: 'BinaryExpr';
  readonly op: '+' | '-' | '*' | '/' | '%';
  readonly left: Expr;
  readonly right: Expr;
  readonly line: number;
  readonly column: number;
}

export interface UnaryExpr {
  readonly kind: 'UnaryExpr';
  readonly op: '-';
  readonly operand: Expr;
  readonly line: number;
  readonly column: number;
}

export interface CallExpr {
  readonly kind: 'CallExpr';
  /** The function name — must match a BuiltinMathFunc at compile time. */
  readonly func: string;
  readonly args: readonly Expr[];
  readonly line: number;
  readonly column: number;
}
