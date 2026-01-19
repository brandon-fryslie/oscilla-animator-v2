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
 */
export interface InputDef {
  readonly id: string;
  readonly label: string;
  readonly type: SignalType;
  readonly optional?: boolean;
  readonly defaultValue?: unknown;
  readonly defaultSource?: DefaultSource;
  readonly uiHint?: UIControlHint;
}

/**
 * Output definition for a block.
 */
export interface OutputDef {
  readonly id: string;
  readonly label: string;
  readonly type: SignalType;
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

  // Port definitions
  readonly inputs: readonly InputDef[];
  readonly outputs: readonly OutputDef[];

  // Block parameters
  readonly params?: Record<string, unknown>;

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

  // Validate port IDs are unique
  const inputIds = new Set(def.inputs.map((p) => p.id));
  const outputIds = new Set(def.outputs.map((p) => p.id));

  if (inputIds.size !== def.inputs.length) {
    throw new Error(`Duplicate input port IDs in block ${def.type}`);
  }
  if (outputIds.size !== def.outputs.length) {
    throw new Error(`Duplicate output port IDs in block ${def.type}`);
  }

  // Check input/output ID collision
  for (const outId of outputIds) {
    if (inputIds.has(outId)) {
      throw new Error(`Port ID used as both input and output in block ${def.type}: ${outId}`);
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
