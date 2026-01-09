/**
 * Block Registry
 *
 * Provides block definitions for the compiler.
 * This is a stub that will be extended with actual block definitions.
 */

import type { SignalType } from '../core/canonical-types';
import type { Slot, UIControlHint, DefaultSource } from '../types';

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
 * Block definition from the registry.
 */
export interface BlockDef {
  readonly type: string;
  readonly label: string;
  readonly category: string;
  readonly description?: string;
  readonly form: BlockForm;
  readonly capability: Capability;
  readonly inputs: readonly InputDef[];
  readonly outputs: readonly OutputDef[];
  readonly params?: Record<string, unknown>;
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
  registry.set(def.type, def);
}

/**
 * Get all registered block types.
 */
export function getAllBlockTypes(): string[] {
  return Array.from(registry.keys());
}

/**
 * Check if a block type is registered.
 */
export function hasBlockDefinition(blockType: string): boolean {
  return registry.has(blockType);
}
