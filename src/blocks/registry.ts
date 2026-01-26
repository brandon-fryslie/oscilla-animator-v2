/**
 * Block Registry
 *
 * THE ONE AND ONLY block registry.
 * All blocks are defined here with both metadata and IR lowering.
 */

import type { SignalType } from '../core/canonical-types';
import type { Slot, UIControlHint, DefaultSource } from '../types';
import type { IRBuilder } from '../compiler/ir/IRBuilder';
import type { BlockIndex } from '../graph/normalize';
import type { InstanceId } from '../compiler/ir/Indices';

// Re-export lowering types from compiler
export type { ValueRefPacked } from '../compiler/ir/lowerTypes';

/**
 * Lower context - provided to block lower functions.
 */
export interface LowerCtx {
  readonly blockIdx: BlockIndex;
  readonly blockType: string;
  readonly instanceId: string;
  readonly label?: string;
  readonly inTypes: readonly SignalType[];
  readonly outTypes: readonly SignalType[];
  readonly b: IRBuilder;
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
}

/**
 * Lower args - arguments to a block's lower function.
 */
export interface LowerArgs {
  readonly ctx: LowerCtx;
  readonly inputs: readonly import('../compiler/ir/lowerTypes').ValueRefPacked[];
  readonly inputsById: Record<string, import('../compiler/ir/lowerTypes').ValueRefPacked>;
  /**
   * Vararg inputs - array of values per vararg port.
   * Only populated for blocks with vararg inputs.
   * Key is port ID, value is array of ValueRefPacked in sortKey order.
   */
  readonly varargInputsById?: Record<string, readonly import('../compiler/ir/lowerTypes').ValueRefPacked[]>;
  readonly config?: Readonly<Record<string, unknown>>;
}

/**
 * Lower result - output of a block's lower function.
 */
export interface LowerResult {
  /** Map of port ID to ValueRef (required) */
  readonly outputsById: Record<string, import('../compiler/ir/lowerTypes').ValueRefPacked>;

  /**
   * Instance context (optional).
   * Set by blocks that create instances (e.g., Array) to provide instance context
   * to downstream blocks that need it (e.g., GridLayout, RenderInstances2D).
   */
  readonly instanceContext?: InstanceId;
}

// =============================================================================
// Block Definition Types
// =============================================================================

/**
 * Block form determines compilation behavior.
 */
export type BlockForm = 'primitive' | 'macro';

/**
 * Capability determines what special authorities a block has.
 */
export type Capability = 'time' | 'identity' | 'state' | 'render' | 'io' | 'pure';

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
 * - 'allowZipSig': Signals may be consumed alongside fields via FieldExprZipSig
 * - 'requireBroadcastExpr': Compiler must materialize FieldExprBroadcast explicitly
 * - 'disallowSignalMix': Only all-field or all-signal instantiations allowed
 */
export type BroadcastPolicy = 'allowZipSig' | 'requireBroadcastExpr' | 'disallowSignalMix';

/**
 * Cardinality metadata for compile-time specialization.
 * This metadata is compile-time only and does not exist at runtime.
 *
 * Spec Reference: .agent_planning/_future/0-CardinalityGeneric-Block-Type-Spec.md §8
 */
export interface BlockCardinalityMetadata {
  readonly cardinalityMode: CardinalityMode;
  readonly laneCoupling: LaneCoupling;
  readonly broadcastPolicy: BroadcastPolicy;
}

// =============================================================================
// Payload-Generic Block Metadata (Spec §8)
// =============================================================================

import { type PayloadType, isPayloadVar, payloadsEqual } from '../core/canonical-types';

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
export const STANDARD_NUMERIC_PAYLOADS: readonly PayloadType[] = ['float', 'int', 'vec2', 'color'];
export const STANDARD_SCALAR_PAYLOADS: readonly PayloadType[] = ['float', 'int', 'bool'];
export const STANDARD_VECTOR_PAYLOADS: readonly PayloadType[] = ['vec2'];
export const STANDARD_COLOR_PAYLOADS: readonly PayloadType[] = ['color'];
/** All concrete payload types */
export const ALL_CONCRETE_PAYLOADS: readonly PayloadType[] = [
  'float',
  'int',
  'bool',
  'vec2',
  'color',
  'shape',
  'cameraProjection',
];

// =============================================================================
// Varargs Support
// =============================================================================

/**
 * Constraint for a varargs input.
 * Defines type and cardinality requirements for variable-length inputs.
 */
export interface VarargConstraint {
  /** Required payload type for all vararg connections (e.g., 'float') */
  readonly payloadType: PayloadType;
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
 */
export interface InputDef {
  readonly label?: string;           // Display label (defaults to key name)
  readonly type: SignalType;         // Required - all inputs have a type
  readonly value?: unknown;          // Default value (was in params)
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
 */
export interface OutputDef {
  readonly label?: string;           // Display label (defaults to key name)
  readonly type: SignalType;         // Required
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

  // Port definitions (UNIFIED DESIGN 2026-01-20)
  readonly inputs: Record<string, InputDef>;
  readonly outputs: Record<string, OutputDef>;

  // IR lowering function
  readonly lower: (args: LowerArgs) => LowerResult;

  // Optional tags
  readonly tags?: {
    readonly irPortContract?: 'strict' | 'relaxed';
  };
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
  const inputKeys = Object.keys(def.inputs);
  const outputKeys = Object.keys(def.outputs);

  for (const key of outputKeys) {
    if (key in def.inputs) {
      throw new Error(`Port ID used as both input and output in block ${def.type}: ${key}`);
    }
  }

  // Validate varargs inputs
  for (const [portId, inputDef] of Object.entries(def.inputs)) {
    if (isVarargInput(inputDef)) {
      // Varargs inputs must have a constraint
      if (!inputDef.varargConstraint) {
        throw new Error(
          `Vararg input "${portId}" in block ${def.type} must have varargConstraint`
        );
      }

      // Varargs inputs cannot have a defaultSource (explicit connections only)
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
 * Get all unique block categories.
 */
export function getBlockCategories(): readonly string[] {
  const categories = new Set<string>();
  for (const def of registry.values()) {
    categories.add(def.category);
  }
  return Array.from(categories).sort();
}

/**
 * Get all block types in a given category.
 */
export function getBlockTypesByCategory(category: string): readonly BlockDef[] {
  const blocks: BlockDef[] = [];
  for (const def of registry.values()) {
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
 * @param payload - The payload type to check
 * @returns true if allowed, false if disallowed, undefined if no constraints
 *
 * Note: PayloadVar types are always allowed - constraint solving will handle actual type validation.
 */
export function isPayloadAllowed(
  blockType: string,
  portName: string,
  payload: PayloadType
): boolean | undefined {
  // PayloadVar is always allowed - constraint solving will handle validation
  if (isPayloadVar(payload)) return true;

  const meta = getBlockPayloadMetadata(blockType);
  if (!meta) return undefined;

  const allowed = meta.allowedPayloads[portName];
  if (!allowed || allowed.length === 0) return undefined;

  // Check if any allowed type matches (handling both concrete and payloadVar in allowed list)
  return allowed.some(a => payloadsEqual(a, payload));
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
      if (isPayloadVar(inputPayloads[i]) || isPayloadVar(p)) return true;
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
