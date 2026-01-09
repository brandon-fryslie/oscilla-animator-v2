/**
 * IRBuilder Implementation
 *
 * Concrete implementation of the IRBuilder interface.
 */
import { sigExprId, fieldExprId, eventExprId, valueSlot, domainId, stateId, } from './Indices';
// =============================================================================
// IRBuilderImpl
// =============================================================================
export class IRBuilderImpl {
    sigExprs = [];
    fieldExprs = [];
    eventExprs = [];
    domains = new Map();
    slotCounter = 0;
    stateCounter = 0;
    constCounter = 0;
    timeModel;
    currentBlockId;
    // Slot registrations for debug/validation
    sigSlots = new Map();
    fieldSlots = new Map();
    eventSlots = new Map();
    // =========================================================================
    // Signal Expressions
    // =========================================================================
    sigConst(value, type) {
        const id = sigExprId(this.sigExprs.length);
        this.sigExprs.push({ kind: 'const', value, type });
        return id;
    }
    sigSlot(slot, type) {
        const id = sigExprId(this.sigExprs.length);
        // Note: Using slot as SlotId - needs type alignment
        this.sigExprs.push({ kind: 'slot', slot: slot, type });
        return id;
    }
    sigTime(which, type) {
        const id = sigExprId(this.sigExprs.length);
        this.sigExprs.push({ kind: 'time', which, type });
        return id;
    }
    sigExternal(which, type) {
        const id = sigExprId(this.sigExprs.length);
        this.sigExprs.push({ kind: 'external', which, type });
        return id;
    }
    sigMap(input, fn, type) {
        const id = sigExprId(this.sigExprs.length);
        this.sigExprs.push({ kind: 'map', input, fn, type });
        return id;
    }
    sigZip(inputs, fn, type) {
        const id = sigExprId(this.sigExprs.length);
        this.sigExprs.push({ kind: 'zip', inputs, fn, type });
        return id;
    }
    // =========================================================================
    // Signal Combine
    // =========================================================================
    sigCombine(inputs, mode, type) {
        // For combining signals, we use zip with appropriate combine function
        const sigInputs = inputs.map(i => i);
        const fn = { kind: 'kernel', name: `combine_${mode}` };
        const id = sigExprId(this.sigExprs.length);
        this.sigExprs.push({ kind: 'zip', inputs: sigInputs, fn, type });
        return id;
    }
    // =========================================================================
    // Field Expressions
    // =========================================================================
    fieldConst(value, type) {
        const id = fieldExprId(this.fieldExprs.length);
        this.fieldExprs.push({ kind: 'const', value, type });
        return id;
    }
    fieldSource(domain, sourceId, type) {
        const id = fieldExprId(this.fieldExprs.length);
        this.fieldExprs.push({ kind: 'source', domain, sourceId, type });
        return id;
    }
    fieldBroadcast(signal, type) {
        const id = fieldExprId(this.fieldExprs.length);
        this.fieldExprs.push({ kind: 'broadcast', signal, type });
        return id;
    }
    fieldMap(input, fn, type) {
        const id = fieldExprId(this.fieldExprs.length);
        this.fieldExprs.push({ kind: 'map', input, fn, type });
        return id;
    }
    fieldZip(inputs, fn, type) {
        const id = fieldExprId(this.fieldExprs.length);
        this.fieldExprs.push({ kind: 'zip', inputs, fn, type });
        return id;
    }
    fieldZipSig(field, signals, fn, type) {
        const id = fieldExprId(this.fieldExprs.length);
        this.fieldExprs.push({ kind: 'zipSig', field, signals, fn, type });
        return id;
    }
    // =========================================================================
    // Field Combine
    // =========================================================================
    fieldCombine(inputs, mode, type) {
        // For combining fields, we use zip with appropriate combine function
        const fieldInputs = inputs.map(i => i);
        const fn = { kind: 'kernel', name: `combine_${mode}` };
        const id = fieldExprId(this.fieldExprs.length);
        this.fieldExprs.push({ kind: 'zip', inputs: fieldInputs, fn, type });
        return id;
    }
    // =========================================================================
    // Event Expressions
    // =========================================================================
    eventPulse(source) {
        const id = eventExprId(this.eventExprs.length);
        this.eventExprs.push({ kind: 'pulse', source });
        return id;
    }
    eventWrap(signal) {
        const id = eventExprId(this.eventExprs.length);
        this.eventExprs.push({ kind: 'wrap', signal });
        return id;
    }
    eventCombine(events, mode, _type) {
        const id = eventExprId(this.eventExprs.length);
        // Map 'merge' and 'last' to underlying event combine modes
        const underlyingMode = mode === 'merge' || mode === 'last' ? 'any' : mode;
        this.eventExprs.push({ kind: 'combine', events, mode: underlyingMode });
        return id;
    }
    // =========================================================================
    // Domains
    // =========================================================================
    createDomain(kind, count, params = {}) {
        const id = domainId(`domain_${this.domains.size}`);
        const elementIds = Array.from({ length: count }, (_, i) => `${id}_${i}`);
        this.domains.set(id, { id, kind, count, elementIds, params });
        return id;
    }
    // =========================================================================
    // Slots
    // =========================================================================
    allocSlot() {
        return valueSlot(this.slotCounter++);
    }
    allocValueSlot(_type, _label) {
        return valueSlot(this.slotCounter++);
    }
    getSlotCount() {
        return this.slotCounter;
    }
    // =========================================================================
    // Slot Registration
    // =========================================================================
    registerSigSlot(sigId, slot) {
        this.sigSlots.set(sigId, slot);
    }
    registerFieldSlot(fieldId, slot) {
        this.fieldSlots.set(fieldId, slot);
    }
    registerEventSlot(eventId, slot) {
        this.eventSlots.set(eventId, slot);
    }
    // =========================================================================
    // State
    // =========================================================================
    allocState(_initialValue) {
        return stateId(`state_${this.stateCounter++}`);
    }
    // =========================================================================
    // Debug Tracking
    // =========================================================================
    setCurrentBlockId(blockId) {
        this.currentBlockId = blockId;
    }
    allocConstId(_value) {
        return this.constCounter++;
    }
    // =========================================================================
    // Time Model
    // =========================================================================
    setTimeModel(model) {
        this.timeModel = model;
    }
    getTimeModel() {
        return this.timeModel;
    }
    // =========================================================================
    // Pure Functions
    // =========================================================================
    opcode(op) {
        return { kind: 'opcode', opcode: op };
    }
    expr(expression) {
        return { kind: 'expr', expr: expression };
    }
    kernel(name) {
        return { kind: 'kernel', name };
    }
    // =========================================================================
    // Build Result
    // =========================================================================
    getSigExprs() {
        return this.sigExprs;
    }
    getFieldExprs() {
        return this.fieldExprs;
    }
    getEventExprs() {
        return this.eventExprs;
    }
    getDomains() {
        return this.domains;
    }
    getSigSlots() {
        return this.sigSlots;
    }
    getFieldSlots() {
        return this.fieldSlots;
    }
    getEventSlots() {
        return this.eventSlots;
    }
}
/**
 * Create a new IRBuilder instance.
 */
export function createIRBuilder() {
    return new IRBuilderImpl();
}
