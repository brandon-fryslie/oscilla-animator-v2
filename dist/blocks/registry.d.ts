/**
 * Block Registry
 *
 * Provides block definitions for the compiler.
 * This is a stub that will be extended with actual block definitions.
 */
import type { TypeDesc, UIControlHint, DefaultSource } from '../types';
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
    readonly type: TypeDesc;
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
    readonly type: TypeDesc;
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
/**
 * Block definitions indexed by type.
 * Exported for direct access by compiler passes.
 */
export declare const BLOCK_DEFS_BY_TYPE: ReadonlyMap<string, BlockDef>;
/**
 * Get block definition by type.
 */
export declare function getBlockDefinition(blockType: string): BlockDef | undefined;
/**
 * Register a block definition.
 */
export declare function registerBlock(def: BlockDef): void;
/**
 * Get all registered block types.
 */
export declare function getAllBlockTypes(): string[];
/**
 * Check if a block type is registered.
 */
export declare function hasBlockDefinition(blockType: string): boolean;
