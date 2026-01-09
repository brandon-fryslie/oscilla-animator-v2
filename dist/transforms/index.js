/**
 * Transform Registry
 *
 * Provides transform definitions (adapters and lenses) for the compiler.
 * This is a stub that will be extended with actual transform definitions.
 */
// =============================================================================
// Registry
// =============================================================================
const adapters = new Map();
const lenses = new Map();
/**
 * Get adapter definition by ID.
 */
export function getAdapter(adapterId) {
    return adapters.get(adapterId);
}
/**
 * Register an adapter.
 */
export function registerAdapter(def) {
    adapters.set(def.id, def);
}
/**
 * Get lens definition by ID.
 */
export function getLens(lensId) {
    return lenses.get(lensId);
}
/**
 * Register a lens.
 */
export function registerLens(def) {
    lenses.set(def.id, def);
}
/**
 * Find adapters that convert from source to target type.
 */
export function findAdapters(from, to) {
    return Array.from(adapters.values()).filter(a => a.from.world === from.world &&
        a.from.domain === from.domain &&
        a.to.world === to.world &&
        a.to.domain === to.domain);
}
/**
 * Get all registered adapter IDs.
 */
export function getAllAdapterIds() {
    return Array.from(adapters.keys());
}
/**
 * Get all registered lens IDs.
 */
export function getAllLensIds() {
    return Array.from(lenses.keys());
}
const transforms = new Map();
/**
 * Transform registry - unified access to adapters and lenses.
 */
export const TRANSFORM_REGISTRY = {
    getTransform(id) {
        return transforms.get(id);
    },
    registerTransform(def) {
        transforms.set(def.id, def);
    },
    getAllTransformIds() {
        return Array.from(transforms.keys());
    },
};
