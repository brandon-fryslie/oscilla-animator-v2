/**
 * Block Registry
 *
 * ONE pattern for all blocks. No exceptions.
 *
 * Each block:
 * 1. Declares its inputs and outputs with types
 * 2. Provides a lower() function that emits IR
 * 3. Returns outputs keyed by portId
 */
import { signalTypeSignal, signalTypeField, signalTypeStatic, domainRef, } from '../../core/canonical-types';
// =============================================================================
// Registry
// =============================================================================
const registry = new Map();
export function registerBlock(def) {
    if (registry.has(def.type)) {
        throw new Error(`Block type already registered: ${def.type}`);
    }
    // Validate port IDs are unique
    const inputIds = new Set(def.inputs.map((p) => p.portId));
    const outputIds = new Set(def.outputs.map((p) => p.portId));
    if (inputIds.size !== def.inputs.length) {
        throw new Error(`Duplicate input port IDs in block ${def.type}`);
    }
    if (outputIds.size !== def.outputs.length) {
        throw new Error(`Duplicate output port IDs in block ${def.type}`);
    }
    registry.set(def.type, def);
}
export function getBlock(type) {
    return registry.get(type);
}
export function getAllBlocks() {
    return [...registry.values()];
}
// =============================================================================
// Helpers for block implementations
// =============================================================================
export function portId(s) {
    return s;
}
/**
 * Create a Signal SignalType (one + continuous).
 */
export function sigType(payload) {
    return signalTypeSignal(payload);
}
/**
 * Create a Field SignalType (many(domain) + continuous).
 * Note: This creates a default field type. Actual domain will be unified at compile time.
 */
export function fieldType(payload) {
    return signalTypeField(payload, '__default__');
}
/**
 * Create a Static/Scalar SignalType (zero + continuous).
 */
export function scalarType(payload) {
    return signalTypeStatic(payload);
}
/**
 * Create an Event SignalType.
 * Note: Events use discrete temporality.
 */
export function eventType(payload = 'float') {
    return signalTypeSignal(payload); // TODO: Update to use discrete temporality
}
/**
 * Create a DomainRef for domain output ports.
 */
export function domainType(id = '__domain__') {
    return domainRef(id);
}
/** Extract required signal input - throws if missing or wrong type */
export function sig(inputs, port) {
    const v = inputs[port];
    if (!v || v.kind !== 'sig')
        throw new Error(`Missing signal input: ${port}`);
    return v;
}
/** Extract required field input - throws if missing or wrong type */
export function field(inputs, port) {
    const v = inputs[port];
    if (!v || v.kind !== 'field')
        throw new Error(`Missing field input: ${port}`);
    return v;
}
/** Extract required domain input - throws if missing or wrong type */
export function domain(inputs, port) {
    const v = inputs[port];
    if (!v || v.kind !== 'domain')
        throw new Error(`Missing domain input: ${port}`);
    return v;
}
/** Extract signal OR field input (for polymorphic ports) */
export function sigOrField(inputs, port) {
    const v = inputs[port];
    if (!v || (v.kind !== 'sig' && v.kind !== 'field')) {
        throw new Error(`Missing signal/field input: ${port}`);
    }
    return v;
}
