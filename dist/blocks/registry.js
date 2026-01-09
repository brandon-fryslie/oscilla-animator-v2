/**
 * Block Registry
 *
 * Provides block definitions for the compiler.
 * This is a stub that will be extended with actual block definitions.
 */
// =============================================================================
// Registry
// =============================================================================
const registry = new Map();
/**
 * Block definitions indexed by type.
 * Exported for direct access by compiler passes.
 */
export const BLOCK_DEFS_BY_TYPE = registry;
/**
 * Get block definition by type.
 */
export function getBlockDefinition(blockType) {
    return registry.get(blockType);
}
/**
 * Register a block definition.
 */
export function registerBlock(def) {
    registry.set(def.type, def);
}
/**
 * Get all registered block types.
 */
export function getAllBlockTypes() {
    return Array.from(registry.keys());
}
/**
 * Check if a block type is registered.
 */
export function hasBlockDefinition(blockType) {
    return registry.has(blockType);
}
