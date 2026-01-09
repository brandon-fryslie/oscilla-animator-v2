/**
 * Lower Types - Types for block lowering pass
 *
 * These types represent the intermediate results of lowering blocks
 * to IR expressions.
 */
// =============================================================================
// Block Type Registry
// =============================================================================
const BLOCK_TYPES = new Map();
/**
 * Register a block type for IR lowering.
 */
export function registerBlockType(decl) {
    BLOCK_TYPES.set(decl.type, decl);
}
/**
 * Get a block type declaration by type name.
 */
export function getBlockType(type) {
    return BLOCK_TYPES.get(type);
}
/**
 * Check if a block type is registered.
 */
export function hasBlockType(type) {
    return BLOCK_TYPES.has(type);
}
/**
 * Get all registered block type names.
 */
export function getAllBlockTypes() {
    return Array.from(BLOCK_TYPES.keys());
}
