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
 * Namespace-qualified field references (`clock.time`, `primary.pos_x`) are
 * supported. Unqualified identifiers resolve against the `primary` bundle
 * by default — both `pos_x` and `primary.pos_x` are equivalent.
 *
 * Assignment LHS is always unqualified: a write always targets the primary
 * bundle. There is no way to write to a secondary bundle from within the
 * DSL (secondary bundles are read-only by construction).
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
  /**
   * Optional bundle namespace. When omitted, resolution defaults to the
   * primary input bundle (i.e. `pos_x` and `primary.pos_x` are equivalent).
   * When present, the compiler looks up the field in
   * `inputBundles[bundle]` — typically a secondary bundle slot name like
   * `'clock'` that matches an incoming edge's `inputSlot`.
   */
  readonly bundle?: string;
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
