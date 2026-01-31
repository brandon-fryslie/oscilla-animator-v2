/**
 * Tests for lowerToValueExprs lowering pass
 *
 * Verifies that:
 * - Every legacy expression has exactly one ValueExpr equivalent
 * - Forward mapping arrays have correct lengths
 * - Cross-table references are correctly resolved
 * - All ValueExpr nodes have valid type field
 */

import { describe, it, expect } from 'vitest';
import { lowerToValueExprs } from '../lowerToValueExprs';
import type { CompiledProgramIR } from '../program';
import { canonicalType } from '../../../core/canonical-types';
import { FLOAT, BOOL } from '../../../core/canonical-types';
import type { SigExpr, FieldExpr, EventExpr } from '../types';
import { sigExprId, fieldExprId, eventExprId, valueSlot, stateSlotId, eventSlotId } from '../Indices';
import type { ValueExpr } from '../value-expr';

describe('lowerToValueExprs', () => {
  it('should lower an empty program', () => {
    const program = createMinimalProgram([], [], []);
    const result = lowerToValueExprs(program);

    expect(result.nodes).toHaveLength(0);
    expect(result.sigToValue).toHaveLength(0);
    expect(result.fieldToValue).toHaveLength(0);
    expect(result.eventToValue).toHaveLength(0);
  });

  it('should lower signal const expressions', () => {
    const signals: SigExpr[] = [
      {
        kind: 'const',
        value: { kind: 'float', value: 42 },
        type: canonicalType(FLOAT),
      },
    ];
    const program = createMinimalProgram(signals, [], []);
    const result = lowerToValueExprs(program);

    expect(result.nodes).toHaveLength(1);
    expect(result.sigToValue).toHaveLength(1);
    expect(result.nodes[0].kind).toBe('const');
    expect((result.nodes[0] as any).value.kind).toBe('float');
  });

  it('should lower signal slot expressions', () => {
    const signals: SigExpr[] = [
      {
        kind: 'slot',
        slot: valueSlot(0),
        type: canonicalType(FLOAT),
      },
    ];
    const program = createMinimalProgram(signals, [], []);
    const result = lowerToValueExprs(program);

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].kind).toBe('slotRead');
    expect((result.nodes[0] as any).slot).toBe(0);
  });

  it('should lower signal time expressions', () => {
    const signals: SigExpr[] = [
      {
        kind: 'time',
        which: 'tMs',
        type: canonicalType(FLOAT),
      },
    ];
    const program = createMinimalProgram(signals, [], []);
    const result = lowerToValueExprs(program);

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].kind).toBe('time');
    expect((result.nodes[0] as any).which).toBe('tMs');
  });

  it('should lower signal external expressions', () => {
    const signals: SigExpr[] = [
      {
        kind: 'external',
        which: 'mouse.x',
        type: canonicalType(FLOAT),
      },
    ];
    const program = createMinimalProgram(signals, [], []);
    const result = lowerToValueExprs(program);

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].kind).toBe('external');
    // Note: legacy uses 'which', ValueExpr uses 'channel'
    expect((result.nodes[0] as any).channel).toBe('mouse.x');
  });

  it('should lower signal map expressions with cross-references', () => {
    const signals: SigExpr[] = [
      {
        kind: 'const',
        value: { kind: 'float', value: 1 },
        type: canonicalType(FLOAT),
      },
      {
        kind: 'map',
        input: sigExprId(0),
        fn: { kind: 'opcode', opcode: 'abs' as any },
        type: canonicalType(FLOAT),
      },
    ];
    const program = createMinimalProgram(signals, [], []);
    const result = lowerToValueExprs(program);

    expect(result.nodes).toHaveLength(2);
    expect(result.sigToValue).toHaveLength(2);
    expect(result.nodes[1].kind).toBe('kernel');
    const kernel = result.nodes[1] as any;
    expect(kernel.kernelKind).toBe('map');
    // Verify cross-reference: input should point to first ValueExpr
    expect(kernel.input).toBe(result.sigToValue[0]);
  });

  it('should lower field broadcast expressions with signal references', () => {
    const signals: SigExpr[] = [
      {
        kind: 'const',
        value: { kind: 'float', value: 42 },
        type: canonicalType(FLOAT),
      },
    ];
    const fields: FieldExpr[] = [
      {
        kind: 'broadcast',
        signal: sigExprId(0),
        type: canonicalType(FLOAT),
      },
    ];
    const program = createMinimalProgram(signals, fields, []);
    const result = lowerToValueExprs(program);

    expect(result.nodes).toHaveLength(2); // 1 signal + 1 field
    expect(result.sigToValue).toHaveLength(1);
    expect(result.fieldToValue).toHaveLength(1);

    const broadcast = result.nodes[1] as any;
    expect(broadcast.kind).toBe('kernel');
    expect(broadcast.kernelKind).toBe('broadcast');
    // Verify cross-reference: signal should point to first ValueExpr
    expect(broadcast.signal).toBe(result.sigToValue[0]);
  });

  it('should lower event wrap expressions with signal references', () => {
    const signals: SigExpr[] = [
      {
        kind: 'const',
        value: { kind: 'float', value: 1 },
        type: canonicalType(FLOAT),
      },
    ];
    const events: EventExpr[] = [
      {
        kind: 'wrap',
        signal: sigExprId(0),
        type: canonicalType(BOOL),
      },
    ];
    const program = createMinimalProgram(signals, [], events);
    const result = lowerToValueExprs(program);

    expect(result.nodes).toHaveLength(2); // 1 signal + 1 event
    expect(result.eventToValue).toHaveLength(1);

    const wrap = result.nodes[1] as any;
    expect(wrap.kind).toBe('event');
    expect(wrap.eventKind).toBe('wrap');
    // Verify cross-reference: input should point to first ValueExpr
    expect(wrap.input).toBe(result.sigToValue[0]);
  });

  it('should lower signal reduceField expressions with field references', () => {
    // Multi-phase lowering order:
    // Phase 1: Non-reduceField signals (none in this test)
    // Phase 2: Fields (intrinsic at nodes[0])
    // Phase 3: reduceField signals (reduce at nodes[1])
    const signals: SigExpr[] = [
      {
        kind: 'reduceField',
        field: fieldExprId(0), // References first field
        op: 'sum',
        type: canonicalType(FLOAT),
      },
    ];
    const fields: FieldExpr[] = [
      {
        kind: 'intrinsic',
        intrinsic: 'index',
        type: canonicalType(FLOAT),
      },
    ];
    const program = createMinimalProgram(signals, fields, []);
    const result = lowerToValueExprs(program);

    expect(result.nodes).toHaveLength(2); // 1 signal + 1 field
    expect(result.sigToValue).toHaveLength(1);
    expect(result.fieldToValue).toHaveLength(1);

    // Field is lowered first (Phase 2) → nodes[0]
    expect(result.nodes[0].kind).toBe('intrinsic');
    expect(result.fieldToValue[0]).toBe(0 as any); // Points to nodes[0]

    // Signal is lowered second (Phase 3) → nodes[1]
    const reduce = result.nodes[1] as any;
    expect(reduce.kind).toBe('kernel');
    expect(reduce.kernelKind).toBe('reduce');
    expect(reduce.op).toBe('sum');
    // Verify cross-reference: field should point to the field ValueExpr (nodes[0])
    expect(reduce.field).toBe(result.fieldToValue[0]);
    expect(result.sigToValue[0]).toBe(1 as any); // Points to nodes[1]
  });

  it('should maintain correct order with mixed expressions', () => {
    // Test order: non-reduceField signals, fields, reduceField signals, events
    const signals: SigExpr[] = [
      { kind: 'const', value: { kind: 'float', value: 1 }, type: canonicalType(FLOAT) }, // nodes[0]
      { kind: 'reduceField', field: fieldExprId(0), op: 'sum', type: canonicalType(FLOAT) }, // nodes[2] (deferred)
    ];
    const fields: FieldExpr[] = [
      { kind: 'intrinsic', intrinsic: 'index', type: canonicalType(FLOAT) }, // nodes[1]
    ];
    const events: EventExpr[] = [
      { kind: 'pulse', source: 'timeRoot' as const, type: canonicalType(BOOL) }, // nodes[3]
    ];
    const program = createMinimalProgram(signals, fields, events);
    const result = lowerToValueExprs(program);

    expect(result.nodes).toHaveLength(4);
    
    // Phase 1: Non-reduceField signals
    expect(result.nodes[0].kind).toBe('const');
    expect(result.sigToValue[0]).toBe(0 as any); // signal[0] → nodes[0]
    
    // Phase 2: Fields
    expect(result.nodes[1].kind).toBe('intrinsic');
    expect(result.fieldToValue[0]).toBe(1 as any); // field[0] → nodes[1]
    
    // Phase 3: reduceField signals
    expect(result.nodes[2].kind).toBe('kernel');
    expect((result.nodes[2] as any).kernelKind).toBe('reduce');
    expect(result.sigToValue[1]).toBe(2 as any); // signal[1] → nodes[2]
    
    // Phase 4: Events
    expect(result.nodes[3].kind).toBe('event');
    expect(result.eventToValue[0]).toBe(3 as any); // event[0] → nodes[3]
  });

  it('should ensure every ValueExpr has a valid type field', () => {
    const signals: SigExpr[] = [
      { kind: 'const', value: { kind: 'float', value: 1 }, type: canonicalType(FLOAT) },
      { kind: 'time', which: 'tMs', type: canonicalType(FLOAT) },
    ];
    const fields: FieldExpr[] = [
      { kind: 'intrinsic', intrinsic: 'index', type: canonicalType(FLOAT) },
    ];
    const events: EventExpr[] = [
      { kind: 'pulse', source: 'timeRoot', type: canonicalType(BOOL) },
    ];
    const program = createMinimalProgram(signals, fields, events);
    const result = lowerToValueExprs(program);

    // Every node must have a type field
    for (const node of result.nodes) {
      expect(node.type).toBeDefined();
      expect(node.type.payload).toBeDefined();
      expect(node.type.unit).toBeDefined();
      expect(node.type.extent).toBeDefined();
    }
  });

  it('should verify mapping array lengths match legacy table lengths', () => {
    const signals: SigExpr[] = [
      { kind: 'const', value: { kind: 'float', value: 1 }, type: canonicalType(FLOAT) },
      { kind: 'const', value: { kind: 'float', value: 2 }, type: canonicalType(FLOAT) },
    ];
    const fields: FieldExpr[] = [
      { kind: 'intrinsic', intrinsic: 'index', type: canonicalType(FLOAT) },
    ];
    const events: EventExpr[] = [
      { kind: 'pulse', source: 'timeRoot', type: canonicalType(BOOL) },
      { kind: 'never', type: canonicalType(BOOL) },
    ];
    const program = createMinimalProgram(signals, fields, events);
    const result = lowerToValueExprs(program);

    expect(result.sigToValue).toHaveLength(signals.length);
    expect(result.fieldToValue).toHaveLength(fields.length);
    expect(result.eventToValue).toHaveLength(events.length);
    expect(result.nodes).toHaveLength(signals.length + fields.length + events.length);
  });
});

// Helper to create a minimal CompiledProgramIR for testing
function createMinimalProgram(
  signals: SigExpr[],
  fields: FieldExpr[],
  events: EventExpr[]
): CompiledProgramIR {
  return {
    irVersion: 1,
    signalExprs: { nodes: signals },
    fieldExprs: { nodes: fields },
    eventExprs: { nodes: events },
    valueExprs: { nodes: [], sigToValue: [], fieldToValue: [], eventToValue: [] },
    constants: { json: [] },
    schedule: { steps: [], time: { kind: 'infinite' } },
    outputs: [],
    slotMeta: [],
    debugIndex: {
      stepToBlock: new Map(),
      slotToBlock: new Map(),
      ports: [],
      slotToPort: new Map(),
      blockMap: new Map(),
    },
    fieldSlotRegistry: new Map(),
    renderGlobals: [],
  };
}
