/**
 * Compiled Program IR - Authoritative Schema
 *
 * This is the ONLY source of truth for the compiled program IR.
 * The legacy IRProgram in types.ts is deprecated and will be removed.
 *
 * Spec Reference: design-docs/IR-and-normalization-5-axes.md
 */
import type { SigExpr, FieldExpr, EventExpr } from './types';
/**
 * IR Version - Literal Type
 * Changing this breaks compatibility with existing compiled programs.
 */
export type IrVersion = 1;
/**
 * Branded types for type safety
 */
export type ValueSlot = number & {
    readonly __brand: 'ValueSlot';
};
export type StepId = number & {
    readonly __brand: 'StepId';
};
export type BlockId = number & {
    readonly __brand: 'BlockId';
};
export type PortId = number & {
    readonly __brand: 'PortId';
};
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
 * - program.buses
 * - program.constPool (use constants.json only)
 * - program.transforms
 * - program.meta (except under debugIndex)
 */
export interface CompiledProgramIR {
    readonly irVersion: IrVersion;
    readonly signalExprs: SignalExprTable;
    readonly fieldExprs: FieldExprTable;
    readonly eventExprs: EventExprTable;
    readonly constants: {
        readonly json: readonly unknown[];
    };
    readonly schedule: ScheduleIR;
    readonly outputs: readonly OutputSpecIR[];
    readonly slotMeta: readonly SlotMetaEntry[];
    readonly debugIndex: DebugIndexIR;
}
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
    /** REQUIRED: logical type including axes */
    readonly type: TypeDesc;
    /** Optional debug label */
    readonly debugName?: string;
}
/**
 * TypeDesc - Complete Type Descriptor
 *
 * The single logical type descriptor used everywhere (debug, validation, tooling).
 * Axes are REQUIRED and are the compiler-authoritative semantic classification.
 */
export interface TypeDesc {
    readonly axes: AxesDescIR;
    readonly shape: ShapeDescIR;
}
/**
 * AxesDescIR - 5-Axis Semantic Classification
 *
 * Models the "new axes" explicitly. This is stable metadata:
 * - Adding fields is allowed
 * - Removing/renaming is a breaking IR change
 */
export interface AxesDescIR {
    /**
     * Domain (a.k.a. "world"): which evaluation universe this value inhabits.
     * - "signal": time-indexed value (per tick / per sample / per frame)
     * - "field": spatially-indexed value (evaluated over a domain such as x/y, uv, etc.)
     * - "event": instantaneous value carried by event semantics (triggered, not continuous)
     * - "value": non-world value (constants, config, editor objects) that does not live in a world
     */
    readonly domain: 'signal' | 'field' | 'event' | 'value';
    /**
     * Temporality: how the value varies with time *within its domain*.
     * - "static": not time-varying (can still be sampled)
     * - "discrete": changes only at ticks/frames/steps
     * - "continuous": intended to represent continuous-time variation (still simulated discretely)
     * - "instant": exists only at an event instant (typically used with domain="event")
     */
    readonly temporality: 'static' | 'discrete' | 'continuous' | 'instant';
    /**
     * Perspective: which "view" this value is expressed in, when relevant.
     * This is intentionally an enum rather than a free-form string to keep tooling stable.
     * If you only need one, use "frame" everywhere for now.
     */
    readonly perspective: 'frame' | 'sample' | 'global';
    /**
     * Branch axis: whether this value is single-lane or branch-lane.
     * This is metadata only; the schedule defines actual control-flow.
     */
    readonly branch: 'single' | 'branched';
    /**
     * Identity axis: whether this value is keyed to a stable identity.
     * This is metadata for composition and debugging (e.g., per-entity signals, per-point fields).
     */
    readonly identity: {
        readonly kind: 'none';
    } | {
        readonly kind: 'keyed';
        readonly keySpace: 'entity' | 'point' | 'pixel' | 'custom';
        readonly keyTag?: string;
    };
}
/**
 * ShapeDescIR - Value Payload Structure
 *
 * Shape is the value "payload" structure independent of domain/temporality.
 * Keep this small and predictable; express richer types via struct/array.
 */
export type ShapeDescIR = {
    readonly kind: 'bool';
} | {
    readonly kind: 'number';
} | {
    readonly kind: 'vec';
    readonly lanes: 2 | 3 | 4;
    readonly element: 'number';
} | {
    readonly kind: 'struct';
    readonly fields: readonly StructFieldIR[];
} | {
    readonly kind: 'array';
    readonly length: number;
    readonly element: ShapeDescIR;
} | {
    readonly kind: 'object';
    readonly class: string;
};
export interface StructFieldIR {
    readonly name: string;
    readonly shape: ShapeDescIR;
}
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
    /** Optional: maps steps to ports */
    readonly stepToPort?: ReadonlyMap<StepId, PortId>;
    /** Optional: combine provenance */
    readonly combines?: readonly CombineDebugIR[];
    /** Optional: legacy bus mapping (only if buses exist at editor level) */
    readonly busToValueRef?: ReadonlyMap<number, ValueSlot>;
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
    readonly portName: string;
    readonly direction: 'in' | 'out';
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
    readonly contributors: readonly ValueSlot[];
}
/**
 * ScheduleIR is left abstract here; runtime must execute steps that
 * evaluate expr tables into slots using slotMeta.offset addressing.
 */
export type ScheduleIR = unknown;
