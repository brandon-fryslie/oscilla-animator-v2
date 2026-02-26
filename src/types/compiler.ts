/**
 * Compiler-safe shared types.
 *
 * This module intentionally excludes graph/Patch re-exports so backend/IR can
 * depend on stable scalar type contracts without importing editor graph shapes.
 */

declare const BlockIdBrand: unique symbol;
declare const PortIdBrand: unique symbol;

export type BlockId = string & { readonly [BlockIdBrand]: never };
export type PortId = string & { readonly [PortIdBrand]: never };

export function blockId(s: string): BlockId {
  return s as BlockId;
}

export function portId(s: string): PortId {
  return s as PortId;
}

// [LAW:one-type-per-behavior] Canonical block-port reference shared across UI,
// diagnostics, and derived role metadata.
export interface PortEndpointRef {
  readonly blockId: BlockId;
  readonly portId: PortId;
}

/**
 * Combine mode for input ports with multiple edges.
 */
export type CombineMode =
  | 'last'
  | 'first'
  | 'sum'
  | 'average'
  | 'max'
  | 'min'
  | 'mul'
  | 'layer'
  | 'or'
  | 'and'
  | 'collect'
  | 'array';

export type CombineModeCategory = 'numeric' | 'any' | 'boolean';

export const COMBINE_MODE_CATEGORY: Record<CombineMode, CombineModeCategory> = {
  last: 'any',
  first: 'any',
  sum: 'numeric',
  average: 'numeric',
  max: 'numeric',
  min: 'numeric',
  mul: 'numeric',
  layer: 'any',
  or: 'boolean',
  and: 'boolean',
  collect: 'any',
  array: 'any',
};

// [LAW:single-enforcer] Canonicalize legacy/user-facing combine aliases at one boundary.
export function canonicalizeCombineMode(mode: CombineMode): CombineMode {
  return mode === 'array' ? 'collect' : mode;
}

