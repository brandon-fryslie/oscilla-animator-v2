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
   * Instance context (NEW - Domain Refactor Sprint 3).
   * Set by instance blocks (Array, etc.) to provide instance context to downstream blocks.
   */
  readonly instance?: InstanceId;

  /**
   * Inferred instance context (NEW - Domain Refactor Sprint 3).
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

/**
 * Input definition for a block.
 *
 * UNIFIED DESIGN (2026-01-20):
 * - Both wirable ports AND config-only parameters use this type
 * - `exposedAsPort` distinguishes between ports (true) and config (false)
 * - Object key (in BlockDef.inputs Record) is the identifier
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
 * Get block definition by type.
 */
export function getBlockDefinition(blockType: string): BlockDef | undefined {
  return registry.get(blockType);
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
