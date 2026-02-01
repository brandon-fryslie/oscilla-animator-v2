/**
 * Patch DSL HCL Abstract Syntax Tree (AST) Types
 *
 * Pure data structures representing parsed HCL documents.
 * No Patch-specific types — this is generic HCL infrastructure.
 *
 * Design:
 * - Immutable (readonly)
 * - Discriminated unions with 'kind' field
 * - Position tracking for error reporting
 * - Reuses Position type from expr/ast.ts
 */

import type { Position as ExprPosition } from '../expr/ast';

// Reuse Position type from expression DSL
export type Position = ExprPosition;

/**
 * HCL value types (right side of `=`).
 * Discriminated union with 6 variants.
 */
export type HclValue =
  | HclNumberValue
  | HclStringValue
  | HclBoolValue
  | HclReferenceValue
  | HclObjectValue
  | HclListValue;

/**
 * Number literal value.
 */
export interface HclNumberValue {
  readonly kind: 'number';
  readonly value: number;
}

/**
 * String literal value.
 */
export interface HclStringValue {
  readonly kind: 'string';
  readonly value: string;
}

/**
 * Boolean literal value (true/false).
 */
export interface HclBoolValue {
  readonly kind: 'bool';
  readonly value: boolean;
}

/**
 * Reference value (traversal).
 * Example: `osc.out` → { kind: 'reference', parts: ['osc', 'out'] }
 */
export interface HclReferenceValue {
  readonly kind: 'reference';
  readonly parts: readonly string[];
}

/**
 * Object value (map of key-value pairs).
 * Example: `{ r = 1.0, g = 0.5 }` → { kind: 'object', entries: { r: ..., g: ... } }
 */
export interface HclObjectValue {
  readonly kind: 'object';
  readonly entries: Record<string, HclValue>;
}

/**
 * List value (array).
 * Example: `[1, 2, 3]` → { kind: 'list', items: [1, 2, 3] }
 */
export interface HclListValue {
  readonly kind: 'list';
  readonly items: readonly HclValue[];
}

/**
 * HCL block structure (top-level or nested).
 * Example: `block "Ellipse" "dot" { rx = 0.02 }`
 *   → { type: 'block', labels: ['Ellipse', 'dot'], attributes: { rx: 0.02 }, ... }
 */
export interface HclBlock {
  readonly type: string;                         // "block", "connect", "patch", etc.
  readonly labels: readonly string[];            // Block labels (strings after type)
  readonly attributes: Record<string, HclValue>; // Key-value attributes
  readonly children: readonly HclBlock[];        // Nested blocks
  readonly pos: Position;                        // Position in source
}

/**
 * HCL document (top level).
 * Contains array of top-level blocks.
 */
export interface HclDocument {
  readonly blocks: readonly HclBlock[];
}
