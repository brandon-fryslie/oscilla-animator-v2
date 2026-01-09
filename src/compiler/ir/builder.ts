/**
 * IR Builder
 *
 * Provides a clean API for emitting IR nodes during compilation.
 * Handles ID allocation and expression deduplication.
 */

import type { SignalType } from '../../core/canonical-types';
import { signalTypeToTypeDesc } from './bridge';
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

  sigTime(
    which: 't' | 'dt' | 'phase' | 'pulse' | 'energy',
    type: SignalType
  ): SigExprId {
    const id = makeSigExprId(this.nextSigId++);
    this.signals.set(id, { kind: 'time', which, type });
    return id;
  }

  sigExternal(
    which: 'mouseX' | 'mouseY' | 'mouseOver',
    type: SignalType
  ): SigExprId {
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

  // Convenience: binary op
  sigBinOp(a: SigExprId, b: SigExprId, op: OpCode, type: SignalType): SigExprId {
    return this.sigZip([a, b], { kind: 'opcode', opcode: op }, type);
  }

  // Convenience: unary op
  sigUnaryOp(input: SigExprId, op: OpCode, type: SignalType): SigExprId {
    return this.sigMap(input, { kind: 'opcode', opcode: op }, type);
  }

  // ===========================================================================
  // Field Expressions
  // ===========================================================================

  fieldConst(value: number | string, type: SignalType): FieldExprId {
    const id = makeFieldExprId(this.nextFieldId++);
    this.fields.set(id, { kind: 'const', value, type });
    return id;
  }

  fieldSource(
    domain: DomainId,
    sourceId: 'pos0' | 'idRand' | 'index' | 'normalizedIndex',
    type: SignalType
  ): FieldExprId {
    const id = makeFieldExprId(this.nextFieldId++);
    this.fields.set(id, { kind: 'source', domain, sourceId, type });
    return id;
  }

  fieldBroadcast(signal: SigExprId, type: SignalType): FieldExprId {
    const id = makeFieldExprId(this.nextFieldId++);
    this.fields.set(id, { kind: 'broadcast', signal, type });
    return id;
  }

  fieldMap(input: FieldExprId, fn: PureFn, type: SignalType): FieldExprId {
    const id = makeFieldExprId(this.nextFieldId++);
    this.fields.set(id, { kind: 'map', input, fn, type });
    return id;
  }

  fieldZip(
    inputs: readonly FieldExprId[],
    fn: PureFn,
    type: SignalType
  ): FieldExprId {
    const id = makeFieldExprId(this.nextFieldId++);
    this.fields.set(id, { kind: 'zip', inputs, fn, type });
    return id;
  }

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
      let typeDesc;
      if (slot === this.renderOutputSlot) {
        // RenderFrameIR object type
        typeDesc = {
          axes: {
            domain: 'value' as const,
            temporality: 'discrete' as const,
            perspective: 'frame' as const,
            branch: 'single' as const,
            identity: { kind: 'none' as const },
          },
          shape: { kind: 'object' as const, class: 'RenderFrameIR' },
        };
      } else if (type) {
        typeDesc = signalTypeToTypeDesc(type);
      } else {
        // Default for untyped slots
        typeDesc = {
          axes: {
            domain: 'signal' as const,
            temporality: 'continuous' as const,
            perspective: 'global' as const,
            branch: 'single' as const,
            identity: { kind: 'none' as const },
          },
          shape: { kind: 'number' as const },
        };
      }

      slotMeta.push({
        slot,
        storage,
        offset,
        type: typeDesc,
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
      schedule: schedule as any, // TODO: proper ScheduleIR type
      outputs,
      slotMeta,
      debugIndex,
    };
  }

  // ===========================================================================
  // Legacy compatibility methods (for gradual migration)
  // ===========================================================================

  /** Get domains map (for runtime that still needs it) */
  getDomains(): ReadonlyMap<DomainId, DomainDef> {
    return new Map(this.domains);
  }

  /** Get signals map (for runtime that still needs it) */
  getSignals(): ReadonlyMap<SigExprId, SigExpr> {
    return new Map(this.signals);
  }

  /** Get fields map (for runtime that still needs it) */
  getFields(): ReadonlyMap<FieldExprId, FieldExpr> {
    return new Map(this.fields);
  }

  /** Get slot count (for runtime state initialization) */
  getSlotCount(): number {
    return this.nextSlotId;
  }
}
