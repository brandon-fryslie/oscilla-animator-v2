/**
 * ValueExpr Lowering Pass
 *
 * Converts legacy SigExpr/FieldExpr/EventExpr tables into a single unified ValueExprTable.
 *
 * Design:
 * - Pure function: takes CompiledProgramIR, returns ValueExprTable
 * - Multi-phase: signals (except reduceField), fields, reduceField signals, events
 * - Builds forward mapping arrays (sigToValue, fieldToValue, eventToValue)
 * - Every legacy expression produces exactly one ValueExpr
 *
 * Special handling for reduceField:
 * - Signal reduceField expressions reference fields, so they must be lowered AFTER fields
 * - We use a two-pass approach: lower non-reduceField signals first, then fields,
 *   then come back to reduceField signals
 * - We track pending reduceField expressions and process them in a second pass
 *
 * Spec Reference: TYPE-SYSTEM-INVARIANTS.md
 */

import type { CompiledProgramIR, ValueExprTable } from './program';
import type { SigExpr, FieldExpr, EventExpr } from './types';
import type { ValueExpr } from './value-expr';
import { valueExprId, type ValueExprId, type SigExprId, type FieldExprId, type EventExprId } from './Indices';

/**
 * Lower legacy expression tables to unified ValueExpr table.
 *
 * @param program - Compiled program with legacy expression tables
 * @returns ValueExprTable with all expressions lowered
 */
export function lowerToValueExprs(program: CompiledProgramIR): ValueExprTable {
  const nodes: ValueExpr[] = [];
  const sigToValue: ValueExprId[] = [];
  const fieldToValue: ValueExprId[] = [];
  const eventToValue: ValueExprId[] = [];

  // Track pending reduceField expressions (index in signalExprs, expression)
  const pendingReduceField: Array<{ index: number; expr: SigExpr }> = [];

  // Helper to emit a ValueExpr and return its ID
  function emit(expr: ValueExpr): ValueExprId {
    const id = valueExprId(nodes.length);
    nodes.push(expr);
    return id;
  }

  // Phase 1: Lower signal expressions (EXCEPT reduceField)
  // Signals must be lowered first because fields/events may reference them
  // BUT reduceField references fields, so we defer it to Phase 3
  for (let i = 0; i < program.signalExprs.nodes.length; i++) {
    const sig = program.signalExprs.nodes[i];

    if (sig.kind === 'reduceField') {
      // Defer reduceField to Phase 3 (after fields are lowered)
      pendingReduceField.push({ index: i, expr: sig });
      // Reserve a slot in sigToValue (will be filled in Phase 3)
      sigToValue.push(valueExprId(-1)); // Temporary placeholder
    } else {
      const veId = lowerSigExpr(sig, emit, sigToValue, fieldToValue);
      sigToValue[i] = veId;
    }
  }

  // Phase 2: Lower field expressions
  // Fields may reference signals (via broadcast/zipSig) but not events
  for (let i = 0; i < program.fieldExprs.nodes.length; i++) {
    const fieldExpr = program.fieldExprs.nodes[i];
    const veId = lowerFieldExpr(fieldExpr, emit, sigToValue, fieldToValue);
    fieldToValue.push(veId);
  }

  // Phase 3: Lower pending reduceField signal expressions
  // Now fieldToValue is populated, so we can safely reference fields
  for (const { index, expr } of pendingReduceField) {
    const veId = lowerSigExpr(expr, emit, sigToValue, fieldToValue);
    sigToValue[index] = veId; // Fill in the placeholder
  }

  // Phase 4: Lower event expressions
  // Events may reference signals (via wrap) and other events (via combine)
  for (let i = 0; i < program.eventExprs.nodes.length; i++) {
    const eventExpr = program.eventExprs.nodes[i];
    const veId = lowerEventExpr(eventExpr, emit, sigToValue, eventToValue);
    eventToValue.push(veId);
  }

  return {
    nodes,
    sigToValue,
    fieldToValue,
    eventToValue,
  };
}

/**
 * Lower a single signal expression to ValueExpr.
 */
function lowerSigExpr(
  expr: SigExpr,
  emit: (expr: ValueExpr) => ValueExprId,
  sigToValue: readonly ValueExprId[],
  fieldToValue: readonly ValueExprId[]
): ValueExprId {
  switch (expr.kind) {
    case 'const':
      return emit({
        kind: 'const',
        type: expr.type,
        value: expr.value,
      });

    case 'slot':
      return emit({
        kind: 'slotRead',
        type: expr.type,
        slot: expr.slot,
      });

    case 'time':
      return emit({
        kind: 'time',
        type: expr.type,
        which: expr.which,
      });

    case 'external':
      return emit({
        kind: 'external',
        type: expr.type,
        channel: expr.which, // Note: legacy uses 'which', ValueExpr uses 'channel'
      });

    case 'map':
      return emit({
        kind: 'kernel',
        type: expr.type,
        kernelKind: 'map',
        input: sigToValue[expr.input as number],
        fn: expr.fn,
      });

    case 'zip':
      return emit({
        kind: 'kernel',
        type: expr.type,
        kernelKind: 'zip',
        inputs: expr.inputs.map(id => sigToValue[id as number]),
        fn: expr.fn,
      });

    case 'stateRead':
      return emit({
        kind: 'state',
        type: expr.type,
        stateSlot: expr.stateSlot,
      });

    case 'shapeRef':
      return emit({
        kind: 'shapeRef',
        type: expr.type,
        topologyId: expr.topologyId,
        paramArgs: expr.paramSignals.map(id => sigToValue[id as number]),
        controlPointField: expr.controlPointField
          ? fieldToValue[expr.controlPointField.id as number]
          : undefined,
      });

    case 'reduceField':
      return emit({
        kind: 'kernel',
        type: expr.type,
        kernelKind: 'reduce',
        field: fieldToValue[expr.field as number],
        op: expr.op,
      });

    case 'eventRead':
      return emit({
        kind: 'eventRead',
        type: expr.type,
        eventSlot: expr.eventSlot,
      });

    default: {
      const _exhaustive: never = expr;
      throw new Error(`Unknown SigExpr kind: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/**
 * Lower a single field expression to ValueExpr.
 */
function lowerFieldExpr(
  expr: FieldExpr,
  emit: (expr: ValueExpr) => ValueExprId,
  sigToValue: readonly ValueExprId[],
  fieldToValue: readonly ValueExprId[]
): ValueExprId {
  switch (expr.kind) {
    case 'const':
      return emit({
        kind: 'const',
        type: expr.type,
        value: expr.value,
      });

    case 'intrinsic':
      return emit({
        kind: 'intrinsic',
        type: expr.type,
        intrinsicKind: 'property',
        intrinsic: expr.intrinsic,
      });

    case 'placement':
      return emit({
        kind: 'intrinsic',
        type: expr.type,
        intrinsicKind: 'placement',
        field: expr.field,
        basisKind: expr.basisKind,
      });

    case 'broadcast':
      return emit({
        kind: 'kernel',
        type: expr.type,
        kernelKind: 'broadcast',
        signal: sigToValue[expr.signal as number],
      });

    case 'map':
      return emit({
        kind: 'kernel',
        type: expr.type,
        kernelKind: 'map',
        input: fieldToValue[expr.input as number],
        fn: expr.fn,
      });

    case 'zip':
      return emit({
        kind: 'kernel',
        type: expr.type,
        kernelKind: 'zip',
        inputs: expr.inputs.map(id => fieldToValue[id as number]),
        fn: expr.fn,
      });

    case 'zipSig':
      return emit({
        kind: 'kernel',
        type: expr.type,
        kernelKind: 'zipSig',
        field: fieldToValue[expr.field as number],
        signals: expr.signals.map(id => sigToValue[id as number]),
        fn: expr.fn,
      });

    case 'stateRead':
      return emit({
        kind: 'state',
        type: expr.type,
        stateSlot: expr.stateSlot,
      });

    case 'pathDerivative':
      return emit({
        kind: 'kernel',
        type: expr.type,
        kernelKind: 'pathDerivative',
        field: fieldToValue[expr.input as number],
        op: expr.operation,
      });

    default: {
      const _exhaustive: never = expr;
      throw new Error(`Unknown FieldExpr kind: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/**
 * Lower a single event expression to ValueExpr.
 */
function lowerEventExpr(
  expr: EventExpr,
  emit: (expr: ValueExpr) => ValueExprId,
  sigToValue: readonly ValueExprId[],
  eventToValue: readonly ValueExprId[]
): ValueExprId {
  switch (expr.kind) {
    case 'const':
      return emit({
        kind: 'event',
        type: expr.type,
        eventKind: 'const',
        fired: expr.fired,
      });

    case 'pulse':
      return emit({
        kind: 'event',
        type: expr.type,
        eventKind: 'pulse',
        source: expr.source,
      });

    case 'wrap':
      return emit({
        kind: 'event',
        type: expr.type,
        eventKind: 'wrap',
        input: sigToValue[expr.signal as number],
      });

    case 'combine':
      return emit({
        kind: 'event',
        type: expr.type,
        eventKind: 'combine',
        inputs: expr.events.map(id => eventToValue[id as number]),
        mode: expr.mode,
      });

    case 'never':
      return emit({
        kind: 'event',
        type: expr.type,
        eventKind: 'never',
      });

    default: {
      const _exhaustive: never = expr;
      throw new Error(`Unknown EventExpr kind: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
