/**
 * Compiled Program IR - Authoritative Schema
 *
 * This is the ONLY source of truth for the compiled program IR.
 *
 * Spec Reference: design-docs/IR-and-normalization-5-axes.md
 */

// Import canonical type surfaces used by the authoritative CompiledProgramIR schema.
import type { CanonicalType } from '../../core/canonical-types';
import type { ScheduleIR } from '../backend/schedule-program';
import type {
  InstanceId,
  ValueSlot,
  StepId,
  StepIndex,
  ValueExprId,
} from './Indices';
import type { BlockIndex } from './BlockIndex';
import type { BlockId } from '../../types/compiler';
import type { ValueExpr } from './value-expr';
import type { KernelRegistry } from '../../runtime/KernelRegistry';
import type { ArenaSlotDescriptor } from '../../runtime/ArenaValueStore';
import type { NagaLoweringProgramIR } from './naga-emitter';
import type { SerializableTopologyDef, TopologyId } from '../../shapes/types';

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


// =============================================================================
// Render Globals (Camera System)
// =============================================================================

/**
 * Camera Declaration IR
 *
 * Represents a Camera block's lowered output: 9 slots containing camera parameters.
 * The compiler enforces uniqueness (max 1 camera block per program).
 *
 * Spec Reference: design-docs/_new/3d/camera-v2/01-basics.md §3
 */
export interface CameraDeclIR {
  readonly kind: 'camera';
  readonly projectionSlot: ValueSlot;  // cameraProjection payload (0=ortho, 1=persp)
  readonly centerXSlot: ValueSlot;     // float unit=norm01
  readonly centerYSlot: ValueSlot;     // float unit=norm01
  readonly distanceSlot: ValueSlot;    // float unit=scalar
  readonly tiltDegSlot: ValueSlot;     // float unit=deg
  readonly yawDegSlot: ValueSlot;      // float unit=deg
  readonly fovYDegSlot: ValueSlot;     // float unit=deg
  readonly nearSlot: ValueSlot;        // float unit=scalar
  readonly farSlot: ValueSlot;         // float unit=scalar
}

// =============================================================================
// CompiledProgramIR - The Authoritative Contract
// =============================================================================

/**
 * CompiledProgramIR is the single canonical representation of a compiled program.
 *
 * Key Invariants:
 * - Dense execution table (no hash maps)
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

  // Unified ValueExpr table (authoritative execution nodes)
  readonly valueExprs: ValueExprTable;

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

  /**
   * Canonical runtime slot addressing records.
   * [LAW:one-source-of-truth] Runtime address resolution reads this table
   * instead of deriving from slotMeta/arenaLayout at execution time.
   */
  readonly runtimeSlots: readonly RuntimeSlotEntry[];

  /**
   * Precomputed runtime address table consumed directly by runtime execution.
   * [LAW:single-enforcer] Runtime address resolution has one owning boundary:
   * compiler-emitted runtimeAddressTable (no runtime derivation pass).
   */
  readonly runtimeAddressTable: RuntimeAddressTableIR;

  // Debug provenance
  readonly debugIndex: DebugIndexIR;

  /**
   * Field slot registry for demand-driven materialization.
   * Maps field output slots to their expression + instance, so the runtime
   * can materialize tracked fields on demand (for debug inspection).
   */
  readonly fieldSlotRegistry: ReadonlyMap<ValueSlot, FieldSlotEntry>;

  /**
   * Render Globals (Camera System)
   *
   * Data-driven declarations for render-global state (currently only camera).
   * Populated during compilation from render-global blocks (e.g., Camera block).
   *
   * Constraints:
   * - renderGlobals.length is 0 or 1 (enforced by compiler pass)
   * - If renderGlobals.length === 1, renderGlobals[0].kind === 'camera'
   * - When empty, runtime uses default camera per spec §6.2
   *
   * Spec Reference: design-docs/_new/3d/camera-v2/01-basics.md §3
   */
  readonly renderGlobals: readonly CameraDeclIR[];

  /**
   * Kernel Registry (Phase B: Kernel Registry Sprint)
   *
   * Registry of kernel implementations with handle-based dispatch.
   * All kernel references in valueExprs are pre-resolved to handles.
   *
   * Invariant: All PureFn nodes with kind='kernelResolved' have valid handles
   * into this registry. Missing kernels fail at program load (not runtime).
   *
   * The registry is immutable after program construction.
   */
  readonly kernelRegistry: KernelRegistry;

  /**
   * Compiler-owned topology table for every topology referenced by this program.
   *
   * [LAW:one-source-of-truth] Runtime/render topology resolution reads the
   * compiled program table, never the ambient mutable registry.
   */
  readonly topologyTable: ProgramTopologyTableIR;

  /**
   * Constant provenance map for fast-path value patching.
   * Maps user-facing port key ("blockId:portId") to patchable constant expr IDs.
   * Only present when the program contains patchable constant-backed ports.
   * Built during lowering (pass 6) from lowered graph topology.
   */
  readonly constantProvenance?: ConstantProvenanceMap;

  /**
   * Instance count provenance map for fast-path count patching.
   * Maps user-facing port key ("blockId:portId") to the instance whose count
   * that port controls. Only present when the program contains patchable
   * instance count ports (semantic: 'instanceCount').
   */
  readonly instanceCountProvenance?: InstanceCountProvenanceMap;

  /**
   * Compiler-owned runtime-live expression IDs for fast-path constant patching.
   *
   * [LAW:single-enforcer] Liveness/patchability ownership lives in compiler
   * metadata; runtime services consume this set and do not infer from schedule.
   */
  readonly runtimeLiveExprIds?: readonly number[];

  /**
   * Arena layout — flat Float32Array descriptor for every slot.
   * Indexed by slot ID (same ordering as slotMeta).
   *
   * [LAW:one-source-of-truth] Arena layout is computed once during compilation
   * from CanonicalType + InstanceDecl — no parallel derivation.
   */
  readonly arenaLayout: readonly ArenaSlotDescriptor[];

  /**
   * Compiler-owned arena zone contract for runtime/render consumption.
   *
   * [LAW:one-source-of-truth] Zone offsets/alignment are emitted once by the
   * compiler; runtime/render must consume this metadata rather than deriving
   * independent zone boundaries.
   */
  readonly arenaZones?: ArenaZonesIR;

  /**
   * Compiler-owned runtime bindings for arena state/gauge zones.
   *
   * [LAW:one-source-of-truth] Runtime state/gauge surfaces resolve through one
   * compiler-emitted layout contract instead of ad-hoc runtime offsets.
   */
  readonly arenaRuntimeLayout?: ArenaRuntimeLayoutIR;

  /**
   * Sum of canonical slot descriptor lengths across `arenaLayout`.
   *
   * [LAW:one-source-of-truth] Payload capacity is emitted once by compiler
   * zone planning and used for descriptor-sum invariant checks.
   */
  readonly arenaPayloadFloats: number;

  /**
   * Total number of floats in the arena buffer, as computed by the arena zone
   * plan (`totalFloats`). Includes header reservation and scalar->field
   * alignment padding and state/gauge zones.
   */
  readonly arenaTotalFloats: number;

  /**
   * Draw-prep metadata for indirect rendering sinks.
   *
   * [LAW:one-source-of-truth] Compiler owns the canonical sink ordering and
   * instance-count mode contract consumed by draw-prep execution.
   */
  readonly drawPrepProgram: DrawPrepProgramIR;

  /**
   * Compiler-owned metadata used by the Naga compile boundary.
   * WGSL emission remains in the Rust/WASM serializer boundary.
   */
  readonly generatedComputeProgram: GeneratedComputeProgramIR;

  /**
   * Compiler-owned GPU pass manifest describing installable runtime passes.
   *
   * [LAW:one-source-of-truth] Runtime pass identity/order metadata is emitted
   * once by compile output and consumed by worker transport/renderer install.
   */
  readonly generatedGpuArtifactManifest?: GeneratedGpuArtifactManifestIR;

  /**
   * Compiler-generated typed Naga lowering artifact (P2-2).
   * Contains the structured module and expr/statement source-map provenance.
   */
  readonly nagaLoweringProgram: NagaLoweringProgramIR;
}

export interface ProgramTopologyTableIR {
  readonly definitions: readonly SerializableTopologyDef[];
  readonly definitionIndexById: ReadonlyMap<TopologyId, number>;
}

export interface GpuPassManifestEntryIR {
  readonly passId: string;
  readonly stage: 'compute';
  readonly entryPoint: string;
}

export interface GeneratedGpuArtifactManifestIR {
  readonly schemaVersion: 1;
  readonly passes: readonly GpuPassManifestEntryIR[];
}

// =============================================================================
// Constant Provenance (Fast-Path Patching)
// =============================================================================

/**
 * Entry in the constant provenance map.
 * Maps a user-facing port to the ValueExprConst nodes that carry its value.
 * Multi-component payloads (vec2, color) have multiple component expr IDs.
 */
export interface ConstantProvenanceEntry {
  readonly componentExprIds: readonly ValueExprId[];
  readonly payloadKind: string;
}

/**
 * Maps user-facing port key ("blockId:portId") to patchable constant expr IDs.
 * Built during lowering from lowered graph topology.
 */
export type ConstantProvenanceMap = ReadonlyMap<string, ConstantProvenanceEntry>;

// =============================================================================
// Instance Count Provenance (Fast-Path Instance Count Patching)
// =============================================================================

/**
 * Entry in the instance count provenance map.
 * Maps a user-facing port to the instance whose count it controls.
 */
export interface InstanceCountProvenanceEntry {
  readonly instanceId: import('./Indices').InstanceId;
}

/**
 * Maps user-facing port key ("blockId:portId") to patchable instance count.
 * Built during lowering for ports with `semantic: 'instanceCount'`.
 */
export type InstanceCountProvenanceMap = ReadonlyMap<string, InstanceCountProvenanceEntry>;

/**
 * Entry in the field slot registry.
 * Provides everything needed to materialize a field on demand.
 */
export interface FieldSlotEntry {
  /** ValueExprId of a field-extent expression */
  readonly fieldId: ValueExprId;
  readonly instanceId: InstanceId;
}

// =============================================================================
// Schedule IR
// =============================================================================

// ScheduleIR is imported from pass7-schedule.ts and used above
// Re-export for convenience
export type { ScheduleIR } from '../backend/schedule-program';

// =============================================================================
// Execution Tables
// =============================================================================

/**
 * Dense, cache-friendly unified execution table.
 *
 * This is the ONLY execution-node table in the runtime. All evaluation dispatch
 * (one/many/event) is derived from `ValueExpr.type.extent`.
 */
export interface ValueExprTable {
  /** Unified value expression nodes (all one/many/event expressions) */
  readonly nodes: readonly ValueExpr[];
}

// =============================================================================
// Outputs Contract
// =============================================================================

/**
 * Output Specification
 *
 * Defines how runtime extracts the final frame output.
 * Runtime uses output kind as the extraction contract.
 */
export interface OutputSpecIR {
  /** Only allowed kind for now */
  readonly kind: 'renderFrame';
}

export interface DrawPrepSinkIR {
  /** Sequential sink index in render schedule order */
  readonly sinkIndex: number;
  /** Source render step index from schedule.steps */
  readonly renderStepIndex: number;
  /** Runtime instance identity for this sink */
  readonly instanceId: InstanceId;
  /** Indirect args record index written for this sink */
  readonly indirectRecordIndex: number;
  /** Whether instance count is static or dynamic for this sink */
  readonly instanceCountMode: 'static' | 'dynamic';
  /** Present only when instanceCountMode==='static' */
  readonly staticInstanceCount?: number;
  /**
   * Canonical indirect command mode for this sink record.
   *
   * [LAW:one-source-of-truth] Draw mode is compiler-owned metadata; runtime
   * draws from this contract rather than deriving mixed-mode semantics ad hoc.
   */
  readonly drawMode: 'indexed' | 'nonIndexed';
  /**
   * Indirect command region in the shared indirect buffer.
   */
  readonly indirectRegion: 'indexed' | 'nonIndexed';
  /**
   * Hardware ABI stride for this sink's command records.
   * - indexed: 20 bytes (`drawIndexedIndirect`)
   * - nonIndexed: 16 bytes (`drawIndirect`)
   */
  readonly indirectStrideBytes: 20 | 16;
  /**
   * Source authority for topology fields consumed by draw-prep.
   * Current sink contracts read topology counts/offsets from ShapeHeaderV1.
   */
  readonly topologySource: 'shapeHeaderV1';
  /**
   * Source authority for firstInstance field.
   * Runtime packed draw plan currently owns firstInstance values.
   */
  readonly firstInstanceSource: 'runtimePacked';
  /**
   * Indexed command defaults (used when drawMode==='indexed').
   */
  readonly indexedFirstIndex?: number;
  readonly indexedBaseVertex?: number;
  /**
   * Non-indexed command defaults (used when drawMode==='nonIndexed').
   */
  readonly nonIndexedFirstVertex?: number;
}

export interface DrawPrepProgramIR {
  /**
   * Total sink records emitted by the compiler draw-prep contract.
   *
   * [LAW:one-source-of-truth] Runtime/worker capacity validation reads this
   * static count from the compiler contract instead of re-deriving it.
   */
  readonly totalRecordCount: number;
  /**
   * Indexed stream region metadata (words in the shared indirect buffer).
   */
  readonly indexedRecordCount: number;
  readonly indexedRegionBaseWords: number;
  readonly indexedStrideWords: 5;
  /**
   * Non-indexed stream region metadata (words in the shared indirect buffer).
   */
  readonly nonIndexedRecordCount: number;
  readonly nonIndexedRegionBaseWords: number;
  readonly nonIndexedStrideWords: 4;
  readonly sinks: readonly DrawPrepSinkIR[];
}

export interface GeneratedComputeProgramIR {
  /**
   * Validated WGSL payload emitted by Naga. This is intentionally absent prior
   * to the validation/emission boundary.
   */
  readonly wgsl?: string;
  /**
   * Canonical lane bound for compute entry guard generation.
   */
  readonly maxActiveLanes: number;
  readonly offsetConstants: ReadonlyMap<ValueSlot, string>;
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

  /**
   * Physical storage class for metadata/debug consumers.
   * [LAW:one-source-of-truth] Slot metadata mirrors canonical runtime ABI
   * vocabulary only; legacy f64/object labels are not part of this contract.
   */
  readonly storage: 'f32' | 'i32' | 'u32';

  /**
   * REQUIRED: absolute offset into the backing store for this storage class.
   * Offsets are per-storage (not global) and stable-ordered (slotId ascending). offset is the START lane for this slot; the slot occupies [offset, offset+stride).
   */
  readonly offset: number;

  /**
   * REQUIRED: number of consecutive scalar lanes for this logical slot.
   * The slot occupies `stride` adjacent entries starting at `offset` in the selected storage.
   * For scalar payloads this is 1. For e.g. color RGBA this is 4.
   */
  readonly stride: number;

  /**
   * REQUIRED: Canonical type (5-axis CanonicalType).
   * This is the compiler-authoritative type including all semantic axes.
   * Runtime uses this for type assertions and validation in debug mode.
   */
  readonly type: CanonicalType;

  /** Optional debug label */
  readonly debugName?: string;
}

/**
 * Runtime slot addressing entry.
 *
 * Carries all data runtime execution needs for slot resolution in one record.
 */
export interface RuntimeSlotEntry {
  readonly slot: ValueSlot;
  /**
   * Canonical runtime ABI storage vocabulary.
   * [LAW:one-source-of-truth] Runtime hot path resolves addresses from this
   * canonical set only (no legacy f64/object labels).
   */
  readonly storage: 'f32' | 'i32' | 'u32';
  readonly offset: number;
  readonly stride: number;
  readonly type: CanonicalType;
  readonly arena: ArenaSlotDescriptor;
}

/**
 * Runtime slot lookup entry consumed by execution/debug readers.
 */
export interface RuntimeSlotLookupEntry {
  /**
   * Canonical runtime ABI storage vocabulary.
   * [LAW:one-source-of-truth] Runtime lookup contracts must not expose legacy
   * f64/object storage labels.
   */
  readonly storage: 'f32' | 'i32' | 'u32';
  readonly offset: number;
  readonly stride: number;
  readonly slot: ValueSlot;
  readonly type: CanonicalType;
  /** Canonical runtime arena descriptor for this slot. */
  readonly arena: ArenaSlotDescriptor;
}

export interface RuntimeScalarArenaAddress {
  readonly slot: ValueSlot;
  readonly arena: ArenaSlotDescriptor;
  /** Reserved for future multi-component one-value addressing. */
  readonly component: number;
}

/**
 * Compiler-emitted runtime address table contract.
 */
export interface RuntimeAddressTableIR {
  /** ValueSlot → physical storage lookup */
  readonly slotLookup: ReadonlyMap<ValueSlot, RuntimeSlotLookupEntry>;
  /** ValueExprId (materialized field expression) → target ValueSlot */
  readonly fieldExprToSlot: ReadonlyMap<number, ValueSlot>;
  /** Scalar ValueExprId → canonical arena address metadata */
  readonly scalarExprToArenaAddress: ReadonlyMap<number, RuntimeScalarArenaAddress>;
  /** ValueSlot → arena descriptor */
  readonly slotToArena: ReadonlyMap<ValueSlot, ArenaSlotDescriptor>;
}

// =============================================================================
// Arena Zones (Compiler-Owned Memory Contract)
// =============================================================================

export type ArenaZoneKind = 'header' | 'scalar' | 'field' | 'state' | 'gauge';

export interface ArenaZoneAlignmentPolicyIR {
  /**
   * Fixed header size in floats (64 floats = 256 bytes).
   * This reserves CPU->GPU global input marshalling space.
   */
  readonly headerFloats: number;
  /**
   * Alignment boundary (in floats) for the scalar->field zone transition.
   */
  readonly scalarToFieldAlignFloats: number;
}

export interface ArenaZoneRangeIR {
  readonly kind: ArenaZoneKind;
  readonly start: number;
  readonly end: number;
  readonly length: number;
  readonly slotCount: number;
  /**
   * Alignment boundary applied when placing this zone. Header alignment is
   * represented by its fixed size.
   */
  readonly alignmentFloats: number;
}

export interface ArenaZonesIR {
  readonly alignment: ArenaZoneAlignmentPolicyIR;
  readonly zones: readonly ArenaZoneRangeIR[];
  /**
   * Sum of canonical slot descriptor lengths (scalar + field payloads).
   * Excludes header/alignment/state/gauge zone overhead.
   */
  readonly payloadFloats: number;
  readonly totalFloats: number;
}

export interface ArenaStateBankLayoutIR {
  /** State zone start offset in arena floats. */
  readonly offset: number;
  /** Total state zone length in floats (read + write banks). */
  readonly length: number;
  /** Floats per state bank. */
  readonly bankLength: number;
  /** Active read-bank offset in arena floats. */
  readonly readOffset: number;
  /** Active write-bank offset in arena floats. */
  readonly writeOffset: number;
}

export interface ArenaGaugeTargetLayoutIR {
  /** Stable continuity target ID (`StepContinuityApply.targetKey`). */
  readonly targetId: string;
  /** Instance owner for continuity/prune bookkeeping. */
  readonly instanceId: string;
  /** Arena descriptor for this target's gauge zone slice. */
  readonly descriptor: ArenaSlotDescriptor;
}

export interface ArenaRuntimeLayoutIR {
  /** Persistent state bank views inside the arena state zone. */
  readonly stateBank: ArenaStateBankLayoutIR;
  /** Gauge-zone descriptors for continuity targets. */
  readonly gaugeTargets: readonly ArenaGaugeTargetLayoutIR[];
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
  | { readonly kind: 'object'; readonly class: string }
  | { readonly kind: 'shape' }; // Shape handle descriptor (topology + params)

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
  /** Maps step indices to source block indices */
  readonly stepToBlock: ReadonlyMap<StepIndex, BlockIndex>;

  /** Maps slots to source block indices */
  readonly slotToBlock: ReadonlyMap<ValueSlot, BlockIndex>;

  /** Maps value expression IDs to emitting string BlockId values (patch identity) */
  readonly exprToBlock: ReadonlyMap<ValueExprId, BlockId>;

  /** Port binding metadata keyed by DebugPortId */
  readonly ports: readonly PortBindingIR[];

  /** Maps slots to debug port indices */
  readonly slotToPort: ReadonlyMap<ValueSlot, DebugPortId>;

  /**
   * Maps debug BlockIndex values to canonical string BlockId patch IDs.
   * Required because runtime debug mappings are index-based while patch identity is string-based.
   */
  readonly blockMap: ReadonlyMap<BlockIndex, string>;

  /** Maps block indices to user-facing display names (e.g., "Golden Spiral") */
  readonly blockDisplayNames?: ReadonlyMap<BlockIndex, string>;

  /** Optional: maps step indices to debug port indices */
  readonly stepToPort?: ReadonlyMap<StepIndex, DebugPortId>;

  /** Optional: combine provenance */
  readonly combines?: readonly CombineDebugIR[];

  /** Optional: general labels for debugging */
  readonly labels?: ReadonlyMap<string, string>;

  /** Optional: expression provenance — maps each expr to its source block and output port */
  readonly exprProvenance?: ReadonlyMap<ValueExprId, ExprProvenanceIR>;
}

// =============================================================================
// Expression Provenance
// =============================================================================

/**
 * Provenance for a single value expression — which block emitted it and
 * which output port it represents.
 */
export interface ExprProvenanceIR {
  readonly blockId: BlockId;
  readonly portName: string | null;
}

/**
 * Port Binding - Slot/Step to Port Mapping
 *
 * Enables "click value → see port" debugging.
 */
export interface PortBindingIR {
  readonly port: DebugPortId;
  readonly block: BlockIndex;

  /** Stable identifiers for UI and logs */
  readonly portName: string; // "in.color", "out.field", etc.
  readonly direction: 'in' | 'out';

  // [LAW:one-source-of-truth] Port debug classification mirrors canonical extent axes directly.
  readonly cardinality: 'zero' | 'one' | 'many';
  readonly temporality: 'continuous' | 'discrete';

  /** Why does this value exist? */
  readonly role: 'userWire' | 'implicitCoerce' | 'internalHelper';
}

export type DebugPortId = number & { readonly __brand: 'DebugPortId' };

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

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Canonical runtime storage size map.
 */
export interface RuntimeStorageSizes {
  f32: number;
  i32: number;
  u32: number;
}

type StorageExtentEntry = {
  readonly storage: RuntimeSlotEntry['storage'];
  readonly offset: number;
  readonly stride: number;
};

function accumulateStorageSizes(entries: readonly StorageExtentEntry[]): RuntimeStorageSizes {
  const sizes: RuntimeStorageSizes = {
    f32: 0,
    i32: 0,
    u32: 0,
  };
  for (const entry of entries) {
    const requiredSize = entry.offset + entry.stride;
    if (requiredSize > sizes[entry.storage]) {
      sizes[entry.storage] = requiredSize;
    }
  }
  return sizes;
}

/**
 * Compute required storage sizes from runtime slot metadata.
 *
 * Returns the number of cells needed for each storage class.
 * Use these values to create properly-sized runtime state buffers.
 *
 * @param runtimeSlots - Canonical runtime slots from compiled program
 * @returns Object with storage size for each class
 *
 * @example
 * const sizes = computeRuntimeStorageSizes(program.runtimeSlots);
 * const state = createRuntimeState(sizes.f32);
 */
export function computeRuntimeStorageSizes(runtimeSlots: readonly RuntimeSlotEntry[]): RuntimeStorageSizes {
  return accumulateStorageSizes(runtimeSlots);
}
