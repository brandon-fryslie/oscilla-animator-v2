/**
 * Runtime State - Per-Frame Execution State
 *
 * Container for all runtime state needed during frame execution.
 * Simplified for v2 - no hot-swap complexity initially.
 */
import { createTimeState } from './timeResolution';
/**
 * Create a ValueStore with the given slot count
 */
export function createValueStore(slotCount) {
    return {
        f64: new Float64Array(slotCount),
        objects: new Map(),
    };
}
/**
 * Create a FrameCache
 */
export function createFrameCache(maxSigExprs = 1000, maxFieldExprs = 1000) {
    return {
        frameId: 0,
        sigValues: new Float64Array(maxSigExprs),
        sigStamps: new Uint32Array(maxSigExprs),
        fieldBuffers: new Map(),
        fieldStamps: new Map(),
    };
}
/**
 * Create default external inputs
 */
export function createExternalInputs() {
    return {
        mouseX: 0.5,
        mouseY: 0.5,
        mouseOver: false,
        smoothX: 0.5,
        smoothY: 0.5,
    };
}
/**
 * Update smooth following - call once per frame
 * @param ext External inputs to update
 * @param lerpFactor How fast to follow (0.02 = slow, 0.1 = fast)
 */
export function updateSmoothing(ext, lerpFactor = 0.05) {
    ext.smoothX += (ext.mouseX - ext.smoothX) * lerpFactor;
    ext.smoothY += (ext.mouseY - ext.smoothY) * lerpFactor;
}
/**
 * Create a RuntimeState
 */
export function createRuntimeState(slotCount) {
    return {
        values: createValueStore(slotCount),
        cache: createFrameCache(),
        timeState: createTimeState(),
        time: null,
        external: createExternalInputs(),
    };
}
/**
 * Advance to next frame
 * Cache owns frameId - only increment it there
 */
export function advanceFrame(state) {
    state.cache.frameId++;
    // Note: Don't clear caches - stamp-based invalidation handles this
}
