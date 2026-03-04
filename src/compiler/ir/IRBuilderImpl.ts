/**
 * IRBuilder Implementation
 *
 * Implements the IRBuilder interface for constructing IR expressions.
 * All methods return ValueExprId — the ONE index type for the unified valueExprs table.
 */

import type { CanonicalType, ConstValue } from '../../core/canonical-types';
import type {
  ValueExprId,
  EventSlotId,
  ValueSlot,
  StateSlotId,
  InstanceId,
  DomainTypeId,
} from './Indices';
import type { BlockId } from '../../types/compiler';
import {
  PathVerb,
  type AbstractTopologyDef,
  type PathSegmentKind,
  type PathTopologyDef,
  type PathTopologyDefInput,
  type SerializableTopologyDef,
  type TopologyId,
} from '../../shapes/types';
import type { TimeModelIR } from './schedule';
import type {
  PureFn,
  InstanceDecl,
  InstanceCountSpec,
  Step,
  IntrinsicPropertyName,
  PlacementFieldName,
  BasisKind,
  ContinuityPolicy,
  StableStateId,
  StateMapping,
} from './types';
import { OpCode } from './types';
import type { CameraDeclIR } from './program';
import type { ValueExpr } from './value-expr';
import type { OrchestratorIRBuilder } from './OrchestratorIRBuilder';
import { valueExprId, SCALAR_INSTANCE_ID } from './Indices';
import { domainTypeId } from '../../core/ids';
import { canonicalType, canonicalEvent, FLOAT, unitNone, payloadStride, requireInst } from '../../core/canonical-types';

/**
 * IRBuilderImpl - Implements OrchestratorIRBuilder (full surface)
 *
 * This class implements the complete builder interface including allocation,
 * registration, and schedule emission. It is used by orchestrator code.
 *
 * When passing to blocks, upcast to BlockIRBuilder to restrict the surface.
 */
export class IRBuilderImpl implements OrchestratorIRBuilder {
  private valueExprs: ValueExpr[] = [];
  private valueExprCache = new Map<string, ValueExprId>();
  private steps: Step[] = [];
  private stateMappings: StateMapping[] = [];
  private slotCounter = 1; // Reserve slot 0 for SYSTEM_PALETTE_SLOT
  private stateSlotCounter = 0;
  private eventSlotCounter = 0;
  private instanceCounter = 0;
  private instances = new Map<InstanceId, InstanceDecl>();
  private scalarSlots = new Map<number, ValueSlot>();
  private fieldSlots = new Map<number, ValueSlot>();
  private eventSlots = new Map<ValueExprId, EventSlotId>();
  private slotLayoutInputs = new Map<ValueSlot, { type: CanonicalType; stride: number }>();
  private schedule: TimeModelIR = { periodAMs: 10000, periodBMs: 10000 };
  private renderGlobals: CameraDeclIR[] = [];
  private _currentBlockId: BlockId | null = null;
  private _exprToBlock = new Map<ValueExprId, BlockId>();
  private readonly topologyByShapeSignature = new Map<string, TopologyId>();
  private readonly topologiesById = new Map<TopologyId, SerializableTopologyDef>();
  private nextTopologyId = 100;

  constructor() {
    // [LAW:one-source-of-truth] SCALAR_INSTANCE_ID is always registered with count=1.
    // Every compiled program has a scalar context for cardinality-one materialization.
    // StepMaterialize steps referencing scalar expressions use SCALAR_INSTANCE_ID so the
    // executor's instances.get() lookup yields count=1 via the standard field-materialization path.
    this.instances.set(SCALAR_INSTANCE_ID, {
      id: SCALAR_INSTANCE_ID,
      domainType: domainTypeId('__scalar__'),
      count: 1,
      maxCount: 1,
      lifecycle: 'static',
      identityMode: 'none',
    });
  }

  // ===========================================================================
  // Value Expression Construction
  // ===========================================================================

  constant(value: ConstValue, type: CanonicalType): ValueExprId {
    return this.pushExpr({ kind: 'const', type, value });
  }

  constantWithKey(value: ConstValue, type: CanonicalType, key: string): ValueExprId {
    const expr: ValueExpr = { kind: 'const', type, value };
    // Include key in dedup hash so same-value constants from different origins stay separate
    const hash = JSON.stringify({ ...expr, _key: key });
    const existing = this.valueExprCache.get(hash);
    if (existing !== undefined) return existing;
    const id = valueExprId(this.valueExprs.length);
    this.valueExprs.push(expr);
    this.valueExprCache.set(hash, id);
    if (this._currentBlockId !== null) {
      this._exprToBlock.set(id, this._currentBlockId);
    }
    return id;
  }

  // REMOVED 2026-02-06: slotRead() - dead code, never called in production
  // Extract expressions handle component access directly

  time(which: 'tMs' | 'phaseA' | 'phaseB' | 'dt' | 'progress' | 'palette' | 'energy', type: CanonicalType): ValueExprId {
    return this.pushExpr({ kind: 'time', type, which });
  }

  external(channel: string, type: CanonicalType): ValueExprId {
    return this.pushExpr({ kind: 'external', type, channel });
  }

  /**
   * Cardinality-safe unary map: auto-broadcasts one→many when needed.
   * Blocks use this via BlockIRBuilder.mapAuto().
   */
  mapAuto(input: ValueExprId, fn: PureFn, type: CanonicalType): ValueExprId {
    const outCard = requireInst(type.extent.cardinality, 'cardinality').kind;
    const inCard = this.cardKindOf(input);
    if (outCard === 'many' && inCard !== 'many') {
      const inputExpr = this.valueExprs[input];
      if (!inputExpr) {
        throw new Error(`IRBuilder.mapAuto: invalid input id=${input}`);
      }
      const broadcastType: CanonicalType = {
        payload: inputExpr.type.payload,
        unit: inputExpr.type.unit,
        extent: type.extent,
      };
      const broadcasted = this.broadcast(input, broadcastType);
      return this.kernelMap(broadcasted, fn, type);
    }
    return this.kernelMap(input, fn, type);
  }

  /**
   * Cardinality-safe n-ary zip: auto-broadcasts/uses zipPromote when inputs have mixed cardinality.
   * Blocks use this via BlockIRBuilder.zipAuto().
   */
  zipAuto(inputs: readonly ValueExprId[], fn: PureFn, type: CanonicalType): ValueExprId {
    const outCard = requireInst(type.extent.cardinality, 'cardinality');

    if (outCard.kind !== 'many') {
      // One/zero output — all inputs must be non-field, delegate directly
      return this.kernelZip(inputs, fn, type);
    }

    // Output is field (many). Partition inputs into fields vs ones.
    const fieldIds: ValueExprId[] = [];
    const oneIds: ValueExprId[] = [];
    for (const id of inputs) {
      const card = this.cardKindOf(id);
      if (card === 'many') {
        fieldIds.push(id);
      } else {
        oneIds.push(id);
      }
    }

    if (oneIds.length === 0) {
      // All inputs are fields — plain zip
      return this.kernelZip(inputs, fn, type);
    }

    const hasCompositeOneInput = oneIds.some((id) => {
      const expr = this.valueExprs[id];
      return !!expr && payloadStride(expr.type.payload) > 1;
    });

    if (fieldIds.length === 1 && !hasCompositeOneInput) {
      // Exactly one field + N ones → kernelZipPromote
      return this.kernelZipPromote(fieldIds[0], oneIds, fn, type);
    }

    // Multiple fields + ones → broadcast ones to field extent, then zip all
    const aligned = inputs.map((id) => {
      const card = this.cardKindOf(id);
      if (card === 'many') return id;
      const expr = this.valueExprs[id];
      if (!expr) {
        throw new Error(`IRBuilder.zipAuto: invalid input id=${id}`);
      }
      const broadcastType: CanonicalType = {
        payload: expr.type.payload,
        unit: expr.type.unit,
        extent: type.extent,
      };
      return this.broadcast(id, broadcastType);
    });
    return this.kernelZip(aligned, fn, type);
  }

  /**
   * Raw kernel map — internal only (not on BlockIRBuilder).
   * Throws on cardinality mismatch. Used by mapAuto, combine, kernelZipPromote.
   */
  kernelMap(input: ValueExprId, fn: PureFn, type: CanonicalType): ValueExprId {
    const outCard = requireInst(type.extent.cardinality, 'cardinality').kind;
    const inCard = this.cardKindOf(input);
    if ((outCard === 'many') !== (inCard === 'many')) {
      throw new Error(
        `IRBuilder.kernelMap: cardinality mismatch — output=${outCard} but input=${inCard} (input id=${input})`
      );
    }
    return this.pushExpr({ kind: 'kernel', type, kernelKind: 'map', input, fn });
  }

  kernelZip(inputs: readonly ValueExprId[], fn: PureFn, type: CanonicalType): ValueExprId {
    const outCard = requireInst(type.extent.cardinality, 'cardinality').kind;
    if (outCard === 'many') {
      for (const id of inputs) {
        const inCard = this.cardKindOf(id);
        if (inCard !== 'many') {
          throw new Error(
            `IRBuilder.kernelZip: output is many but input id=${id} is ${inCard} — use kernelZipPromote for mixed cardinality`
          );
        }
      }
    } else {
      for (const id of inputs) {
        const inCard = this.cardKindOf(id);
        if (inCard === 'many') {
          throw new Error(
            `IRBuilder.kernelZip: output is ${outCard} but input id=${id} is many — field inputs require many output`
          );
        }
      }
    }
    return this.pushExpr({ kind: 'kernel', type, kernelKind: 'zip', inputs, fn });
  }

  kernelZipPromote(field: ValueExprId, ones: readonly ValueExprId[], fn: PureFn, type: CanonicalType): ValueExprId {
    const outCard = requireInst(type.extent.cardinality, 'cardinality').kind;
    if (outCard !== 'many') {
      throw new Error(
        `IRBuilder.kernelZipPromote: output must be many, got ${outCard}`
      );
    }
    const fieldCard = this.cardKindOf(field);
    if (fieldCard !== 'many') {
      throw new Error(
        `IRBuilder.kernelZipPromote: field input id=${field} must be many, got ${fieldCard}`
      );
    }
    for (const id of ones) {
      const inputCard = this.cardKindOf(id);
      if (inputCard === 'many') {
        throw new Error(
        `IRBuilder.kernelZipPromote: one input id=${id} must not be many — use kernelZip for all-many inputs`
        );
      }
    }
    return this.pushExpr({ kind: 'kernel', type, kernelKind: 'zipPromote', field, ones, fn });
  }

  broadcast(one: ValueExprId, type: CanonicalType, oneComponents?: readonly ValueExprId[]): ValueExprId {
    const outCard = requireInst(type.extent.cardinality, 'cardinality').kind;
    if (outCard !== 'many') {
      throw new Error(
        `IRBuilder.broadcast: output must be many, got ${outCard}`
      );
    }
    const inputCard = this.cardKindOf(one);
    if (inputCard === 'many') {
      throw new Error(
        `IRBuilder.broadcast: one input id=${one} must not be many (already many)`
      );
    }
    let resolvedComponents = oneComponents;
    const oneExpr = this.valueExprs[one];
    if (!resolvedComponents && oneExpr && payloadStride(oneExpr.type.payload) > 1) {
      // [LAW:one-source-of-truth] Multi-component one-cardinality broadcasts must carry
      // explicit component ids so runtime materialization preserves vector structure.
      const componentCount = payloadStride(oneExpr.type.payload);
      const componentType: CanonicalType = {
        payload: FLOAT,
        unit: oneExpr.type.unit,
        extent: oneExpr.type.extent,
      };
      const components: ValueExprId[] = [];
      for (let i = 0; i < componentCount; i++) {
        components.push(this.extract(one, i, componentType));
      }
      resolvedComponents = components;
    }
    return this.pushExpr({ kind: 'kernel', type, kernelKind: 'broadcast', one, oneComponents: resolvedComponents });
  }

  reduce(field: ValueExprId, op: 'min' | 'max' | 'sum' | 'avg', type: CanonicalType): ValueExprId {
    const outCard = requireInst(type.extent.cardinality, 'cardinality').kind;
    if (outCard !== 'one') {
      throw new Error(
        `IRBuilder.reduce: output must be one, got ${outCard}`
      );
    }
    const fieldCard = this.cardKindOf(field);
    if (fieldCard !== 'many') {
      throw new Error(
        `IRBuilder.reduce: field input id=${field} must be many, got ${fieldCard}`
      );
    }
    return this.pushExpr({ kind: 'kernel', type, kernelKind: 'reduce', field, op });
  }

  intrinsic(intrinsic: IntrinsicPropertyName, type: CanonicalType): ValueExprId {
    return this.pushExpr({ kind: 'intrinsic', type, intrinsicKind: 'property', intrinsic });
  }

  placement(field: PlacementFieldName, basisKind: BasisKind, type: CanonicalType): ValueExprId {
    return this.pushExpr({ kind: 'intrinsic', type, intrinsicKind: 'placement', field, basisKind });
  }

  stateRead(stateKey: StableStateId, type: CanonicalType): ValueExprId {
    return this.pushExpr({ kind: 'state', type, stateKey });
  }

  eventRead(eventExpr: ValueExprId): ValueExprId {
    // Look up or allocate event slot
    let slot = this.eventSlots.get(eventExpr);
    if (!slot) {
      // Auto-allocate event slot if not yet allocated
      const autoSlot = eventSlotId(this.eventSlotCounter++);
      this.eventSlots.set(eventExpr, autoSlot);
      return this.pushExpr({ kind: 'eventRead', eventSlot: autoSlot, type: canonicalType(FLOAT, unitNone()) });
    }
    return this.pushExpr({ kind: 'eventRead', eventSlot: slot, type: canonicalType(FLOAT, unitNone()) });
  }

  pathDerivative(input: ValueExprId, op: 'tangent' | 'arcLength', topologyId: TopologyId, type: CanonicalType): ValueExprId {
    const outCard = requireInst(type.extent.cardinality, 'cardinality').kind;
    if (outCard !== 'many') {
      throw new Error(
        `IRBuilder.pathDerivative: output must be many, got ${outCard}`
      );
    }
    const inCard = this.cardKindOf(input);
    if (inCard !== 'many') {
      throw new Error(
        `IRBuilder.pathDerivative: input id=${input} must be many, got ${inCard}`
      );
    }
    return this.pushExpr({ kind: 'kernel', kernelKind: 'pathDerivative', field: input, op, topologyId, type });
  }

  pathSample(controlPoints: ValueExprId, tField: ValueExprId, topologyId: TopologyId, op: 'position' | 'tangentAngle', type: CanonicalType): ValueExprId {
    const outCard = requireInst(type.extent.cardinality, 'cardinality').kind;
    if (outCard !== 'many') {
      throw new Error(
        `IRBuilder.pathSample: output must be many, got ${outCard}`
      );
    }
    const cpCard = this.cardKindOf(controlPoints);
    if (cpCard !== 'many') {
      throw new Error(
        `IRBuilder.pathSample: controlPoints id=${controlPoints} must be many, got ${cpCard}`
      );
    }
    const tCard = this.cardKindOf(tField);
    if (tCard !== 'many') {
      throw new Error(
        `IRBuilder.pathSample: tField id=${tField} must be many, got ${tCard}`
      );
    }
    return this.pushExpr({ kind: 'kernel', kernelKind: 'pathSample', controlPoints, tField, topologyId, op, type });
  }

  shapeRef(
    topologyId: TopologyId,
    paramArgs: readonly ValueExprId[],
    type: CanonicalType,
    controlPointField?: ValueExprId
  ): ValueExprId {
    return this.pushExpr({ kind: 'shapeRef', type, topologyId, paramArgs, controlPointField });
  }

  registerTopology(topology: AbstractTopologyDef | PathTopologyDefInput, _debugName?: string): TopologyId {
    const normalized = toSerializableTopologyShape(topology);
    const shapeSignature = topologyShapeSignature(normalized);
    const existingId = this.topologyByShapeSignature.get(shapeSignature);
    if (existingId !== undefined) {
      return existingId;
    }

    const nextId = this.nextTopologyId as TopologyId;
    this.nextTopologyId += 1;
    const definition: SerializableTopologyDef = { ...normalized, id: nextId };
    // [LAW:one-source-of-truth] Compiler-owned topology registration is scoped
    // to this builder instance; no global mutable topology registry writes.
    this.topologyByShapeSignature.set(shapeSignature, nextId);
    this.topologiesById.set(nextId, definition);
    return nextId;
  }

  combine(
    inputs: readonly ValueExprId[],
    mode: 'sum' | 'average' | 'max' | 'min' | 'last' | 'product',
    type: CanonicalType
  ): ValueExprId {
    // Map combine modes to zip functions
    const fnMap: Record<typeof mode, PureFn> = {
      sum: { kind: 'opcode', opcode: OpCode.Add },
      average: { kind: 'opcode', opcode: OpCode.Avg },
      max: { kind: 'opcode', opcode: OpCode.Max },
      min: { kind: 'opcode', opcode: OpCode.Min },
      last: { kind: 'opcode', opcode: OpCode.Last },
      product: { kind: 'opcode', opcode: OpCode.Mul },
    };
    // Delegate to zipAuto so mixed cardinality is handled
    return this.zipAuto(inputs, fnMap[mode], type);
  }

  // ===========================================================================
  // Structural Operations
  // ===========================================================================

  extract(input: ValueExprId, componentIndex: number, type: CanonicalType): ValueExprId {
    const inputExpr = this.valueExprs[input as number];
    if (!inputExpr) {
      throw new Error(`IRBuilder.extract: invalid input id=${input}`);
    }
    if (inputExpr?.kind === 'construct') {
      const componentExpr = inputExpr.components[componentIndex];
      if (componentExpr === undefined) {
        throw new Error(
          `IRBuilder.extract: component ${componentIndex} out of range for construct ${input} (components=${inputExpr.components.length})`
        );
      }
      // [LAW:one-source-of-truth] Reuse canonical component expressions directly
      // instead of manufacturing extra extract nodes that require slot mapping.
      return componentExpr;
    }

    const stride = payloadStride(inputExpr.type.payload);
    if (stride === 1) {
      if (componentIndex !== 0) {
        throw new Error(
          `IRBuilder.extract: component ${componentIndex} out of range for scalar input ${input}`
        );
      }
      // [LAW:one-source-of-truth] Scalar extract(0) is identity and must be
      // canonicalized at IR construction, not deferred to runtime.
      return input;
    }

    if (inputExpr.kind === 'const') {
      const source = inputExpr.value;
      if (
        source.kind === 'vec2' ||
        source.kind === 'vec3' ||
        source.kind === 'vec4' ||
        source.kind === 'color'
      ) {
        const componentValue = source.value[componentIndex];
        if (componentValue === undefined) {
          throw new Error(
            `IRBuilder.extract: component ${componentIndex} out of range for const ${source.kind}`
          );
        }
        // [LAW:one-source-of-truth] Component extraction from const composites is
        // folded into a scalar const expression upstream.
        return this.constant({ kind: 'float', value: componentValue }, type);
      }
    }

    return this.pushExpr({ kind: 'extract', type, input, componentIndex });
  }

  construct(components: readonly ValueExprId[], type: CanonicalType): ValueExprId {
    return this.pushExpr({ kind: 'construct', type, components });
  }

  constructAuto(components: readonly ValueExprId[], type: CanonicalType): ValueExprId {
    const outCard = requireInst(type.extent.cardinality, 'cardinality');
    if (outCard.kind !== 'many') {
      return this.construct(components, type);
    }
    // Auto-broadcast one-cardinality components to field extent
    const aligned = components.map(id => {
      if (this.cardKindOf(id) === 'many') return id;
      const expr = this.valueExprs[id];
      const fieldType: CanonicalType = { payload: expr.type.payload, unit: expr.type.unit, extent: type.extent };
      return this.broadcast(id, fieldType);
    });
    return this.construct(aligned, type);
  }

  hslToRgb(input: ValueExprId, type: CanonicalType): ValueExprId {
    return this.pushExpr({ kind: 'hslToRgb', type, input });
  }

  // ===========================================================================
  // Event Operations
  // ===========================================================================

  eventPulse(source: 'InfiniteTimeRoot'): ValueExprId {
    return this.pushExpr({ kind: 'event', type: canonicalEvent(), eventKind: 'pulse', source: 'timeRoot' });
  }

  eventWrap(input: ValueExprId): ValueExprId {
    return this.pushExpr({ kind: 'event', type: canonicalEvent(), eventKind: 'wrap', input });
  }

  eventCombine(events: readonly ValueExprId[], mode: 'any' | 'all' | 'merge' | 'last', type?: CanonicalType): ValueExprId {
    const actualType = type ?? canonicalEvent();
    const normalizedMode = mode === 'merge' || mode === 'last' ? 'any' : mode;
    return this.pushExpr({ kind: 'event', type: actualType, eventKind: 'combine', inputs: events, mode: normalizedMode });
  }

  eventNever(): ValueExprId {
    return this.pushExpr({ kind: 'event', type: canonicalEvent(), eventKind: 'never' });
  }

  // ===========================================================================
  // Slot Management
  // ===========================================================================

  // ===========================================================================
  // Slot Allocation & Registration (orchestrator-only)
  // ===========================================================================

  allocTypedSlot(type: CanonicalType, label?: string): ValueSlot {
    const slot = this.slotCounter++ as ValueSlot;
    const stride = payloadStride(type.payload);
    this.slotLayoutInputs.set(slot, { type, stride });
    return slot;
  }

  registerSlotType(slot: ValueSlot, type: CanonicalType): void {
    const stride = payloadStride(type.payload);
    this.slotLayoutInputs.set(slot, { type, stride });
  }

  registerScalarSlot(exprId: ValueExprId, slot: ValueSlot): void {
    this.scalarSlots.set(exprId, slot);
  }

  registerFieldSlot(fieldId: ValueExprId, slot: ValueSlot): void {
    this.fieldSlots.set(fieldId, slot);
  }

  allocSlot(): ValueSlot {
    return this.slotCounter++ as ValueSlot;
  }

  allocEventSlot(eventId: ValueExprId): EventSlotId {
    const slot = eventSlotId(this.eventSlotCounter++);
    this.eventSlots.set(eventId, slot);
    return slot;
  }

  // ===========================================================================
  // Steps (orchestrator-only)
  // ===========================================================================

  stepStateWrite(stateSlot: StateSlotId, value: ValueExprId): void {
    this.steps.push({ kind: 'stateWrite', stateSlot, value });
  }

  stepFieldStateWrite(stateSlot: StateSlotId, value: ValueExprId): void {
    this.steps.push({ kind: 'fieldStateWrite', stateSlot, value });
  }

  stepMaterialize(field: ValueExprId, instanceId: InstanceId, target: ValueSlot): void {
    this.steps.push({ kind: 'materialize', field, instanceId, target });
  }

  stepContinuityMapBuild(instanceId: InstanceId): void {
    this.steps.push({
      kind: 'continuityMapBuild',
      instanceId,
      outputMapping: `continuity-map-${instanceId}`
    });
  }

  stepContinuityApply(
    targetKey: string,
    instanceId: InstanceId,
    policy: ContinuityPolicy,
    baseSlot: ValueSlot,
    outputSlot: ValueSlot,
    semantic: 'position' | 'radius' | 'opacity' | 'color' | 'custom',
    stride: number
  ): void {
    this.steps.push({
      kind: 'continuityApply',
      targetKey,
      instanceId,
      policy,
      baseSlot,
      outputSlot,
      semantic,
      stride,
    });
  }

  // ===========================================================================
  // State Slots
  // ===========================================================================

  allocStateSlot(
    stableId: StableStateId,
    options?: {
      initialValue?: number;
      stride?: number;
      instanceId?: InstanceId;
      laneCount?: number;
    }
  ): StateSlotId {
    const slot = stateSlotId(this.stateSlotCounter++);
    const stride = options?.stride ?? 1;
    const initialValue = options?.initialValue ?? 0;
    const initial = Array.from({ length: stride }, () => initialValue);

    if (options?.instanceId !== undefined && options?.laneCount !== undefined) {
      // // [LAW:one-source-of-truth] State mappings use one unified shape; laneCount/instanceId
      // encode cardinality semantics instead of a parallel scalar/field union.
      this.stateMappings.push({
        stateId: stableId,
        slotStart: slot,
        laneCount: options.laneCount,
        stride,
        initial,
        instanceId: options.instanceId,
      });
    } else {
      this.stateMappings.push({
        stateId: stableId,
        slotStart: slot,
        laneCount: 1,
        stride,
        initial,
      });
    }
    return slot;
  }

  /**
   * Look up an already-allocated state slot by symbolic key.
   * Returns undefined if the key has not been allocated yet.
   * Used by effects processing to resolve symbolic state keys in step requests.
   */
  findStateSlot(stableId: StableStateId): StateSlotId | undefined {
    for (const mapping of this.stateMappings) {
      if (mapping.stateId === stableId) {
        return mapping.slotStart as StateSlotId;
      }
    }
    return undefined;
  }

  // ===========================================================================
  // Render Globals
  // ===========================================================================

  addRenderGlobal(decl: CameraDeclIR): void {
    this.renderGlobals.push(decl);
  }

  getRenderGlobals(): readonly CameraDeclIR[] {
    return this.renderGlobals;
  }

  // ===========================================================================
  // Utility
  // ===========================================================================

  kernel(name: string): PureFn {
    return { kind: 'kernel', name };
  }

  opcode(op: OpCode): PureFn {
    return { kind: 'opcode', opcode: op };
  }

  expr(expression: string): PureFn {
    return { kind: 'expr', expr: expression };
  }

  createInstance(
    domainType: DomainTypeId,
    count: InstanceCountSpec,
    shapeField?: ValueExprId,
    lifecycle?: 'static' | 'dynamic' | 'pooled'
  ): InstanceId {
    const id = `inst-${this.instanceCounter++}` as InstanceId;
    const isDynamic = typeof count !== 'number';
    const staticCount = typeof count === 'number'
      ? Math.max(0, Math.floor(count))
      : 0;
    const dynamicMaxCount = typeof count === 'number'
      ? 0
      : Math.max(1, Math.floor(count.maxCount));
    const maxCount = typeof count === 'number'
      ? Math.max(staticCount, 10_000)
      : dynamicMaxCount;
    this.instances.set(id, {
      id,
      domainType,
      count: isDynamic ? 'dynamic' : staticCount,
      ...(isDynamic ? { countExpr: count.countExpr } : {}),
      maxCount,
      lifecycle: lifecycle ?? (isDynamic ? 'dynamic' : 'static'),
      identityMode: 'stable',
      ...(shapeField !== undefined && { shapeField }), // Store shape field reference if provided
    });
    return id;
  }

  getInstances(): ReadonlyMap<InstanceId, InstanceDecl> {
    return this.instances;
  }

  getSchedule(): TimeModelIR {
    return this.schedule;
  }

  // ===========================================================================
  // Build Results
  // ===========================================================================

  getSteps(): readonly Step[] {
    return this.steps;
  }

  getStateMappings(): readonly StateMapping[] {
    return this.stateMappings;
  }

  getStateSlotCount(): number {
    return this.stateSlotCounter;
  }

  getSlotCount(): number {
    return this.slotCounter;
  }

  getSlotLayoutInputs(): ReadonlyMap<ValueSlot, { readonly type: CanonicalType; readonly stride: number }> {
    return this.slotLayoutInputs;
  }

  getValueExpr(id: ValueExprId): ValueExpr | undefined {
    return this.valueExprs[id];
  }

  getValueExprs(): readonly ValueExpr[] {
    return this.valueExprs;
  }

  /** Extract instantiated cardinality kind from an already-pushed expression. */
  private cardKindOf(id: ValueExprId): 'zero' | 'one' | 'many' {
    const expr = this.valueExprs[id];
    if (!expr) throw new Error(`IRBuilder: invalid ValueExprId ${id}`);
    return requireInst(expr.type.extent.cardinality, 'cardinality').kind;
  }

  /**
   * Resolve symbolic state keys to physical slots in all state expressions.
   * Called by processBlockEffects after state slot allocation.
   */
  resolveStateExprs(stateKeyToSlot: ReadonlyMap<string, StateSlotId>): void {
    for (const expr of this.valueExprs) {
      if (expr.kind === 'state' && expr.resolvedSlot === undefined) {
        const slot = stateKeyToSlot.get(expr.stateKey);
        if (slot !== undefined) {
          // Mutate in place — this is a one-time resolution during compilation
          (expr as { resolvedSlot?: StateSlotId }).resolvedSlot = slot;
        }
      }
    }
  }

  getScalarSlots(): ReadonlyMap<number, ValueSlot> {
    return this.scalarSlots;
  }

  getFieldSlots(): ReadonlyMap<number, ValueSlot> {
    return this.fieldSlots;
  }

  getEventSlots(): ReadonlyMap<ValueExprId, EventSlotId> {
    return this.eventSlots;
  }

  getEventSlotCount(): number {
    return this.eventSlotCounter;
  }

  getSerializableTopologies(): readonly SerializableTopologyDef[] {
    return [...this.topologiesById.values()].sort((a, b) => a.id - b.id);
  }

  // ===========================================================================
  // Internal Helpers
  // ===========================================================================

  private pushExpr(expr: ValueExpr): ValueExprId {
    const hash = JSON.stringify(expr);
    const existing = this.valueExprCache.get(hash);
    if (existing !== undefined) return existing;

    const id = valueExprId(this.valueExprs.length);
    this.valueExprs.push(expr);
    this.valueExprCache.set(hash, id);

    if (this._currentBlockId !== null) {
      this._exprToBlock.set(id, this._currentBlockId);
    }

    return id;
  }

  setTimeModel(schedule: TimeModelIR): void {
    this.schedule = schedule;
  }

  setCurrentBlockId(blockId: string): void {
    this._currentBlockId = blockId as BlockId;
  }

  setCurrentBlock(blockId: BlockId): void {
    this._currentBlockId = blockId;
  }

  clearCurrentBlock(): void {
    this._currentBlockId = null;
  }

  getExprToBlock(): ReadonlyMap<ValueExprId, BlockId> {
    return this._exprToBlock;
  }
}

/**
 * Create a new IR builder instance (full orchestrator surface).
 */
export function createIRBuilder(): OrchestratorIRBuilder {
  return new IRBuilderImpl();
}

// Helper function (imported from Indices or defined here)
function eventSlotId(n: number): EventSlotId {
  return n as EventSlotId;
}

function stateSlotId(n: number): StateSlotId {
  return n as StateSlotId;
}

function isPathTopologyInput(topology: AbstractTopologyDef | PathTopologyDefInput): topology is PathTopologyDefInput {
  return 'verbs' in topology && Array.isArray(topology.verbs);
}

function computePathDispatchData(verbs: readonly PathVerb[]): {
  readonly segmentKind: readonly PathSegmentKind[];
  readonly segmentPointBase: readonly number[];
  readonly hasQuad: boolean;
  readonly hasCubic: boolean;
} {
  const segmentKind: PathSegmentKind[] = [];
  const segmentPointBase: number[] = [];
  let hasQuad = false;
  let hasCubic = false;
  let pointIndex = 0;

  for (const verb of verbs) {
    if (verb === PathVerb.LINE) {
      segmentKind.push('line');
      segmentPointBase.push(pointIndex);
      pointIndex += 1;
      continue;
    }
    if (verb === PathVerb.CUBIC) {
      segmentKind.push('cubic');
      segmentPointBase.push(pointIndex);
      hasCubic = true;
      pointIndex += 3;
      continue;
    }
    if (verb === PathVerb.QUAD) {
      segmentKind.push('quad');
      segmentPointBase.push(pointIndex);
      hasQuad = true;
      pointIndex += 2;
      continue;
    }
    if (verb === PathVerb.MOVE) {
      pointIndex += 1;
      continue;
    }
    if (verb === PathVerb.CLOSE) {
      continue;
    }
  }

  return {
    segmentKind,
    segmentPointBase,
    hasQuad,
    hasCubic,
  };
}

function toSerializableTopologyShape(
  topology: AbstractTopologyDef | PathTopologyDefInput,
): Omit<SerializableTopologyDef, 'id'> {
  if (isPathTopologyInput(topology)) {
    const withDispatch: Omit<PathTopologyDef, 'id'> = {
      ...topology,
      ...computePathDispatchData(topology.verbs),
    };
    const { render: _render, ...serializable } = withDispatch;
    return serializable;
  }
  const { render: _render, ...serializable } = topology;
  return serializable as Omit<SerializableTopologyDef, 'id'>;
}

function topologyShapeSignature(topology: Omit<SerializableTopologyDef, 'id'>): string {
  const pathFields =
    topology.verbs !== undefined
      ? {
          verbs: topology.verbs,
          pointsPerVerb: topology.pointsPerVerb,
          totalControlPoints: topology.totalControlPoints,
          closed: topology.closed,
          segmentKind: topology.segmentKind,
          segmentPointBase: topology.segmentPointBase,
          hasQuad: topology.hasQuad,
          hasCubic: topology.hasCubic,
        }
      : null;
  return JSON.stringify({
    params: topology.params,
    path: pathFields,
  });
}
