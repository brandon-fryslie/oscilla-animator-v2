/**
 * Compiled Program IR - Authoritative Schema
 *
 * This is the ONLY source of truth for the compiled program IR.
 *
 * Spec Reference: design-docs/IR-and-normalization-5-axes.md
 */

// Import the legacy types for now (will be replaced with proper execution node types)
import type { SigExpr, FieldExpr, EventExpr } from './types';
import type { SignalType, ResolvedExtent } from '../../core/canonical-types';
import type { ScheduleIR } from '../passes-v2/pass7-schedule';

// =============================================================================
// Version and Core Types
// =============================================================================

/**
 * IR Version - Literal Type
 * Changing this breaks compatibility with existing compiled programs.
 */
export type IrVersion = 1;

/**
 * Branded types for type safety
 */
export type ValueSlot = number & { readonly __brand: 'ValueSlot' };
export type StepId = number & { readonly __brand: 'StepId' };
export type BlockId = number & { readonly __brand: 'BlockId' };
export type PortId = number & { readonly __brand: 'PortId' };

// =============================================================================
// CompiledProgramIR - The Authoritative Contract
// =============================================================================

/**
 * CompiledProgramIR is the single canonical representation of a compiled program.
 *
 * Key Invariants:
 * - Dense execution tables (no hash maps)
 * - Explicit slot metadata with required offsets
 * - Axes exposed on every slot type
 * - Outputs contract for frame extraction
 * - Debug index for provenance
 *
 * Forbidden Fields (must NOT exist):
 * - program.nodes
 * - program.constPool (use constants.json only)
 * - program.transforms
 * - program.meta (except under debugIndex)
 */
export interface CompiledProgramIR {
  readonly irVersion: IrVersion;

  // Dense execution tables per class
  readonly signalExprs: SignalExprTable;
  readonly fieldExprs: FieldExprTable;
  readonly eventExprs: EventExprTable;

  // JSON-only constants
  readonly constants: {
    readonly json: readonly unknown[];
  };

  // Execution schedule (phase-ordered)
  readonly schedule: ScheduleIR;

  // Output extraction contract
  readonly outputs: readonly OutputSpecIR[];

  // Slot layout with required offsets
  readonly slotMeta: readonly SlotMetaEntry[];

  // Debug provenance
  readonly debugIndex: DebugIndexIR;
}

// =============================================================================
// Schedule IR
// =============================================================================

// ScheduleIR is imported from pass7-schedule.ts and used above
// Re-export for convenience
export type { ScheduleIR } from '../passes-v2/pass7-schedule';

// =============================================================================
// Execution Tables
// =============================================================================

/**
 * Dense, cache-friendly execution tables.
 * For v0, we use the legacy expr types but wrap them in dense arrays.
 */
export interface SignalExprTable {
  readonly nodes: readonly SigExpr[];
}

export interface FieldExprTable {
  readonly nodes: readonly FieldExpr[];
}

export interface EventExprTable {
  readonly nodes: readonly EventExpr[];
}

// =============================================================================
// Outputs Contract
// =============================================================================

/**
 * Output Specification
 *
 * Defines how runtime extracts the final frame output.
 * Runtime MUST read from program.outputs[0].slot.
 */
export interface OutputSpecIR {
  /** Only allowed kind for now */
  readonly kind: 'renderFrame';
  /** Slot containing RenderFrameIR object */
  readonly slot: ValueSlot;
}

// =============================================================================
// Slot Metadata
// =============================================================================

/**
 * Slot Metadata Entry
 *
 * Every slot referenced in the program MUST have a SlotMetaEntry.
 * Runtime is FORBIDDEN from computing offsets - they are required here.
 */
export interface SlotMetaEntry {
  readonly slot: ValueSlot;

  /** Physical storage class (backing store selection) */
  readonly storage: 'f64' | 'f32' | 'i32' | 'u32' | 'object';

  /**
   * REQUIRED: absolute offset into the backing store for this storage class.
   * Offsets are per-storage (not global) and stable-ordered (slotId ascending).
   */
  readonly offset: number;

  /**
   * REQUIRED: Canonical type (5-axis SignalType).
   * This is the compiler-authoritative type including all semantic axes.
   * Runtime uses this for type assertions and validation in debug mode.
   */
  readonly type: SignalType;

  /** Optional debug label */
  readonly debugName?: string;
}

// =============================================================================
// Type System (IR Format)
// =============================================================================

/**
 * ShapeDescIR - Value Payload Structure
 *
 * Shape is the value "payload" structure independent of domain/temporality.
 * Keep this small and predictable; express richer types via struct/array.
 */
export type ShapeDescIR =
  | { readonly kind: 'bool' }
  | { readonly kind: 'number' } // semantic number; physical storage is SlotMetaEntry.storage
  | { readonly kind: 'vec'; readonly lanes: 2 | 3 | 4; readonly element: 'number' }
  | { readonly kind: 'struct'; readonly fields: readonly StructFieldIR[] }
  | { readonly kind: 'array'; readonly length: number; readonly element: ShapeDescIR }
  | { readonly kind: 'object'; readonly class: string };

export interface StructFieldIR {
  readonly name: string;
  readonly shape: ShapeDescIR;
}

// =============================================================================
// Debug Index
// =============================================================================

/**
 * DebugIndexIR - Provenance and Debug Information
 *
 * Provides mappings from IR constructs back to source graph for debugging.
 * This is the ONLY place where "meta" information lives.
 */
export interface DebugIndexIR {
  /** Maps step IDs to source block IDs */
  readonly stepToBlock: ReadonlyMap<StepId, BlockId>;

  /** Maps slots to source block IDs */
  readonly slotToBlock: ReadonlyMap<ValueSlot, BlockId>;

  /** Port binding information */
  readonly ports: readonly PortBindingIR[];

  /** Maps slots to ports */
  readonly slotToPort: ReadonlyMap<ValueSlot, PortId>;

  /**
   * Maps numeric BlockId to permanent string ID.
   * Required because compiled program uses numeric BlockId but patch uses string ID.
   */
  readonly blockMap: ReadonlyMap<BlockId, string>;

  /** Optional: maps steps to ports */
  readonly stepToPort?: ReadonlyMap<StepId, PortId>;

  /** Optional: combine provenance */
  readonly combines?: readonly CombineDebugIR[];

  /** Optional: general labels for debugging */
  readonly labels?: ReadonlyMap<string, string>;
}

/**
 * Port Binding - Slot/Step to Port Mapping
 *
 * Enables "click value → see port" debugging.
 */
export interface PortBindingIR {
  readonly port: PortId;
  readonly block: BlockId;

  /** Stable identifiers for UI and logs */
  readonly portName: string; // "in.color", "out.field", etc.
  readonly direction: 'in' | 'out';

  /**
   * Domain classification based on cardinality.
   * Maps to canonical: zero='value', one='signal', many='field'
   */
  readonly domain: 'signal' | 'field' | 'event' | 'value';

  /** Why does this value exist? */
  readonly role: 'userWire' | 'defaultSource' | 'implicitCoerce' | 'internalHelper';

  /** Optional: if this came from a default-source block, identify it */
  readonly defaultOfPort?: PortId;
}

/**
 * Combine Debug Info
 *
 * Tracks what actually contributed to a combine operation.
 */
export interface CombineDebugIR {
  readonly step: StepId;
  readonly mode: 'writerWins' | 'additive' | 'max' | 'min' | 'mul' | 'overlay';
  readonly dst: ValueSlot;
  readonly contributors: readonly ValueSlot[]; // in priority / evaluation order
}
