/**
 * IR Builder
 *
 * Provides a clean API for emitting IR nodes during compilation.
 * Handles ID allocation and expression deduplication.
 */

import type { SignalType } from '../../core/canonical-types';
import { signalTypeSignal, signalTypeStatic } from '../../core/canonical-types';
import {
  domainId as makeDomainId,
  valueSlot as makeValueSlot,
  sigExprId as makeSigExprId,
  fieldExprId as makeFieldExprId,
  eventExprId as makeEventExprId,
  type DomainId,
  type EventExprId,
  type FieldExprId,
  type SigExprId,
  type ValueSlot,
} from './Indices';
import type {
  CompiledProgramIR,
  SlotMetaEntry,
  DebugIndexIR,
  OutputSpecIR,
  ValueSlot as IRValueSlot,
  BlockId,
  StepId,
} from './program';
import type {
  DomainDef,
  EventExpr,
  FieldExpr,
  OpCode,
  PureFn,
  SigExpr,
  Step,
  TimeModel,
} from './types';

export class IRBuilder {
  private signals = new Map<SigExprId, SigExpr>();
  private fields = new Map<FieldExprId, FieldExpr>();
  private events = new Map<EventExprId, EventExpr>();
  private domains = new Map<DomainId, DomainDef>();
  private steps: Step[] = [];

  private nextSigId = 0;
  private nextFieldId = 0;
  private nextEventId = 0;
  private nextDomainId = 0;
  private nextSlotId = 0;

  private timeModel: TimeModel = { kind: 'infinite' };

  // Track slot types for slotMeta generation
  private slotTypes = new Map<ValueSlot, SignalType>();

  // Track debug provenance for DoD compliance
  private stepToBlock = new Map<StepId, BlockId>(); // StepId → BlockId
  private slotToBlock = new Map<ValueSlot, BlockId>(); // ValueSlot → BlockId

  // Track the output slot for the render frame
  private renderOutputSlot: ValueSlot | null = null;

  // ===========================================================================
  // Time Model
  // ===========================================================================

  setTimeModel(model: TimeModel): void {
    this.timeModel = model;
  }

  // ===========================================================================
  // Slot Allocation
  // ===========================================================================

  allocSlot(): ValueSlot {
    return makeValueSlot(this.nextSlotId++);
  }

  /** Allocate a typed value slot (tracking type for slotMeta) */
  allocTypedSlot(type: SignalType, _label?: string): ValueSlot {
    const slot = makeValueSlot(this.nextSlotId++);
    this.slotTypes.set(slot, type);
    return slot;
  }

  // ===========================================================================
  // Signal Expressions
  // ===========================================================================

  sigConst(value: number | string | boolean, type: SignalType): SigExprId {
    const id = makeSigExprId(this.nextSigId++);
    this.signals.set(id, { kind: 'const', value, type });
    return id;
  }

  sigSlot(slot: ValueSlot, type: SignalType): SigExprId {
    const id = makeSigExprId(this.nextSigId++);
    this.signals.set(id, { kind: 'slot', slot, type });
    return id;
  }

  sigTime(which: 'tMs' | 'phaseA' | 'phaseB' | 'dt' | 'pulse' | 'progress', type: SignalType): SigExprId {
    const id = makeSigExprId(this.nextSigId++);
    this.signals.set(id, { kind: 'time', which, type });
    return id;
  }

  sigExternal(which: 'mouseX' | 'mouseY' | 'mouseOver', type: SignalType): SigExprId {
    const id = makeSigExprId(this.nextSigId++);
    this.signals.set(id, { kind: 'external', which, type });
    return id;
  }

  sigMap(input: SigExprId, fn: PureFn, type: SignalType): SigExprId {
    const id = makeSigExprId(this.nextSigId++);
    this.signals.set(id, { kind: 'map', input, fn, type });
    return id;
  }

  sigZip(inputs: readonly SigExprId[], fn: PureFn, type: SignalType): SigExprId {
    const id = makeSigExprId(this.nextSigId++);
    this.signals.set(id, { kind: 'zip', inputs, fn, type });
    return id;
  }

  /**
   * Binary operation helper - creates a sig expression that zips two inputs with an opcode.
   */
  sigBinOp(a: SigExprId, b: SigExprId, opcode: OpCode, type: SignalType): SigExprId {
    return this.sigZip([a, b], { kind: 'opcode', opcode }, type);
  }

  /**
   * Unary operation helper - creates a sig expression that maps a single input with an opcode.
   */
  sigUnaryOp(input: SigExprId, opcode: OpCode, type: SignalType): SigExprId {
    return this.sigMap(input, { kind: 'opcode', opcode }, type);
  }
  /**
   * Look up the SigExpr for a given SigExprId.
   * Used by blocks that need to introspect expression structure.
   */
  getSigExpr(id: SigExprId): SigExpr | undefined {
    return this.signals.get(id);
  }

  /**
   * Look up the type for a signal expression.
   */
  getSigExprType(id: SigExprId): SignalType | undefined {
    const expr = this.signals.get(id);
    return expr?.type;
  }

  /**
   * Resolve a SigExprId to its slot, if it exists.
   * Returns undefined if the signal is not a slot reference.
   */
  resolveSigSlot(id: SigExprId): ValueSlot | undefined {
    const expr = this.signals.get(id);
    if (expr?.kind === 'slot') {
      return expr.slot;
    }
    return undefined;
  }

  // ===========================================================================
  // Field Expressions
  // ===========================================================================

  /**
   * Create a constant field expression.
   * Note: FieldExprConst has no domain field - domain is inferred from usage context.
   */
  fieldConst(value: number | string, type: SignalType): FieldExprId {
    const id = makeFieldExprId(this.nextFieldId++);
    this.fields.set(id, { kind: 'const', value, type });
    return id;
  }

  /**
   * Create a field source expression (e.g., position, index).
   * This is one of the few field expressions that explicitly stores a domain.
   */
  fieldSource(
    domain: DomainId,
    sourceId: 'pos0' | 'idRand' | 'index' | 'normalizedIndex',
    type: SignalType
  ): FieldExprId {
    const id = makeFieldExprId(this.nextFieldId++);
    this.fields.set(id, { kind: 'source', domain, sourceId, type });
    return id;
  }

  /**
   * Broadcast a signal to a field.
   * Note: No explicit domain field - domain comes from materialization context.
   */
  fieldBroadcast(signal: SigExprId, type: SignalType): FieldExprId {
    const id = makeFieldExprId(this.nextFieldId++);
    this.fields.set(id, { kind: 'broadcast', signal, type });
    return id;
  }

  /**
   * Map a function over a field expression.
   * Domain is inherited from the input field.
   */
  fieldMap(input: FieldExprId, fn: PureFn, type: SignalType): FieldExprId {
    const id = makeFieldExprId(this.nextFieldId++);
    this.fields.set(id, { kind: 'map', input, fn, type });
    return id;
  }

  /**
   * Zip multiple field expressions together.
   * Domain must be consistent across all inputs (enforced at compile time).
   */
  fieldZip(inputs: readonly FieldExprId[], fn: PureFn, type: SignalType): FieldExprId {
    const id = makeFieldExprId(this.nextFieldId++);
    this.fields.set(id, { kind: 'zip', inputs, fn, type });
    return id;
  }

  /**
   * Zip a field with signals.
   * Domain comes from the field input.
   */
  fieldZipSig(
    field: FieldExprId,
    signals: readonly SigExprId[],
    fn: PureFn,
    type: SignalType
  ): FieldExprId {
    const id = makeFieldExprId(this.nextFieldId++);
    this.fields.set(id, { kind: 'zipSig', field, signals, fn, type });
    return id;
  }

  /**
   * Map over domain indices with optional signal inputs.
   * This creates a field from scratch, so domain must be explicit.
   */
  fieldMapIndexed(
    domain: DomainId,
    fn: PureFn,
    type: SignalType,
    signals?: readonly SigExprId[]
  ): FieldExprId {
    const id = makeFieldExprId(this.nextFieldId++);
    this.fields.set(id, { kind: 'mapIndexed', domain, fn, type, signals });
    return id;
  }

  /**
   * Legacy alias for fieldSource with sourceId='index'.
   * Kept for backward compatibility with existing blocks.
   */
  fieldIndex(domain: DomainId, type: SignalType): FieldExprId {
    return this.fieldSource(domain, 'index', type);
  }

  /**
   * Legacy alias for fieldBroadcast that accepted domain parameter.
   * Domain parameter is ignored - kept for API compatibility during migration.
   */
  fieldSlot(slot: ValueSlot, _domain: DomainId, type: SignalType): FieldExprId {
    // Note: FieldExpr types don't have a 'slot' kind, this may need review
    // For now, throw an error to catch usage
    throw new Error('fieldSlot is not implemented - use fieldSource or fieldBroadcast instead');
  }

  // ===========================================================================
  // Event Expressions
  // ===========================================================================

  eventPulse(): EventExprId {
    const id = makeEventExprId(this.nextEventId++);
    this.events.set(id, { kind: 'pulse', source: 'timeRoot' });
    return id;
  }

  eventWrap(signal: SigExprId): EventExprId {
    const id = makeEventExprId(this.nextEventId++);
    this.events.set(id, { kind: 'wrap', signal });
    return id;
  }

  eventCombine(
    events: readonly EventExprId[],
    mode: 'any' | 'all'
  ): EventExprId {
    const id = makeEventExprId(this.nextEventId++);
    this.events.set(id, { kind: 'combine', events, mode });
    return id;
  }

  // ===========================================================================
  // Domains
  // ===========================================================================

  domainGrid(rows: number, cols: number): DomainId {
    const id = makeDomainId(`domain_${this.nextDomainId++}`);
    const count = rows * cols;
    const elementIds = Array.from({ length: count }, (_, i) =>
      this.seededId(rows * 10000 + cols + i)
    );
    this.domains.set(id, {
      id,
      kind: 'grid',
      count,
      elementIds,
      params: { rows, cols },
    });
    return id;
  }

  domainN(n: number, seed: number = 0): DomainId {
    const id = makeDomainId(`domain_${this.nextDomainId++}`);
    const elementIds = Array.from({ length: n }, (_, i) =>
      this.seededId(seed * 100000 + n + i)
    );
    this.domains.set(id, {
      id,
      kind: 'n',
      count: n,
      elementIds,
      params: { n, seed },
    });
    return id;
  }

  private seededId(seed: number): string {
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

  stepEvalSig(expr: SigExprId, target: ValueSlot, sourceBlock?: BlockId): void {
    const stepId = this.steps.length as StepId;
    this.steps.push({ kind: 'evalSig', expr, target });

    // Track debug provenance
    if (sourceBlock !== undefined) {
      this.stepToBlock.set(stepId, sourceBlock);
      this.slotToBlock.set(target, sourceBlock);
    }
  }

  stepMaterialize(
    field: FieldExprId,
    domain: DomainId,
    target: ValueSlot,
    sourceBlock?: BlockId
  ): void {
    const stepId = this.steps.length as StepId;
    this.steps.push({ kind: 'materialize', field, domain, target });

    // Track debug provenance
    if (sourceBlock !== undefined) {
      this.stepToBlock.set(stepId, sourceBlock);
      this.slotToBlock.set(target, sourceBlock);
    }
  }

  stepRender(
    domain: DomainId,
    position: FieldExprId,
    color: FieldExprId,
    size?: SigExprId | FieldExprId,
    sourceBlock?: BlockId
  ): void {
    const stepId = this.steps.length as StepId;
    this.steps.push({ kind: 'render', domain, position, color, size });

    // Track debug provenance
    if (sourceBlock !== undefined) {
      this.stepToBlock.set(stepId, sourceBlock);
    }
  }

  // ===========================================================================
  // Build - Convert to CompiledProgramIR
  // ===========================================================================

  build(): CompiledProgramIR {
    // Convert Maps to dense arrays
    const signalExprs = { nodes: Array.from(this.signals.values()) };
    const fieldExprs = { nodes: Array.from(this.fields.values()) };
    const eventExprs = { nodes: Array.from(this.events.values()) };

    // Allocate a slot for the render output if we have a render step
    const renderStep = this.steps.find((s) => s.kind === 'render');
    if (renderStep && !this.renderOutputSlot) {
      // Allocate an object slot for RenderFrameIR
      this.renderOutputSlot = makeValueSlot(this.nextSlotId++);
    }

    // Build slotMeta with offsets
    const slotMeta: SlotMetaEntry[] = [];

    // Count slots per storage class to compute offsets
    const slotsByStorage: Map<'f64' | 'object', ValueSlot[]> = new Map([
      ['f64', []],
      ['object', []],
    ]);

    for (let i = 0; i < this.nextSlotId; i++) {
      const slot = makeValueSlot(i) as IRValueSlot;

      // Determine storage class
      // RenderOutputSlot is always object storage
      const storage = slot === this.renderOutputSlot ? 'object' : 'f64';
      slotsByStorage.get(storage)!.push(slot);
    }

    // Build slotMeta with proper offsets per storage class
    for (let i = 0; i < this.nextSlotId; i++) {
      const slot = makeValueSlot(i) as IRValueSlot;
      const type = this.slotTypes.get(slot);

      // Determine storage and offset
      const storage = slot === this.renderOutputSlot ? 'object' : 'f64';
      const slotsInStorage = slotsByStorage.get(storage)!;
      const offset = slotsInStorage.indexOf(slot);

      // Default type for slots without explicit type info
      let signalType: SignalType;
      if (slot === this.renderOutputSlot) {
        // RenderFrameIR object type - use static type for objects
        signalType = signalTypeStatic('float'); // Placeholder - objects don't have a payload type
      } else if (type) {
        // Use the tracked type
        signalType = type;
      } else {
        // Default for untyped slots: signal world, float payload
        signalType = signalTypeSignal('float');
      }

      slotMeta.push({
        slot,
        storage,
        offset,
        type: signalType,
      });
    }

    // Set outputs to the render output slot
    const outputs: OutputSpecIR[] = this.renderOutputSlot
      ? [
          {
            kind: 'renderFrame',
            slot: this.renderOutputSlot as IRValueSlot,
          },
        ]
      : [];

    // Build debug index with provenance (cast Maps to satisfy type)
    const debugIndex: DebugIndexIR = {
      stepToBlock: new Map(this.stepToBlock) as ReadonlyMap<StepId, BlockId>,
      slotToBlock: new Map(this.slotToBlock) as ReadonlyMap<ValueSlot, BlockId>,
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
      schedule,
      outputs,
      slotMeta,
      debugIndex,
    };
  }
}
