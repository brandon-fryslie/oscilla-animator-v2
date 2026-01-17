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
  InstanceId,
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
  instanceId,
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
// Combine Mode
// =============================================================================

export type CombineMode =
  | 'last'      // Last value wins
  | 'first'     // First value wins
  | 'sum'       // Numeric sum
  | 'average'   // Numeric average
  | 'max'       // Numeric maximum
  | 'min';      // Numeric minimum

// Import SignalType for local use in interface definitions
import type { SignalType } from '../core/canonical-types';

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
  readonly defaultSource: DefaultSource;
}

/**
 * DefaultSource - discriminated union for default input sources.
 *
 * Every input port has exactly one source. If no explicit edge is connected,
 * the DefaultSource provides the fallback behavior.
 *
 * Variants:
 * - 'rail': Reference to a named rail (e.g., 'phaseA', 'phaseB')
 * - 'constant': A constant value
 * - 'none': No default (port reads as undefined/zero/empty)
 */
export type DefaultSource =
  | { readonly kind: 'rail'; readonly railId: string }
  | { readonly kind: 'constant'; readonly value: unknown }
  | { readonly kind: 'none' };

/**
 * Helper functions to create DefaultSource instances
 */
export function defaultSourceRail(railId: string): DefaultSource {
  return { kind: 'rail', railId };
}

export function defaultSourceConstant(value: unknown): DefaultSource {
  return { kind: 'constant', value };
}

export function defaultSourceNone(): DefaultSource {
  return { kind: 'none' };
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
  | { readonly kind: 'user';      readonly meta: UserBlockMeta }
  | { readonly kind: 'timeRoot';  readonly meta: TimeRootMeta }
  | { readonly kind: 'bus';       readonly meta: BusMeta }
  | { readonly kind: 'domain';    readonly meta: DomainMeta }
  | { readonly kind: 'renderer';  readonly meta: RendererMeta }
  | { readonly kind: 'derived';   readonly meta: DerivedBlockMeta };

/**
 * Meta types - empty for now, structure allows future extension
 */
export interface UserBlockMeta {}
export interface TimeRootMeta {}
export interface BusMeta {}
export interface DomainMeta {}
export interface RendererMeta {}

/**
 * Metadata for derived blocks specifying their purpose.
 * Note: bus/rail variants removed - buses are now regular blocks.
 */
export type DerivedBlockMeta =
  | { readonly kind: "defaultSource"; readonly target: { readonly kind: "port"; readonly port: PortRef } }
  | { readonly kind: "wireState";     readonly target: { readonly kind: "wire"; readonly wire: WireId } }
  | { readonly kind: "lens";          readonly target: { readonly kind: "node"; readonly node: NodeRef } }
  | { readonly kind: "adapter";       readonly edgeId: string; readonly adapterType: string };

/**
 * Helper functions to create BlockRole instances
 */
export function userRole(): BlockRole {
  return { kind: 'user', meta: {} };
}

export function timeRootRole(): BlockRole {
  return { kind: 'timeRoot', meta: {} };
}

export function busRole(): BlockRole {
  return { kind: 'bus', meta: {} };
}

export function domainRole(): BlockRole {
  return { kind: 'domain', meta: {} };
}

export function rendererRole(): BlockRole {
  return { kind: 'renderer', meta: {} };
}

export function derivedRole(meta: DerivedBlockMeta): BlockRole {
  return { kind: 'derived', meta };
}

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
