/**
 * Dense Index Types for IR
 *
 * Branded types for dense numeric indices used in runtime lookups.
 * String IDs are for persistence and debugging; indices are for fast runtime access.
 */
// =============================================================================
// Factory Functions (Zero-cost casts)
// =============================================================================
export function nodeIndex(n) {
    return n;
}
export function portIndex(n) {
    return n;
}
export function busIndex(n) {
    return n;
}
export function valueSlot(n) {
    return n;
}
export function stepIndex(n) {
    return n;
}
export function sigExprId(n) {
    return n;
}
export function fieldExprId(n) {
    return n;
}
export function eventExprId(n) {
    return n;
}
export function nodeId(s) {
    return s;
}
export function busId(s) {
    return s;
}
export function stepId(s) {
    return s;
}
export function exprId(s) {
    return s;
}
export function stateId(s) {
    return s;
}
export function domainId(s) {
    return s;
}
export function slotId(s) {
    return s;
}
