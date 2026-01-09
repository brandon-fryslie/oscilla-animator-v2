/**
 * Core type definitions for Oscilla v2
 *
 * This module consolidates all types from core/types.ts and compiler/ir/Indices.ts.
 * It provides a single import point for common types.
 */

// Re-export graph types
export type { Block, Edge, Endpoint, Patch, PortRef, BlockType } from '../graph/Patch';

// =============================================================================
// Core Type System (from core/types.ts)
// =============================================================================

// Re-export ALL type definitions from core
export type {
  TypeWorld,
  Domain,
  TypeCategory,
  TypeDesc,
  CoreDomain,
  InternalDomain,
} from '../core/types';

export {
  createTypeDesc,
  getTypeArity,
  inferBundleLanes,
  sigType,
  fieldType,
  scalarType,
  eventType,
} from '../core/types';

// Create local aliases for World (since core/types uses TypeWorld)
import type { TypeWorld as CoreTypeWorld, Domain as CoreDomain } from '../core/types';
export type World = CoreTypeWorld;

// =============================================================================
// Branded IDs (from compiler/ir/Indices.ts)
// =============================================================================

export type {
  NodeIndex,
  PortIndex,
  BusIndex,
  ValueSlot,
  StepIndex,
  SigExprId,
  FieldExprId,
  EventExprId,
  TransformChainId,
  NodeId,
  BusId,
  StepId,
  ExprId,
  StateId,
  DomainId,
  SlotId,
} from '../compiler/ir/Indices';

export {
  nodeIndex,
  portIndex,
  busIndex,
  valueSlot,
  stepIndex,
  sigExprId,
  fieldExprId,
  eventExprId,
  nodeId,
  busId,
  stepId,
  exprId,
  stateId,
  domainId,
  slotId,
} from '../compiler/ir/Indices';

// =============================================================================
// Block/Port IDs (string-based)
// =============================================================================

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

// =============================================================================
// Type Compatibility (Simple version for toy compiler)
// =============================================================================

/**
 * Check if source type can connect to target type.
 * Returns the conversion needed, or null if incompatible.
 */
export function getConversion(
  source: { world: string; domain: string },
  target: { world: string; domain: string }
): Conversion | null {
  // Same type - direct
  if (source.world === target.world && source.domain === target.domain) {
    return { kind: 'direct' };
  }

  // Domain must match for automatic conversions
  if (source.domain !== target.domain) {
    return null;
  }

  // Scalar → Signal (promote)
  if (source.world === 'scalar' && target.world === 'signal') {
    return { kind: 'promote', from: 'scalar', to: 'signal' };
  }

  // Signal → Field (broadcast)
  if (source.world === 'signal' && target.world === 'field') {
    return { kind: 'broadcast' };
  }

  // Scalar → Field (promote then broadcast)
  if (source.world === 'scalar' && target.world === 'field') {
    return { kind: 'promote-broadcast' };
  }

  return null;
}

export type Conversion =
  | { kind: 'direct' }
  | { kind: 'promote'; from: 'scalar'; to: 'signal' }
  | { kind: 'broadcast' }
  | { kind: 'promote-broadcast' };

// =============================================================================
// SlotWorld - Classification for evaluation timing
// =============================================================================

export type SlotWorld = 'signal' | 'field' | 'scalar' | 'config';

// =============================================================================
// Combine Mode
// =============================================================================

export type CombineMode =
  | 'last'      // Last value wins
  | 'first'     // First value wins
  | 'sum'       // Numeric sum
  | 'average'   // Numeric average
  | 'max'       // Numeric maximum
  | 'min';      // Numeric minimum

// =============================================================================
// Transform System Types
// =============================================================================

import type { TypeDesc } from '../core/types';

export type TransformStep = AdapterStep | LensStep;

export interface AdapterStep {
  readonly kind: 'adapter';
  readonly from: TypeDesc;
  readonly to: TypeDesc;
  readonly adapter: string;
  readonly adapterId?: string;
  readonly params?: Record<string, unknown>;
}

export interface LensStep {
  readonly kind: 'lens';
  readonly lens: LensInstance;
}

export interface LensInstance {
  readonly lensId: string;
  readonly params: Record<string, LensParamBinding>;
  readonly enabled?: boolean;
  readonly sortKey?: number; // int
}

export type LensParamBinding =
  | { readonly kind: 'literal'; readonly value: unknown }
  | { readonly kind: 'default'; readonly defaultSourceId: string };

// =============================================================================
// Slot Definition Types
// =============================================================================

export type SlotDirection = 'input' | 'output';

export interface Slot {
  readonly id: string;
  readonly label: string;
  readonly type: TypeDesc;
  readonly direction: SlotDirection;
  readonly optional?: boolean;
  readonly defaultValue?: unknown;
  readonly defaultSource?: DefaultSource;
}

export interface DefaultSource {
  readonly value: unknown;
  readonly world?: SlotWorld;
}

// =============================================================================
// UI Control Hints
// =============================================================================

export type UIControlHint =
  | { kind: 'slider'; min: number; max: number; step: number }
  | { kind: 'int'; min?: number; max?: number; step?: number }
  | { kind: 'float'; min?: number; max?: number; step?: number }
  | { kind: 'select'; options: { value: string; label: string }[] }
  | { kind: 'color' }
  | { kind: 'boolean' }
  | { kind: 'text' }
  | { kind: 'xy' };
// =============================================================================
// Block Roles (from spec 02-block-system.md)
// =============================================================================

// Import types used in role definitions
import type { PortRef } from '../graph/Patch';
import type { BusId } from '../compiler/ir/Indices';

/**
 * Wire identifier (for wireState targeting).
 */
export type WireId = string & { readonly __brand: 'WireId' };

export function wireId(s: string): WireId {
  return s as WireId;
}

/**
 * Node reference (for lens targeting).
 */
export interface NodeRef {
  readonly kind: 'node';
  readonly id: string;
}

/**
 * Every block has an explicit role declaration.
 * Roles exist for the editor, not the compiler.
 */
export type BlockRole =
  | { readonly kind: "user" }
  | { readonly kind: "derived"; readonly meta: DerivedBlockMeta };

/**
 * Metadata for derived blocks specifying their purpose.
 */
export type DerivedBlockMeta =
  | { readonly kind: "defaultSource"; readonly target: { readonly kind: "port"; readonly port: PortRef } }
  | { readonly kind: "wireState";     readonly target: { readonly kind: "wire"; readonly wire: WireId } }
  | { readonly kind: "bus";           readonly target: { readonly kind: "bus"; readonly busId: BusId } }
  | { readonly kind: "rail";          readonly target: { readonly kind: "bus"; readonly busId: BusId } }
  | { readonly kind: "lens";          readonly target: { readonly kind: "node"; readonly node: NodeRef } };

// =============================================================================
// Edge Roles (from spec 02-block-system.md)
// =============================================================================

/**
 * Every edge has an explicit role declaration.
 */
export type EdgeRole =
  | { readonly kind: "user" }
  | { readonly kind: "default"; readonly meta: { readonly defaultSourceBlockId: BlockId } }
  | { readonly kind: "busTap";  readonly meta: { readonly busId: BusId } }
  | { readonly kind: "auto";    readonly meta: { readonly reason: "portMoved" | "rehydrate" | "migrate" } };

// =============================================================================
// Rail IDs (MVP rail identifiers)
// =============================================================================

export type RailId =
  | 'time'
  | 'phaseA'
  | 'phaseB'
  | 'pulse'
  | 'palette'
  | 'energy';
