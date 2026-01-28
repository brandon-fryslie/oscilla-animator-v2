/**
 * Expression DSL Abstract Syntax Tree (AST) Types
 *
 * Immutable AST nodes representing parsed expressions.
 * Each node includes position information for error reporting
 * and optional type annotation filled by type checker.
 *
 * Grammar reference: src/expr/GRAMMAR.md
 */

import type { CanonicalType, PayloadType } from '../core/canonical-types';

/**
 * Position information for error reporting.
 * Character offsets (0-indexed) into the source expression string.
 */
export interface Position {
  readonly start: number;  // Character offset
  readonly end: number;    // Character offset after last character
}

/**
 * Expression AST node (discriminated union).
 * All nodes have position and optional type annotation.
 */
export type ExprNode =
  | LiteralNode
  | IdentifierNode
  | MemberAccessNode
  | UnaryOpNode
  | BinaryOpNode
  | TernaryNode
  | CallNode;

/**
 * Literal value node (number).
 * Note: Boolean literals don't exist in grammar - booleans come from comparisons.
 * The `raw` field preserves the original token to distinguish int from float literals.
 */
export interface LiteralNode {
  readonly kind: 'literal';
  readonly value: number;
  readonly raw: string;    // Original token (e.g., "42" vs "42.0")
  readonly pos: Position;
  readonly type?: PayloadType;  // Filled by type checker (int or float)
}

/**
 * Identifier node (input reference).
 * Name must be validated against input types map by type checker.
 */
export interface IdentifierNode {
  readonly kind: 'identifier';
  readonly name: string;
  readonly pos: Position;
  readonly type?: PayloadType;  // Filled by type checker (from inputs)
}

/**
 * Member access node (block output reference).
 * Represents `object.member` syntax for referencing block outputs.
 * Example: Circle1.radius
 *
 * The object can be an identifier (for simple block references) or
 * another member access node (for chained access, though this is not
 * currently used in the Expression DSL - reserved for future use).
 */
export interface MemberAccessNode {
  readonly kind: 'member';
  readonly object: ExprNode;
  readonly member: string;
  readonly pos: Position;
  readonly type?: PayloadType;  // Filled by type checker (from block output)
}

/**
 * Unary operator node.
 * Operators: !, -, + (right-associative)
 */
export interface UnaryOpNode {
  readonly kind: 'unary';
  readonly op: '!' | '-' | '+';
  readonly arg: ExprNode;
  readonly pos: Position;
  readonly type?: PayloadType;  // Filled by type checker
}

/**
 * Binary operator node.
 * Operators: arithmetic, comparison, logical (left-associative)
 */
export interface BinaryOpNode {
  readonly kind: 'binary';
  readonly op: BinaryOp;
  readonly left: ExprNode;
  readonly right: ExprNode;
  readonly pos: Position;
  readonly type?: PayloadType;  // Filled by type checker
}

/**
 * Binary operator types (precedence encoded in parser, not here).
 */
export type BinaryOp =
  // Arithmetic
  | '+' | '-' | '*' | '/' | '%'
  // Comparison
  | '<' | '>' | '<=' | '>=' | '==' | '!='
  // Logical
  | '&&' | '||';

/**
 * Ternary conditional node (? :).
 * Right-associative: a ? b : c ? d : e parses as a ? b : (c ? d : e)
 */
export interface TernaryNode {
  readonly kind: 'ternary';
  readonly cond: ExprNode;
  readonly then: ExprNode;
  readonly else: ExprNode;
  readonly pos: Position;
  readonly type?: PayloadType;  // Filled by type checker (unified from branches)
}

/**
 * Function call node.
 * Function names validated against FUNCTIONS.md catalog by type checker.
 */
export interface CallNode {
  readonly kind: 'call';
  readonly fn: string;
  readonly args: readonly ExprNode[];
  readonly pos: Position;
  readonly type?: PayloadType;  // Filled by type checker (from function signature)
}

// =============================================================================
// AST Helper Functions (immutable builders)
// =============================================================================

/**
 * Create a literal node.
 */
export function astLiteral(value: number, raw: string, pos: Position): LiteralNode {
  return { kind: 'literal', value, raw, pos };
}

/**
 * Create an identifier node.
 */
export function astIdentifier(name: string, pos: Position): IdentifierNode {
  return { kind: 'identifier', name, pos };
}

/**
 * Create a member access node.
 */
export function astMemberAccess(object: ExprNode, member: string, pos: Position): MemberAccessNode {
  return { kind: 'member', object, member, pos };
}

/**
 * Create a unary operator node.
 */
export function astUnary(op: '!' | '-' | '+', arg: ExprNode, pos: Position): UnaryOpNode {
  return { kind: 'unary', op, arg, pos };
}

/**
 * Create a binary operator node.
 */
export function astBinary(op: BinaryOp, left: ExprNode, right: ExprNode, pos: Position): BinaryOpNode {
  return { kind: 'binary', op, left, right, pos };
}

/**
 * Create a ternary conditional node.
 */
export function astTernary(cond: ExprNode, then: ExprNode, elseBranch: ExprNode, pos: Position): TernaryNode {
  return { kind: 'ternary', cond, then, else: elseBranch, pos };
}

/**
 * Create a function call node.
 */
export function astCall(fn: string, args: readonly ExprNode[], pos: Position): CallNode {
  return { kind: 'call', fn, args, pos };
}

/**
 * Annotate AST node with type (used by type checker).
 * Returns new node with type field set.
 */
export function withType<T extends ExprNode>(node: T, type: PayloadType): T {
  return { ...node, type };
}
