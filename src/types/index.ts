/**
 * Core type definitions for Oscilla v2
 *
 * This module consolidates all types from core/canonical-types.ts and compiler/ir/Indices.ts.
 * It provides a single import point for common types.
 */

// Re-export graph types
export type { Block, Edge, Endpoint, Patch, PortRef, BlockType } from '../graph/Patch';

// =============================================================================
// Core Type System (from core/canonical-types.ts)
// =============================================================================

// Re-export canonical type system
export type {
  SignalType,
  PayloadType,
  Cardinality,
  Temporality,
  Binding,
  Extent,
  DomainId,
  DomainRef,
  DomainDecl,
  DomainShape,
  PerspectiveId,
  BranchId,
  ReferentId,
  ReferentRef,
  AxisTag,
} from '../core/canonical-types';

export {
  signalType,
  signalTypeSignal,
  signalTypeField,
  signalTypeTrigger,
  signalTypeStatic,
  signalTypePerLaneEvent,
  axisDefault,
  axisInstantiated,
  isInstantiated,
  getAxisValue,
  cardinalityZero,
  cardinalityOne,
  cardinalityMany,
  temporalityContinuous,
  temporalityDiscrete,
  bindingUnbound,
  bindingWeak,
  bindingStrong,
  bindingIdentity,
  domainRef,
  referentRef,
  extent,
  extentDefault,
  unifyAxis,
  unifyExtent,
  worldToAxes,
  domainDeclFixedCount,
  domainDeclGrid2d,
  domainDeclVoices,
  domainDeclMeshVertices,
  DEFAULTS_V0,
  FRAME_V0,
} from '../core/canonical-types';

// =============================================================================
// Branded IDs (from compiler/ir/Indices.ts)
// =============================================================================

export type {
  NodeIndex,
  PortIndex,
  ValueSlot,
  StepIndex,
  SigExprId,
  FieldExprId,
  EventExprId,
  TransformChainId,
  NodeId,
  StepId,
  ExprId,
  StateId,
  SlotId,
} from '../compiler/ir/Indices';

export {
  nodeIndex,
  portIndex,
  valueSlot,
  stepIndex,
  sigExprId,
  fieldExprId,
  eventExprId,
  nodeId,
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

import type { SignalType } from '../core/canonical-types';

/**
 * Check if source type can connect to target type.
 * Returns the conversion needed, or null if incompatible.
 *
 * NOTE: This is a legacy function. New code should use the canonical type system
 * unification and compatibility functions from canonical-types.ts.
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

export type TransformStep = AdapterStep | LensStep;

export interface AdapterStep {
  readonly kind: 'adapter';
  readonly from: SignalType;
  readonly to: SignalType;
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
  readonly type: SignalType;
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
 * Note: bus/rail variants removed - buses are now regular blocks.
 */
export type DerivedBlockMeta =
  | { readonly kind: "defaultSource"; readonly target: { readonly kind: "port"; readonly port: PortRef } }
  | { readonly kind: "wireState";     readonly target: { readonly kind: "wire"; readonly wire: WireId } }
  | { readonly kind: "lens";          readonly target: { readonly kind: "node"; readonly node: NodeRef } };

// =============================================================================
// Edge Roles (from spec 02-block-system.md)
// =============================================================================

/**
 * Every edge has an explicit role declaration.
 * Note: busTap variant removed - buses are now regular blocks.
 */
export type EdgeRole =
  | { readonly kind: "user" }
  | { readonly kind: "default"; readonly meta: { readonly defaultSourceBlockId: BlockId } }
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
