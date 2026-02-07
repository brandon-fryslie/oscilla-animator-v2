/**
 * Block Registry
 *
 * THE ONE AND ONLY block registry.
 * All blocks are defined here with both metadata and IR lowering.
 */

import type { CanonicalType, PayloadType } from '../core/canonical-types';
import { FLOAT, INT, BOOL, VEC2, VEC3, COLOR, CAMERA_PROJECTION, payloadsEqual } from '../core/canonical-types';
import type { InferenceCanonicalType, InferencePayloadType } from '../core/inference-types';
import { isPayloadVar } from '../core/inference-types';
import type { UIControlHint, DefaultSource } from '../types';
import type { BlockIRBuilder } from '../compiler/ir/BlockIRBuilder';
import type { BlockIndex } from '../graph/normalize';
import type { InstanceId, StateSlotId } from '../compiler/ir/Indices';
import type { VarargConnection } from '../graph/Patch';
import type { AdapterBlockSpec } from './adapter-spec';
import type { DomainTypeId } from '../core/domain-registry';

// Re-export lowering types from compiler
export type { ValueRefPacked, ValueRefExpr, LowerEffects } from '../compiler/ir/lowerTypes';

/**
 * Lower context - provided to block lower functions.
 *
 * IMPORTANT: Uses BlockIRBuilder (pure surface) not OrchestratorIRBuilder.
 * Blocks cannot allocate slots or emit schedule steps directly.
 */
export interface LowerCtx {
  readonly blockIdx: BlockIndex;
  readonly blockType: string;
  readonly instanceId: string;
  readonly label?: string;
  readonly inTypes: readonly CanonicalType[];
  readonly outTypes: readonly CanonicalType[];
  readonly b: BlockIRBuilder;
  readonly seedConstId: number;

  /**
   * Instance context
   * Set by instance blocks (Array, etc.) to provide instance context to downstream blocks.
   */
  readonly instance?: InstanceId;

  /**
   * Inferred instance context
   * Automatically inferred from connected field inputs during lowering.
   */
  readonly inferredInstance?: InstanceId;

  /**
   * Vararg connections metadata.
   * Map from vararg port ID to array of VarargConnection in sortKey order.
   * Used by blocks with vararg inputs to access connection aliases and source addresses.
   */
  readonly varargConnections?: ReadonlyMap<string, readonly VarargConnection[]>;

  /**
   * Address registry for resolving canonical addresses.
   * Available for blocks that need address resolution (e.g., Expression block).
   */
  readonly addressRegistry?: import('../graph/address-registry').AddressRegistry;

  /**
   * Read-only instance registry.
   * Allows blocks to query instance declarations without accessing the builder.
   * This keeps BlockIRBuilder focused on expression construction only.
   */
  readonly instances: ReadonlyMap<import('../compiler/ir/Indices').InstanceId, import('../compiler/ir/types').InstanceDecl>;
}

/**
 * Lower args - arguments to a block's lower function.
 */
export interface LowerArgs {
  readonly ctx: LowerCtx;
  readonly inputs: readonly import('../compiler/ir/lowerTypes').ValueRefExpr[];
  readonly inputsById: Record<string, import('../compiler/ir/lowerTypes').ValueRefExpr>;
  /**
   * Vararg inputs - array of values per vararg port.
   * Only populated for blocks with vararg inputs.
   * Key is port ID, value is array of ValueRefExpr in sortKey order.
   */
  readonly varargInputsById?: Record<string, readonly import('../compiler/ir/lowerTypes').ValueRefExpr[]>;
  readonly config?: Readonly<Record<string, unknown>>;
  /** The source block (for reading port defaultSource values at compile time) */
  readonly block?: import('../graph/Patch').Block;
  /**
   * Existing outputs from phase 1 (lowerOutputsOnly).
   * Only populated when called as phase 2 of two-pass lowering.
   */
  readonly existingOutputs?: Partial<LowerResult>;
}

/**
 * Lower result - output of a block's lower function.
 */
export interface LowerResult {
  /** Map of port ID to ValueRef (required) */
  readonly outputsById: Record<string, import('../compiler/ir/lowerTypes').ValueRefExpr>;

  /**
   * Instance context (optional).
   * Set by blocks that create instances (e.g., Array) to provide instance context
   * to downstream blocks that need it (e.g., GridLayout, RenderInstances2D).
   */
  readonly instanceContext?: InstanceId;

  /**
   * State slot ID allocated in phase 1 (lowerOutputsOnly).
   * Passed to phase 2 to ensure consistent state slot allocation.
   */
  readonly stateSlot?: StateSlotId;

  /**
   * Declarative effects (optional).
   * Blocks return effects (state declarations, step requests, slot requests) instead
   * of calling imperative methods on IRBuilder. Optional during migration.
   */
  readonly effects?: import('../compiler/ir/lowerTypes').LowerEffects;
}

// =============================================================================
// Block Definition Types
// =============================================================================

/**
 * Block form determines compilation behavior.
 *
 * - 'primitive': Atomic block with a lower() function
 * - 'macro': Expands into multiple blocks (future use)
 * - 'composite': Contains an internal graph, expands during normalization
 */
export type BlockForm = 'primitive' | 'macro' | 'composite';

/**
 * Capability determines what special authorities a block has.
 */
export type Capability = 'time' | 'identity' | 'state' | 'render' | 'io' | 'pure';

/**
 * Lowering purity classification.
 *
 * Determines whether a block's lower() function can be invoked as a pure macro
 * during lowering of other blocks (e.g., DefaultSource).
 *
 * - 'pure': Block lower() is pure (deterministic, no side effects, no slot allocation).
 *           Can be invoked via LowerSandbox. The orchestrator allocates slots on behalf
 *           of pure blocks after lowering completes.
 * - undefined/absent: Block is impure (allocates slots directly, may have side effects).
 *                     Cannot be invoked via LowerSandbox. Existing blocks default to this.
 *
 * Note: This field controls macro expansion capability only. It does NOT affect
 * the block's semantics or runtime behavior.
 */
export type LoweringPurity = 'pure' | 'stateful' | 'impure';

// =============================================================================
// Lane Topology (Final Normalization Fixpoint - future use)
// =============================================================================

/**
 * How lanes relate to each other within a group.
 *
 * - 'allEqual': all lanes in the group must have the same cardinality
 * - 'zipBroadcast': lanes can be zipped (field+signal mixing allowed)
 * - 'reducible': lanes can be reduced (many→one)
 * - 'broadcastOnly': only broadcast (one→many) is allowed
 * - custom: named custom relation for domain-specific blocks
 */
export type LaneRelation =
  | 'allEqual'
  | 'zipBroadcast'
  | 'reducible'
  | 'broadcastOnly'
  | { readonly kind: 'custom'; readonly name: string };

/**
 * Direction of cardinality constraint flow within a lane group.
 *
 * - 'bidirectional': constraints flow both ways (all ports constrain each other)
 * - 'inputToOutput': input cardinality determines output cardinality
 * - 'outputToInput': output cardinality determines input cardinality
 */
export type LaneDirectionality = 'bidirectional' | 'inputToOutput' | 'outputToInput';

/**
 * A group of ports whose cardinalities are related.
 */
export interface LaneGroup {
  readonly id: string;
  readonly members: readonly string[];
  readonly relation: LaneRelation;
  readonly directionality?: LaneDirectionality;
}

/**
 * Lane topology for a block — describes how port cardinalities relate.
 * When present, this is authoritative for constraint extraction.
 * When absent, fall back to legacy BlockCardinalityMetadata.
 */
export interface BlockLaneTopology {
  readonly groups: readonly LaneGroup[];
}

// =============================================================================
// Cardinality-Generic Block Metadata (Spec §8)
// =============================================================================

/**
 * How this block affects cardinality.
 *
 * - 'preserve': Cardinality-generic (output cardinality == input cardinality)
 * - 'transform': Explicitly changes cardinality (e.g., reduce, gather)
 * - 'signalOnly': Only valid for Signal (one) inputs
 * - 'fieldOnly': Only valid for Field (many) inputs
 */
export type CardinalityMode = 'preserve' | 'transform' | 'signalOnly' | 'fieldOnly';

/**
 * Whether block couples across lanes.
 *
 * - 'laneLocal': out[i] depends only on in[i] - eligible for cardinality-generic
 * - 'laneCoupled': out[i] depends on in[j≠i] - NOT eligible (blur, boids, etc.)
 */
export type LaneCoupling = 'laneLocal' | 'laneCoupled';

/**
 * How Signal+Field mixing is handled.
 *
 * - 'allowZipSig': Signals may be consumed alongside fields via KernelZipSig (field + signals)
 * - 'requireBroadcastExpr': Compiler must materialize Broadcast kernel explicitly
 * - 'disallowSignalMix': Only all-field or all-signal instantiations allowed
 */
export type BroadcastPolicy = 'allowZipSig' | 'requireBroadcastExpr' | 'disallowSignalMix';

/**
 * Cardinality metadata for compile-time specialization.
 * This metadata is compile-time only and does not exist at runtime.
 *
 * Discriminated union on cardinalityMode:
 * - 'transform' blocks MUST declare a domainType (instance-creating transforms like Array)
 * - Other modes CANNOT declare a domainType
 *
 * Spec Reference: .agent_planning/_future/0-CardinalityGeneric-Block-Type-Spec.md §8
 */
export type BlockCardinalityMetadata =
  | {
      readonly cardinalityMode: 'transform';
      readonly laneCoupling: LaneCoupling;
      readonly broadcastPolicy: BroadcastPolicy;
      readonly domainType: DomainTypeId;  // REQUIRED for transform blocks
    }
  | {
      readonly cardinalityMode: 'preserve' | 'signalOnly' | 'fieldOnly';
      readonly laneCoupling: LaneCoupling;
      readonly broadcastPolicy: BroadcastPolicy;
      readonly domainType?: never;  // IMPOSSIBLE for non-transform blocks
    };

// =============================================================================
// Payload-Generic Block Metadata (Spec §8)
// =============================================================================

/**
 * Semantics category for payload-generic blocks.
 *
 * - 'componentwise': Apply same scalar operator per component (vec3 = vec3(x1+x2, y1+y2, z1+z2))
 * - 'typeSpecific': Defined explicitly per payload via combination table
 */
export type PayloadSemantics = 'componentwise' | 'typeSpecific';

/**
 * Implementation reference for a payload combination.
 *
 * - opcode: Use a specific OpCode (preferred for primitives)
 * - kernel: Use a named kernel implementation
 * - composed: Use a sequence of opcodes
 */
export type PayloadImplRef =
  | { kind: 'opcode'; opcode: string }
  | { kind: 'kernel'; name: string }
  | { kind: 'composed'; opcodes: readonly string[] };

/**
 * A single payload combination rule for multi-input blocks.
 * Defines what input payload tuple produces what output, and how.
 */
export interface PayloadCombination {
  /** Input payload types (tuple for multi-input, single for unary) */
  readonly inputs: readonly PayloadType[];
  /** Output payload type */
  readonly output: PayloadType;
  /** Implementation to use for this combination */
  readonly impl?: PayloadImplRef;
}

/**
 * Payload metadata for compile-time specialization.
 * This metadata is compile-time only and does not exist at runtime.
 *
 * Spec Reference: .agent_planning/_future/0-PayloadGeneriic-Block-Type-Spec.md §8
 */
export interface BlockPayloadMetadata {
  /** Allowed payload types per port (key = port name) */
  readonly allowedPayloads: Record<string, readonly PayloadType[]>;
  /** Valid input->output combinations (for type validation) */
  readonly combinations?: readonly PayloadCombination[];
  /** How this block interprets payloads */
  readonly semantics: PayloadSemantics;
}

/**
 * Default payload metadata for blocks without explicit constraints.
 * All concrete payload types are allowed, componentwise semantics.
 */
export const DEFAULT_PAYLOAD_METADATA: BlockPayloadMetadata = {
  allowedPayloads: {},
  semantics: 'componentwise',
};

/**
 * Standard allowed payloads for common block patterns.
 */
export const STANDARD_NUMERIC_PAYLOADS: readonly PayloadType[] = [FLOAT, INT, VEC2, COLOR];
export const STANDARD_SCALAR_PAYLOADS: readonly PayloadType[] = [FLOAT, INT, BOOL];
export const STANDARD_VECTOR_PAYLOADS: readonly PayloadType[] = [VEC2];
export const STANDARD_COLOR_PAYLOADS: readonly PayloadType[] = [COLOR];
/** All concrete payload types */
export const ALL_CONCRETE_PAYLOADS: readonly PayloadType[] = [
  FLOAT,
  INT,
  BOOL,
  VEC2,
  VEC3,
  COLOR,
  CAMERA_PROJECTION,
];

// =============================================================================
// Varargs Support
// =============================================================================

/**
 * Constraint for a varargs input.
 * Defines type and cardinality requirements for variable-length inputs.
 */
export interface VarargConstraint {
  /** Allowed payload types for vararg connections (e.g., [FLOAT] or [FLOAT, VEC3, COLOR]) */
  readonly allowedPayloads: readonly PayloadType[];
  /** Required cardinality constraint: 'signal', 'field', or 'any' */
  readonly cardinalityConstraint: 'signal' | 'field' | 'any';
  /** Minimum number of connections (default: 0) */
  readonly minConnections?: number;
  /** Maximum number of connections (default: unlimited) */
  readonly maxConnections?: number;
}

/**
 * Input definition for a block.
 *
 * UNIFIED DESIGN (2026-01-20):
 * - Both wirable ports AND config-only parameters use this type
 * - `exposedAsPort` distinguishes between ports (true) and config (false)
 * - Object key (in BlockDef.inputs Record) is the identifier
 *
 * VARARGS EXTENSION (2026-01-26):
 * - `isVararg` flag marks inputs that accept variable-length connections
 * - Varargs inputs bypass the normal combine system
 * - Varargs inputs have no defaultSource (explicit connections only)
 *
 * TYPE SYSTEM (2026-01-29):
 * - Uses InferenceCanonicalType to allow payload/unit vars in block definitions
 * - Vars are resolved during type inference, then finalized to CanonicalType
 */
export interface InputDef {
  readonly label?: string;           // Display label (defaults to key name)
  readonly type: InferenceCanonicalType; // Required - all inputs have a type (may contain vars)
  readonly defaultValue?: unknown;   // Default value for auto-generated Const default source
  readonly defaultSource?: DefaultSource;
  readonly uiHint?: UIControlHint;
  readonly exposedAsPort?: boolean;  // Default: true (backward compat)
  readonly optional?: boolean;       // For ports: optional wiring?
  readonly hidden?: boolean;         // Hide from UI (normalizer params)

  /**
   * Varargs flag - marks this input as accepting variable-length connections.
   * Varargs inputs:
   * - Accept 0..N connections without combining them
   * - Receive connections as an array in LowerArgs.varargInputsById
   * - Bypass the normal combine system
   * - Cannot have a defaultSource (explicit connections only)
   */
  /**
   * Port semantic — declares the compile-time role of this input.
   *
   * - 'instanceCount': This port controls the instance count of a cardinality-transform block.
   *   Used by the provenance builder to determine which ports are eligible for
   *   fast-path instance count patching (no full recompile needed).
   */
  readonly semantic?: 'instanceCount';

  readonly isVararg?: boolean;

  /**
   * Varargs constraint - type and cardinality requirements.
   * Required if isVararg is true.
   */
  readonly varargConstraint?: VarargConstraint;
}

/**
 * Type guard to check if an InputDef is a vararg input.
 */
export function isVarargInput(def: InputDef): boolean {
  return def.isVararg === true;
}

/**
 * Output definition for a block.
 *
 * UNIFIED DESIGN (2026-01-20):
 * - Now a Record for symmetry with inputs
 * - Object key (in BlockDef.outputs Record) is the identifier
 *
 * TYPE SYSTEM (2026-01-29):
 * - Uses InferenceCanonicalType to allow payload/unit vars in block definitions
 * - Vars are resolved during type inference, then finalized to CanonicalType
 */
export interface OutputDef {
  readonly label?: string;           // Display label (defaults to key name)
  readonly type: InferenceCanonicalType; // Required (may contain vars)
  readonly hidden?: boolean;         // For symmetry
}

/**
 * Block definition - the ONE AND ONLY definition type.
 * Contains both UI metadata and IR lowering.
 */
export interface BlockDef {
  // Identity
  readonly type: string;

  // UI metadata
  readonly label: string;
  readonly category: string;
  readonly description?: string;

  // Compilation metadata
  readonly form: BlockForm;
  readonly capability: Capability;

  /**
   * Whether this block has state that breaks combinatorial cycles.
   * Used by SCC (cycle validation) pass to determine if a cycle is legal.
   *
   * - true: Block has memory/state (State, Delay, etc.) - allows cycles
   * - false/undefined: Block is combinatorial - cycles through it are illegal
   */
  readonly isStateful?: boolean;

  /**
   * Lowering purity classification.
   *
   * Determines whether a block's lower() function can be invoked as a pure macro
   * during lowering of other blocks (e.g., DefaultSource).
   *
   * - 'pure': Block lower() is pure (deterministic, no side effects, no slot allocation).
   *           Can be invoked via LowerSandbox. The orchestrator allocates slots on behalf
   *           of pure blocks after lowering completes.
   * - undefined/absent: Block is impure (allocates slots directly, may have side effects).
   *                     Cannot be invoked via LowerSandbox. Existing blocks default to this.
   *
   * Note: This field controls macro expansion capability only. It does NOT affect
   * the block's semantics or runtime behavior.
   */
  readonly loweringPurity?: LoweringPurity;

  /**
   * Cardinality metadata for cardinality-generic blocks.
   * Required for blocks that can work with both Signal and Field cardinalities.
   * If omitted, block is treated as having fixed cardinality based on port types.
   *
   * Spec Reference: .agent_planning/_future/0-CardinalityGeneric-Block-Type-Spec.md §8
   */
  readonly cardinality?: BlockCardinalityMetadata;

  /**
   * Payload metadata for payload-generic blocks.
   * Defines allowed payload types per port and valid combinations.
   * If omitted, block accepts any payload that type-checks.
   *
   * Spec Reference: .agent_planning/_future/0-PayloadGeneriic-Block-Type-Spec.md §8
   */
  readonly payload?: BlockPayloadMetadata;

  /**
   * Lane topology — describes how port cardinalities relate.
   * When present, authoritative for constraint extraction during the
   * normalization fixpoint. When absent, fall back to legacy
   * BlockCardinalityMetadata for backward compatibility.
   *
   * New blocks should declare laneTopology; existing blocks use fallback.
   */
  readonly laneTopology?: BlockLaneTopology;

  /**
   * Adapter type conversion spec. Present only on adapter/lens blocks.
   * Defines the type conversion pattern for this adapter.
   *
   * Moved from graph/adapters.ts (2026-02-01).
   * Each adapter block self-declares its conversion pattern here.
   */
  readonly adapterSpec?: AdapterBlockSpec;

  // Port definitions (UNIFIED DESIGN 2026-01-20)
  readonly inputs: Record<string, InputDef>;
  readonly outputs: Record<string, OutputDef>;

  // IR lowering function
  readonly lower: (args: LowerArgs) => LowerResult;

  /**
   * Phase 1 lowering function for stateful blocks in feedback loops.
   *
   * This function generates ONLY the outputs (reading from state) without requiring
   * inputs to be resolved. Used in two-pass lowering for non-trivial SCCs.
   *
   * Phase 1 responsibilities:
   * - Allocate state slot(s)
   * - Generate output ValueRefs (reading from previous frame's state)
   * - Return outputs and state slot ID for phase 2
   *
   * Phase 2 (normal lower() function) responsibilities:
   * - Reuse state slot from phase 1
   * - Generate state write steps using resolved inputs
   * - Return same outputs as phase 1
   *
   * Only required for stateful blocks where output does NOT depend on input
   * within the same frame (e.g., UnitDelay, SampleAndHold).
   *
   * Blocks like Lag and Phasor where output depends on input within-frame
   * do NOT benefit from this and should omit it.
   */
  readonly lowerOutputsOnly?: (args: { ctx: LowerCtx; config: Record<string, unknown> }) => Partial<LowerResult>;

  // Optional tags
  readonly tags?: {
    readonly irPortContract?: 'strict' | 'relaxed';
  };
}

/**
 * Type guard to check if a block definition has lowerOutputsOnly.
 */
export function hasLowerOutputsOnly(blockDef: BlockDef): boolean {
  return blockDef.lowerOutputsOnly !== undefined;
}

// =============================================================================
// Registry
// =============================================================================

const registry = new Map<string, BlockDef>();

/**
 * Block definitions indexed by type.
 * Exported for direct access by compiler passes.
 */
export const BLOCK_DEFS_BY_TYPE: ReadonlyMap<string, BlockDef> = registry;

/**
 * Get block definition by type, or undefined if not registered.
 * Use this only in UI/tolerance contexts where a missing block is recoverable.
 * For compiler/runtime paths, use requireBlockDef instead.
 */
export function getBlockDefinition(blockType: string): BlockDef | undefined {
  return registry.get(blockType);
}

/**
 * Error thrown when a block type is not registered.
 */
export class UnknownBlockTypeError extends Error {
  readonly code = 'UnknownBlockType';

  constructor(blockType: string) {
    super(`Unknown block type: "${blockType}" is not registered`);
    this.name = 'UnknownBlockTypeError';
  }
}

/**
 * Get block definition by type, throwing if not registered.
 * Use this in compiler/runtime paths where a missing block is always a bug.
 */
export function requireBlockDef(blockType: string): BlockDef {
  const def = registry.get(blockType);
  if (!def) {
    throw new UnknownBlockTypeError(blockType);
  }
  return def;
}

/**
 * Register a block definition.
 */
export function registerBlock(def: BlockDef): void {
  if (registry.has(def.type)) {
    throw new Error(`Block type already registered: ${def.type}`);
  }

  // Validate: object keys are inherently unique, but check input/output collision
  const outputKeys = Object.keys(def.outputs);

  for (const key of outputKeys) {
    if (key in def.inputs) {
      throw new Error(`Port ID used as both input and output in block ${def.type}: ${key}`);
    }
  }

  // Validate vararg constraints
  for (const [portId, inputDef] of Object.entries(def.inputs)) {
    if (isVarargInput(inputDef)) {
      if (!inputDef.varargConstraint) {
        throw new Error(
          `Vararg input "${portId}" in block ${def.type} must have varargConstraint`
        );
      }
      if (inputDef.defaultSource) {
        throw new Error(
          `Vararg input "${portId}" in block ${def.type} cannot have defaultSource`
        );
      }
    }
  }

  registry.set(def.type, def);
}

/**
 * Get all registered block types (for debugging/introspection).
 */
export function getAllBlockTypes(): readonly string[] {
  return Array.from(registry.keys());
}

/**
 * Get all unique block categories (primitive and composite).
 */
export function getBlockCategories(): readonly string[] {
  const categories = new Set<string>();
  for (const def of registry.values()) {
    categories.add(def.category);
  }
  for (const def of compositeRegistry.values()) {
    categories.add(def.category);
  }
  return Array.from(categories).sort();
}

/**
 * Get all block types in a given category (primitive and composite).
 * Returns BlockDef for primitives and CompositeBlockDef for composites.
 */
export function getBlockTypesByCategory(category: string): readonly (BlockDef | CompositeBlockDef)[] {
  const blocks: (BlockDef | CompositeBlockDef)[] = [];
  for (const def of registry.values()) {
    if (def.category === category) {
      blocks.push(def);
    }
  }
  for (const def of compositeRegistry.values()) {
    if (def.category === category) {
      blocks.push(def);
    }
  }
  return blocks;
}

// =============================================================================
// Helper Functions (for working with Record-based ports)
// =============================================================================

/**
 * Get input definitions that are exposed as wirable ports.
 */
export function getExposedInputs(def: BlockDef): Array<[string, InputDef]> {
  return Object.entries(def.inputs).filter(([_, d]) => d.exposedAsPort !== false);
}

/**
 * Get output definitions that are not hidden.
 */
export function getExposedOutputs(def: BlockDef): Array<[string, OutputDef]> {
  return Object.entries(def.outputs).filter(([_, d]) => !d.hidden);
}

// =============================================================================
// Cardinality Query Functions (for compiler passes)
// =============================================================================

/**
 * Get cardinality metadata for a block type.
 * Throws if block type is not registered.
 * Returns undefined if block has no cardinality metadata (fixed cardinality).
 */
export function getBlockCardinalityMetadata(blockType: string): BlockCardinalityMetadata | undefined {
  return requireBlockDef(blockType).cardinality;
}

/**
 * Check if a block is cardinality-generic (preserve mode + lane-local).
 * Throws if block type is not registered.
 */
export function isCardinalityGeneric(blockType: string): boolean {
  const meta = getBlockCardinalityMetadata(blockType);
  return meta?.cardinalityMode === 'preserve' && meta?.laneCoupling === 'laneLocal';
}

/**
 * Default cardinality metadata for blocks that don't specify it.
 * Assumes signalOnly for backwards compatibility with existing blocks.
 */
export const DEFAULT_CARDINALITY_METADATA: BlockCardinalityMetadata = {
  cardinalityMode: 'signalOnly',
  laneCoupling: 'laneLocal',
  broadcastPolicy: 'disallowSignalMix',
};

// =============================================================================
// Payload-Generic Metadata Query Functions
// =============================================================================

/**
 * Get the payload metadata for a block type.
 * Throws if block type is not registered.
 * Returns undefined if block has no payload metadata.
 */
export function getBlockPayloadMetadata(blockType: string): BlockPayloadMetadata | undefined {
  return requireBlockDef(blockType).payload;
}

/**
 * Check if a payload type is allowed for a specific port on a block.
 *
 * @param blockType - The block type
 * @param portName - The port name (input or output key)
 * @param payload - The payload type to check (may be InferencePayloadType with vars)
 * @returns true if allowed, false if disallowed, undefined if no constraints
 *
 * Note: PayloadVar types are always allowed - constraint solving will handle actual type validation.
 */
export function isPayloadAllowed(
  blockType: string,
  portName: string,
  payload: PayloadType | InferencePayloadType
): boolean | undefined {
  // PayloadVar is always allowed - constraint solving will handle validation
  if (isPayloadVar(payload)) return true;

  const meta = getBlockPayloadMetadata(blockType);
  if (!meta) return undefined;

  const allowed = meta.allowedPayloads[portName];
  if (!allowed || allowed.length === 0) return undefined;

  // Check if any allowed type matches (handling both concrete and payloadVar in allowed list)
  return allowed.some(a => payloadsEqual(a, payload as PayloadType));
}

/**
 * Get valid payload combinations for a block.
 * Throws if block type is not registered.
 * Returns undefined if the block has no combination constraints.
 */
export function getPayloadCombinations(blockType: string): readonly PayloadCombination[] | undefined {
  const meta = getBlockPayloadMetadata(blockType);
  return meta?.combinations;
}

/**
 * Check if an input payload tuple produces a valid combination.
 *
 * @param blockType - The block type
 * @param inputPayloads - Tuple of input payload types
 * @returns The output payload if valid, undefined if no match or no constraints
 *
 * Note: PayloadVar types always match any concrete type - constraint solving will validate.
 */
export function findPayloadCombination(
  blockType: string,
  inputPayloads: readonly PayloadType[]
): PayloadCombination | undefined {
  const combos = getPayloadCombinations(blockType);
  if (!combos) return undefined;

  return combos.find((combo) => {
    if (combo.inputs.length !== inputPayloads.length) return false;
    return combo.inputs.every((p, i) => {
      // PayloadVar matches anything
      // Note: We can't use isPayloadVar here since inputPayloads is PayloadType[] (concrete only)
      return payloadsEqual(p, inputPayloads[i]);
    });
  });
}

/**
 * Check if a block is payload-generic (has payload metadata with multiple allowed types).
 */
export function isPayloadGeneric(blockType: string): boolean {
  const meta = getBlockPayloadMetadata(blockType);
  if (!meta) return false;

  // Check if any port allows multiple payload types
  for (const allowed of Object.values(meta.allowedPayloads)) {
    if (allowed.length > 1) return true;
  }
  return false;
}

// =============================================================================
// Composite Block Registry
// =============================================================================

import type {
  CompositeBlockDef,
  CompositeValidationError,
} from './composite-types';

// Re-export composite types for convenience
export type { CompositeBlockDef, InternalBlockId } from './composite-types';
export { isCompositeBlockDef } from './composite-types';

/** Union of primitive and composite block definitions. Use in UI/display code that works with both. */
export type AnyBlockDef = BlockDef | CompositeBlockDef;

/** Separate registry for composite blocks */
const compositeRegistry = new Map<string, CompositeBlockDef>();

/**
 * Composite definitions indexed by type.
 * Exported for direct access by compiler passes.
 */
export const COMPOSITE_DEFS_BY_TYPE: ReadonlyMap<string, CompositeBlockDef> = compositeRegistry;

/**
 * Get composite block definition by type, or undefined if not registered.
 */
export function getCompositeDefinition(blockType: string): CompositeBlockDef | undefined {
  return compositeRegistry.get(blockType);
}

/**
 * Get composite block definition by type, throwing if not registered.
 */
export function requireCompositeDef(blockType: string): CompositeBlockDef {
  const def = compositeRegistry.get(blockType);
  if (!def) {
    throw new Error(`Unknown composite block type: "${blockType}" is not registered`);
  }
  return def;
}

/**
 * Check if a block type is a composite.
 */
export function isCompositeType(blockType: string): boolean {
  return compositeRegistry.has(blockType);
}

/**
 * Validate a composite block definition.
 * Returns an array of validation errors (empty if valid).
 */
export function validateCompositeDefinition(
  def: CompositeBlockDef,
  visitedTypes: Set<string> = new Set(),
  depth: number = 0
): CompositeValidationError[] {
  const errors: CompositeValidationError[] = [];

  // Check nesting depth
  if (depth > 5) { // MAX_COMPOSITE_NESTING_DEPTH
    errors.push({
      code: 'MAX_NESTING_EXCEEDED',
      message: `Composite nesting depth exceeds maximum of 5 levels`,
    });
    return errors;
  }

  // Check for circular references
  if (visitedTypes.has(def.type)) {
    errors.push({
      code: 'CIRCULAR_REFERENCE',
      message: `Circular reference detected: composite "${def.type}" references itself`,
    });
    return errors;
  }
  visitedTypes.add(def.type);

  // Check for empty composite
  if (def.internalBlocks.size === 0) {
    errors.push({
      code: 'EMPTY_COMPOSITE',
      message: 'Composite must contain at least one internal block',
    });
  }

  // Check for at least one exposed output
  if (def.exposedOutputs.length === 0) {
    errors.push({
      code: 'NO_EXPOSED_OUTPUTS',
      message: 'Composite must expose at least one output port',
    });
  }

  // Validate internal block types
  for (const [internalId, internalDef] of def.internalBlocks) {
    const blockDef = getBlockDefinition(internalDef.type);
    const compositeDef = getCompositeDefinition(internalDef.type);

    if (!blockDef && !compositeDef) {
      errors.push({
        code: 'UNKNOWN_INTERNAL_BLOCK_TYPE',
        message: `Internal block "${internalId}" references unknown block type "${internalDef.type}"`,
        location: { internalBlockId: internalId },
      });
    }

    // Recursively validate nested composites
    if (compositeDef) {
      const nestedErrors = validateCompositeDefinition(compositeDef, new Set(visitedTypes), depth + 1);
      errors.push(...nestedErrors);
    }
  }

  // Validate exposed input port mappings
  const seenExternalInputs = new Set<string>();
  for (const exposed of def.exposedInputs) {
    // Check for duplicate external IDs
    if (seenExternalInputs.has(exposed.externalId)) {
      errors.push({
        code: 'DUPLICATE_EXTERNAL_PORT',
        message: `Duplicate external input port ID: "${exposed.externalId}"`,
        location: { portId: exposed.externalId },
      });
    }
    seenExternalInputs.add(exposed.externalId);

    // Check internal block exists
    if (!def.internalBlocks.has(exposed.internalBlockId)) {
      errors.push({
        code: 'INVALID_PORT_MAPPING',
        message: `Exposed input "${exposed.externalId}" maps to non-existent internal block "${exposed.internalBlockId}"`,
        location: { internalBlockId: exposed.internalBlockId, portId: exposed.externalId },
      });
    } else {
      // Check internal port exists
      const internalBlock = def.internalBlocks.get(exposed.internalBlockId)!;
      const internalBlockDef = getBlockDefinition(internalBlock.type);
      const internalCompositeDef = getCompositeDefinition(internalBlock.type);

      // Check if the port exists - handle both primitives and composites
      let portExists = false;
      if (internalBlockDef) {
        // Primitive block - check inputs
        portExists = exposed.internalPortId in internalBlockDef.inputs;
      } else if (internalCompositeDef) {
        // Composite block - check exposedInputs
        portExists = internalCompositeDef.exposedInputs.some(
          exp => exp.externalId === exposed.internalPortId
        );
      }

      if ((internalBlockDef || internalCompositeDef) && !portExists) {
        errors.push({
          code: 'INVALID_PORT_MAPPING',
          message: `Exposed input "${exposed.externalId}" maps to non-existent port "${exposed.internalPortId}" on block "${exposed.internalBlockId}"`,
          location: { internalBlockId: exposed.internalBlockId, portId: exposed.internalPortId },
        });
      }
    }
  }

  // Validate exposed output port mappings
  const seenExternalOutputs = new Set<string>();
  for (const exposed of def.exposedOutputs) {
    // Check for duplicate external IDs
    if (seenExternalOutputs.has(exposed.externalId)) {
      errors.push({
        code: 'DUPLICATE_EXTERNAL_PORT',
        message: `Duplicate external output port ID: "${exposed.externalId}"`,
        location: { portId: exposed.externalId },
      });
    }
    seenExternalOutputs.add(exposed.externalId);

    // Check internal block exists
    if (!def.internalBlocks.has(exposed.internalBlockId)) {
      errors.push({
        code: 'INVALID_PORT_MAPPING',
        message: `Exposed output "${exposed.externalId}" maps to non-existent internal block "${exposed.internalBlockId}"`,
        location: { internalBlockId: exposed.internalBlockId, portId: exposed.externalId },
      });
    } else {
      // Check internal port exists
      const internalBlock = def.internalBlocks.get(exposed.internalBlockId)!;
      const internalBlockDef = getBlockDefinition(internalBlock.type);
      const internalCompositeDef = getCompositeDefinition(internalBlock.type);

      // Check if the port exists - handle both primitives and composites
      let portExists = false;
      if (internalBlockDef) {
        // Primitive block - check outputs
        portExists = exposed.internalPortId in internalBlockDef.outputs;
      } else if (internalCompositeDef) {
        // Composite block - check exposedOutputs
        portExists = internalCompositeDef.exposedOutputs.some(
          exp => exp.externalId === exposed.internalPortId
        );
      }

      if ((internalBlockDef || internalCompositeDef) && !portExists) {
        errors.push({
          code: 'INVALID_PORT_MAPPING',
          message: `Exposed output "${exposed.externalId}" maps to non-existent port "${exposed.internalPortId}" on block "${exposed.internalBlockId}"`,
          location: { internalBlockId: exposed.internalBlockId, portId: exposed.internalPortId },
        });
      }
    }
  }

  // Check for duplicate between inputs and outputs
  for (const inputId of seenExternalInputs) {
    if (seenExternalOutputs.has(inputId)) {
      errors.push({
        code: 'DUPLICATE_EXTERNAL_PORT',
        message: `Port ID "${inputId}" used as both input and output`,
        location: { portId: inputId },
      });
    }
  }

  visitedTypes.delete(def.type);
  return errors;
}

/**
 * Register a composite block definition.
 *
 * Validates the composite and throws if invalid.
 */
export function registerComposite(def: CompositeBlockDef): void {
  // Check for name collision with primitive blocks
  if (registry.has(def.type)) {
    throw new Error(`Block type already registered as primitive: ${def.type}`);
  }

  // Check for duplicate composite registration
  if (compositeRegistry.has(def.type)) {
    throw new Error(`Composite block type already registered: ${def.type}`);
  }

  // Validate the definition
  const errors = validateCompositeDefinition(def);
  if (errors.length > 0) {
    const errorMessages = errors.map(e => `  - ${e.code}: ${e.message}`).join('\n');
    throw new Error(`Invalid composite block definition "${def.type}":\n${errorMessages}`);
  }

  compositeRegistry.set(def.type, def);
}

/**
 * Unregister a composite block definition.
 * Used for user-created composites that can be deleted.
 * Library composites (readonly: true) cannot be unregistered.
 */
export function unregisterComposite(blockType: string): boolean {
  const def = compositeRegistry.get(blockType);
  if (!def) {
    return false;
  }

  if (def.readonly) {
    throw new Error(`Cannot unregister library composite: ${blockType}`);
  }

  compositeRegistry.delete(blockType);
  return true;
}

/**
 * Get all registered composite block types.
 */
export function getAllCompositeTypes(): readonly string[] {
  return Array.from(compositeRegistry.keys());
}

/**
 * Get all composite block definitions.
 */
export function getAllComposites(): readonly CompositeBlockDef[] {
  return Array.from(compositeRegistry.values());
}

/**
 * Check if a block type is registered (primitive or composite).
 */
export function isBlockTypeRegistered(blockType: string): boolean {
  return registry.has(blockType) || compositeRegistry.has(blockType);
}

/**
 * Get any block definition (primitive or composite) by type.
 */
export function getAnyBlockDefinition(blockType: string): BlockDef | CompositeBlockDef | undefined {
  return registry.get(blockType) || compositeRegistry.get(blockType);
}

/**
 * Require any block definition (primitive or composite), throwing if not found.
 */
export function requireAnyBlockDef(blockType: string): BlockDef | CompositeBlockDef {
  const def = getAnyBlockDefinition(blockType);
  if (!def) {
    throw new Error(`Unknown block type: "${blockType}" is not registered`);
  }
  return def;
}
