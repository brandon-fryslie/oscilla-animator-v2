/**
 * src/pillars/expression/index.ts
 *
 * Barrel exports for the expression DSL used by ExpressionModifier blocks.
 */

export type {
  Program,
  Assignment,
  Expr,
  NumberLiteral,
  FieldRef,
  BinaryExpr,
  UnaryExpr,
  CallExpr,
} from './ast';
export type { Token, TokenKind, TokenizeError, TokenizeResult } from './tokenize';
export type { ParseError, ParseResult } from './parse';
export type { CompileError, CompileProgramResult } from './compile';

export { tokenize } from './tokenize';
export { parse } from './parse';
export { compileProgram, applyExpression } from './compile';
