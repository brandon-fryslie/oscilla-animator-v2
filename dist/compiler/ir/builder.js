/**
 * IR Builder
 *
 * Provides a clean API for emitting IR nodes during compilation.
 * Handles ID allocation and expression deduplication.
 */
import { signalTypeToTypeDesc } from './bridge';
import { domainId as makeDomainId, valueSlot as makeValueSlot, sigExprId as makeSigExprId, fieldExprId as makeFieldExprId, eventExprId as makeEventExprId, } from './Indices';
export class IRBuilder {
    signals = new Map();
    fields = new Map();
    events = new Map();
    domains = new Map();
    steps = [];
    nextSigId = 0;
    nextFieldId = 0;
    nextEventId = 0;
    nextDomainId = 0;
    nextSlotId = 0;
    timeModel = { kind: 'infinite' };
    // Track slot types for slotMeta generation
    slotTypes = new Map();
    // ===========================================================================
    // Time Model
    // ===========================================================================
    setTimeModel(model) {
        this.timeModel = model;
    }
    // ===========================================================================
    // Slot Allocation
    // ===========================================================================
    allocSlot() {
        return makeValueSlot(this.nextSlotId++);
    }
    /** Allocate a typed value slot (tracking type for slotMeta) */
    allocTypedSlot(type, _label) {
        const slot = makeValueSlot(this.nextSlotId++);
        this.slotTypes.set(slot, type);
        return slot;
    }
    // ===========================================================================
    // Signal Expressions
    // ===========================================================================
    sigConst(value, type) {
        const id = makeSigExprId(this.nextSigId++);
        this.signals.set(id, { kind: 'const', value, type });
        return id;
    }
    sigSlot(slot, type) {
        const id = makeSigExprId(this.nextSigId++);
        this.signals.set(id, { kind: 'slot', slot, type });
        return id;
    }
    sigTime(which, type) {
        const id = makeSigExprId(this.nextSigId++);
        this.signals.set(id, { kind: 'time', which, type });
        return id;
    }
    sigExternal(which, type) {
        const id = makeSigExprId(this.nextSigId++);
        this.signals.set(id, { kind: 'external', which, type });
        return id;
    }
    sigMap(input, fn, type) {
        const id = makeSigExprId(this.nextSigId++);
        this.signals.set(id, { kind: 'map', input, fn, type });
        return id;
    }
    sigZip(inputs, fn, type) {
        const id = makeSigExprId(this.nextSigId++);
        this.signals.set(id, { kind: 'zip', inputs, fn, type });
        return id;
    }
    // Convenience: binary op
    sigBinOp(a, b, op, type) {
        return this.sigZip([a, b], { kind: 'opcode', opcode: op }, type);
    }
    // Convenience: unary op
    sigUnaryOp(input, op, type) {
        return this.sigMap(input, { kind: 'opcode', opcode: op }, type);
    }
    // ===========================================================================
    // Field Expressions
    // ===========================================================================
    fieldConst(value, type) {
        const id = makeFieldExprId(this.nextFieldId++);
        this.fields.set(id, { kind: 'const', value, type });
        return id;
    }
    fieldSource(domain, sourceId, type) {
        const id = makeFieldExprId(this.nextFieldId++);
        this.fields.set(id, { kind: 'source', domain, sourceId, type });
        return id;
    }
    fieldBroadcast(signal, type) {
        const id = makeFieldExprId(this.nextFieldId++);
        this.fields.set(id, { kind: 'broadcast', signal, type });
        return id;
    }
    fieldMap(input, fn, type) {
        const id = makeFieldExprId(this.nextFieldId++);
        this.fields.set(id, { kind: 'map', input, fn, type });
        return id;
    }
    fieldZip(inputs, fn, type) {
        const id = makeFieldExprId(this.nextFieldId++);
        this.fields.set(id, { kind: 'zip', inputs, fn, type });
        return id;
    }
    fieldZipSig(field, signals, fn, type) {
        const id = makeFieldExprId(this.nextFieldId++);
        this.fields.set(id, { kind: 'zipSig', field, signals, fn, type });
        return id;
    }
    fieldMapIndexed(domain, fn, type, signals) {
        const id = makeFieldExprId(this.nextFieldId++);
        this.fields.set(id, { kind: 'mapIndexed', domain, fn, type, signals });
        return id;
    }
    // ===========================================================================
    // Event Expressions
    // ===========================================================================
    eventPulse() {
        const id = makeEventExprId(this.nextEventId++);
        this.events.set(id, { kind: 'pulse', source: 'timeRoot' });
        return id;
    }
    eventWrap(signal) {
        const id = makeEventExprId(this.nextEventId++);
        this.events.set(id, { kind: 'wrap', signal });
        return id;
    }
    eventCombine(events, mode) {
        const id = makeEventExprId(this.nextEventId++);
        this.events.set(id, { kind: 'combine', events, mode });
        return id;
    }
    // ===========================================================================
    // Domains
    // ===========================================================================
    domainGrid(rows, cols) {
        const id = makeDomainId(`domain_${this.nextDomainId++}`);
        const count = rows * cols;
        const elementIds = Array.from({ length: count }, (_, i) => this.seededId(rows * 10000 + cols + i));
        this.domains.set(id, {
            id,
            kind: 'grid',
            count,
            elementIds,
            params: { rows, cols },
        });
        return id;
    }
    domainN(n, seed = 0) {
        const id = makeDomainId(`domain_${this.nextDomainId++}`);
        const elementIds = Array.from({ length: n }, (_, i) => this.seededId(seed * 100000 + n + i));
        this.domains.set(id, {
            id,
            kind: 'n',
            count: n,
            elementIds,
            params: { n, seed },
        });
        return id;
    }
    seededId(seed) {
        // Simple deterministic hash to 8-char alphanumeric
        let h = seed;
        h = ((h >> 16) ^ h) * 0x45d9f3b;
        h = ((h >> 16) ^ h) * 0x45d9f3b;
        h = (h >> 16) ^ h;
        return Math.abs(h).toString(36).slice(0, 8).padStart(8, '0');
    }
    // ===========================================================================
    // Steps
    // ===========================================================================
    stepEvalSig(expr, target) {
        this.steps.push({ kind: 'evalSig', expr, target });
    }
    stepMaterialize(field, domain, target) {
        this.steps.push({ kind: 'materialize', field, domain, target });
    }
    stepRender(domain, position, color, size) {
        this.steps.push({ kind: 'render', domain, position, color, size });
    }
    // ===========================================================================
    // Build - Convert to CompiledProgramIR
    // ===========================================================================
    build() {
        // Convert Maps to dense arrays
        const signalExprs = { nodes: Array.from(this.signals.values()) };
        const fieldExprs = { nodes: Array.from(this.fields.values()) };
        const eventExprs = { nodes: Array.from(this.events.values()) };
        // Build slotMeta with offsets
        const slotMeta = [];
        for (let i = 0; i < this.nextSlotId; i++) {
            const slot = makeValueSlot(i);
            const type = this.slotTypes.get(slot);
            // Default type for slots without explicit type info
            const typeDesc = type
                ? signalTypeToTypeDesc(type)
                : {
                    axes: {
                        domain: 'signal',
                        temporality: 'continuous',
                        perspective: 'global',
                        branch: 'single',
                        identity: { kind: 'none' },
                    },
                    shape: { kind: 'number' },
                };
            slotMeta.push({
                slot,
                storage: 'f64', // v0: all slots use f64 storage
                offset: i, // Direct offset = slot number for now
                type: typeDesc,
            });
        }
        // Find render step to determine output slot
        const renderStep = this.steps.find((s) => s.kind === 'render');
        const outputs = renderStep
            ? [
                {
                    kind: 'renderFrame',
                    slot: makeValueSlot(0), // Placeholder - will be fixed when we track render output
                },
            ]
            : [];
        // Minimal debug index
        const debugIndex = {
            stepToBlock: new Map(),
            slotToBlock: new Map(),
            ports: [],
            slotToPort: new Map(),
        };
        // Build schedule (for now, just wrap legacy steps)
        const schedule = {
            timeModel: this.timeModel,
            steps: this.steps,
            domains: this.domains,
        };
        return {
            irVersion: 1,
            signalExprs,
            fieldExprs,
            eventExprs,
            constants: { json: [] },
            schedule: schedule, // TODO: proper ScheduleIR type
            outputs,
            slotMeta,
            debugIndex,
        };
    }
    // ===========================================================================
    // Legacy compatibility methods (for gradual migration)
    // ===========================================================================
    /** Get domains map (for runtime that still needs it) */
    getDomains() {
        return new Map(this.domains);
    }
    /** Get signals map (for runtime that still needs it) */
    getSignals() {
        return new Map(this.signals);
    }
    /** Get fields map (for runtime that still needs it) */
    getFields() {
        return new Map(this.fields);
    }
    /** Get slot count (for runtime state initialization) */
    getSlotCount() {
        return this.nextSlotId;
    }
}
