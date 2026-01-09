/**
 * Core type definitions for Oscilla v2
 *
 * This module consolidates all types from core/types.ts and compiler/ir/Indices.ts.
 * It provides a single import point for common types.
 */
export { createTypeDesc, getTypeArity, inferBundleLanes, sigType, fieldType, scalarType, eventType, } from '../core/types';
export { nodeIndex, portIndex, busIndex, valueSlot, stepIndex, sigExprId, fieldExprId, eventExprId, nodeId, busId, stepId, exprId, stateId, domainId, slotId, } from '../compiler/ir/Indices';
export function blockId(s) {
    return s;
}
export function portId(s) {
    return s;
}
// =============================================================================
// Type Compatibility (Simple version for toy compiler)
// =============================================================================
/**
 * Check if source type can connect to target type.
 * Returns the conversion needed, or null if incompatible.
 */
export function getConversion(source, target) {
    // Same type - direct
    if (source.world === target.world && source.domain === target.domain) {
        return { kind: 'direct' };
    }
    // Domain must match for automatic conversions
    if (source.domain !== target.domain) {
        return null;
    }
    // Scalar → Signal (promote)
    if (source.world === 'scalar' && target.world === 'signal') {
        return { kind: 'promote', from: 'scalar', to: 'signal' };
    }
    // Signal → Field (broadcast)
    if (source.world === 'signal' && target.world === 'field') {
        return { kind: 'broadcast' };
    }
    // Scalar → Field (promote then broadcast)
    if (source.world === 'scalar' && target.world === 'field') {
        return { kind: 'promote-broadcast' };
    }
    return null;
}
