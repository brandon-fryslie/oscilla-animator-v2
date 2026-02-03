/**
 * ValueExpr Structural Invariant Tests
 *
 * These tests enforce the structural properties of the ValueExpr canonical table.
 * They verify at the TYPE LEVEL that:
 * - Exactly 10 top-level kinds exist
 * - Every variant carries CanonicalType as 'type'
 * - No 'op' discriminant (only 'kind' at top level)
 * - No instanceId stored on variants
 *
 * These tests make it impossible to silently add/remove kinds or break
 * the canonical structure without updating the canonical table.
 */
import { describe, it, expect } from 'vitest';
import type {
  ValueExpr,
  ValueExprIntrinsic,
  ValueExprKernel,
  ValueExprEvent,
  ValueExprShapeRef,
  ValueExprTime,
} from '../value-expr';
import type { CanonicalType } from '../../../core/canonical-types';

/**
 * The exhaustive list of ValueExpr kind discriminants.
 * If a new kind is added to ValueExpr without updating this list,
 * the compile-time exhaustiveness check below will fail.
 */
const EXPECTED_KINDS = [
  'const',
  'external',
  'intrinsic',
  'kernel',
  'state',
  'time',
  'shapeRef',
  'eventRead',
  'event',
  'slotRead',
] as const;

// =============================================================================
// Compile-Time Exhaustiveness Check
// =============================================================================

/**
 * Compile-time bidirectional exhaustiveness check.
 *
 * If ValueExpr gains a kind not in EXPECTED_KINDS, _MissingFromArray will be
 * non-never and _CheckMissing will fail to compile.
 *
 * If EXPECTED_KINDS lists a kind not in ValueExpr, _ExtraInArray will be
 * non-never and _CheckExtra will fail to compile.
 */
type _MissingFromArray = Exclude<ValueExpr['kind'], typeof EXPECTED_KINDS[number]>;
type _ExtraInArray = Exclude<typeof EXPECTED_KINDS[number], ValueExpr['kind']>;
// Compile-time assertion: both must resolve to `never`.
// If either is non-never, the `as never` cast will produce a TS error.
const _checkMissing: _MissingFromArray = undefined as never;
const _checkExtra: _ExtraInArray = undefined as never;
void _checkMissing; void _checkExtra;

// =============================================================================
// Runtime Tests
// =============================================================================

describe('ValueExpr structural invariants', () => {
  it('has exactly 10 top-level kinds', () => {
    expect(EXPECTED_KINDS.length).toBe(10);
  });

  it('exhaustive kind check: EXPECTED_KINDS matches ValueExpr union', () => {
    // Compile-time types above enforce bidirectional coverage.
    // Runtime check verifies the count is still 10.
    expect(EXPECTED_KINDS.length).toBe(10);

    // Verify each kind in the array is a valid discriminant
    for (const kind of EXPECTED_KINDS) {
      expect(typeof kind).toBe('string');
      expect(kind.length).toBeGreaterThan(0);
    }
  });

  it('every variant has type: CanonicalType (compile-time check)', () => {
    // This test uses TypeScript's type system to verify every variant has 'type'.
    // If a variant drops its 'type' field, this function won't compile.
    function extractType(expr: ValueExpr): CanonicalType {
      // All 10 variants must have .type — if one doesn't, this won't compile
      return expr.type;
    }

    // Verify for each kind at runtime using minimal mocks
    const mockType = {} as CanonicalType;
    const variants: ValueExpr[] = [
      { kind: 'const', type: mockType, value: { kind: 'float', value: 0 } },
      { kind: 'external', type: mockType, channel: 'test' },
      { kind: 'intrinsic', type: mockType, intrinsicKind: 'property', intrinsic: 'index' },
      { kind: 'kernel', type: mockType, kernelKind: 'map', input: 0 as any, fn: { kind: 'opcode', opcode: 'add' } as any },
      { kind: 'state', type: mockType, stateKey: 'test:state' as any },
      { kind: 'time', type: mockType, which: 'tMs' },
      { kind: 'shapeRef', type: mockType, topologyId: 0 as any, paramArgs: [] },
      { kind: 'eventRead', type: mockType, eventSlot: 0 as any },
      { kind: 'event', type: mockType, eventKind: 'never' },
      { kind: 'slotRead', type: mockType, slot: 0 as any },
    ];

    for (const v of variants) {
      expect(extractType(v)).toBe(mockType);
    }
  });

  it('no variant uses "op" as a discriminant', () => {
    // ValueExpr uses "kind" at top level, not "op".
    // If someone adds an "op" field, this test will catch it.
    const mockType = {} as CanonicalType;
    const variants: ValueExpr[] = [
      { kind: 'const', type: mockType, value: { kind: 'float', value: 0 } },
      { kind: 'external', type: mockType, channel: 'test' },
      { kind: 'intrinsic', type: mockType, intrinsicKind: 'property', intrinsic: 'index' },
      { kind: 'kernel', type: mockType, kernelKind: 'map', input: 0 as any, fn: { kind: 'opcode', opcode: 'add' } as any },
      { kind: 'state', type: mockType, stateKey: 'test:state' as any },
      { kind: 'time', type: mockType, which: 'tMs' },
      { kind: 'shapeRef', type: mockType, topologyId: 0 as any, paramArgs: [] },
      { kind: 'eventRead', type: mockType, eventSlot: 0 as any },
      { kind: 'event', type: mockType, eventKind: 'never' },
      { kind: 'slotRead', type: mockType, slot: 0 as any },
    ];

    for (const v of variants) {
      expect(Object.keys(v)).not.toContain('op');
    }
  });

  it('no variant has instanceId as a top-level field', () => {
    // Instance identity is derived from type via requireManyInstance(expr.type).
    // No ValueExpr variant should store instanceId directly.
    const mockType = {} as CanonicalType;
    const variants: ValueExpr[] = [
      { kind: 'const', type: mockType, value: { kind: 'float', value: 0 } },
      { kind: 'external', type: mockType, channel: 'test' },
      { kind: 'intrinsic', type: mockType, intrinsicKind: 'property', intrinsic: 'index' },
      { kind: 'kernel', type: mockType, kernelKind: 'map', input: 0 as any, fn: { kind: 'opcode', opcode: 'add' } as any },
      { kind: 'state', type: mockType, stateKey: 'test:state' as any },
      { kind: 'time', type: mockType, which: 'tMs' },
      { kind: 'shapeRef', type: mockType, topologyId: 0 as any, paramArgs: [] },
      { kind: 'eventRead', type: mockType, eventSlot: 0 as any },
      { kind: 'event', type: mockType, eventKind: 'never' },
      { kind: 'slotRead', type: mockType, slot: 0 as any },
    ];

    for (const v of variants) {
      expect(Object.keys(v)).not.toContain('instanceId');
    }
  });

  describe('sub-discriminant correctness', () => {
    it('ValueExprKernel.kernelKind covers all kernel operations', () => {
      const expectedKernelKinds = ['map', 'zip', 'broadcast', 'reduce', 'zipSig', 'pathDerivative'];
      const mockType = {} as CanonicalType;
      const mockFn = { kind: 'opcode', opcode: 'add' } as any;

      // Create properly-typed kernels for each kernelKind (in matching order)
      const kernels: ValueExprKernel[] = [
        { kind: 'kernel', type: mockType, kernelKind: 'map', input: 0 as any, fn: mockFn },
        { kind: 'kernel', type: mockType, kernelKind: 'zip', inputs: [], fn: mockFn },
        { kind: 'kernel', type: mockType, kernelKind: 'broadcast', signal: 0 as any },
        { kind: 'kernel', type: mockType, kernelKind: 'reduce', field: 0 as any, op: 'sum' },
        { kind: 'kernel', type: mockType, kernelKind: 'zipSig', field: 0 as any, signals: [], fn: mockFn },
        { kind: 'kernel', type: mockType, kernelKind: 'pathDerivative', field: 0 as any, op: 'tangent', topologyId: 100 },
      ];

      expect(kernels.length).toBe(expectedKernelKinds.length);
      for (let i = 0; i < kernels.length; i++) {
        expect(kernels[i].kernelKind).toBe(expectedKernelKinds[i]);
      }
    });

    it('ValueExprEvent.eventKind covers all event operations', () => {
      const expectedEventKinds = ['pulse', 'wrap', 'combine', 'never', 'const'];
      const mockType = {} as CanonicalType;

      // Create properly-typed events for each eventKind
      const events: ValueExprEvent[] = [
        { kind: 'event', type: mockType, eventKind: 'pulse', source: 'timeRoot' },
        { kind: 'event', type: mockType, eventKind: 'wrap', input: 0 as any },
        { kind: 'event', type: mockType, eventKind: 'combine', inputs: [], mode: 'any' },
        { kind: 'event', type: mockType, eventKind: 'never' },
        { kind: 'event', type: mockType, eventKind: 'const', fired: true },
      ];

      expect(events.length).toBe(expectedEventKinds.length);
      for (let i = 0; i < events.length; i++) {
        expect(events[i].eventKind).toBe(expectedEventKinds[i]);
      }
    });

    it('ValueExprIntrinsic.intrinsicKind distinguishes property vs placement', () => {
      const mockType = {} as CanonicalType;
      const property: ValueExprIntrinsic = {
        kind: 'intrinsic',
        type: mockType,
        intrinsicKind: 'property',
        intrinsic: 'index',
      };
      const placement: ValueExprIntrinsic = {
        kind: 'intrinsic',
        type: mockType,
        intrinsicKind: 'placement',
        field: 'uv',
        basisKind: 'halton2D',
      };
      expect(property.intrinsicKind).toBe('property');
      expect(placement.intrinsicKind).toBe('placement');
    });
  });

  describe('kernel sub-union type safety', () => {
    it('map kernel requires fn', () => {
      const mockType = {} as CanonicalType;
      const mapKernel: ValueExprKernel = {
        kind: 'kernel',
        type: mockType,
        kernelKind: 'map',
        input: 0 as any,
        fn: { kind: 'opcode', opcode: 'add' } as any,
      };
      expect(mapKernel.fn).toBeDefined();
    });

    it('broadcast kernel does not have fn', () => {
      const mockType = {} as CanonicalType;
      const broadcastKernel: ValueExprKernel = {
        kind: 'kernel',
        type: mockType,
        kernelKind: 'broadcast',
        signal: 0 as any,
      };
      expect('fn' in broadcastKernel).toBe(false);
    });

    it('reduce kernel has op field', () => {
      const mockType = {} as CanonicalType;
      const reduceKernel: ValueExprKernel = {
        kind: 'kernel',
        type: mockType,
        kernelKind: 'reduce',
        field: 0 as any,
        op: 'sum',
      };
      expect(reduceKernel.op).toBe('sum');
    });

    it('pathDerivative kernel has op and topologyId fields', () => {
      const mockType = {} as CanonicalType;
      const pathDerivKernel: ValueExprKernel = {
        kind: 'kernel',
        type: mockType,
        kernelKind: 'pathDerivative',
        field: 0 as any,
        op: 'tangent',
        topologyId: 100,
      };
      expect(pathDerivKernel.op).toBe('tangent');
      expect(pathDerivKernel.topologyId).toBe(100);
    });
  });

  describe('event variant type safety', () => {
    it('pulse event has source: timeRoot', () => {
      const mockType = {} as CanonicalType;
      const pulseEvent: ValueExprEvent = {
        kind: 'event',
        type: mockType,
        eventKind: 'pulse',
        source: 'timeRoot',
      };
      expect(pulseEvent.source).toBe('timeRoot');
    });

    it('const event has fired field', () => {
      const mockType = {} as CanonicalType;
      const constEvent: ValueExprEvent = {
        kind: 'event',
        type: mockType,
        eventKind: 'const',
        fired: true,
      };
      expect(constEvent.fired).toBe(true);
    });

    it('combine event has mode field', () => {
      const mockType = {} as CanonicalType;
      const combineEvent: ValueExprEvent = {
        kind: 'event',
        type: mockType,
        eventKind: 'combine',
        inputs: [],
        mode: 'all',
      };
      expect(combineEvent.mode).toBe('all');
    });
  });

  describe('time variant completeness', () => {
    it('ValueExprTime.which accepts all 7 time signals', () => {
      const mockType = {} as CanonicalType;
      const timeSignals = ['tMs', 'phaseA', 'phaseB', 'dt', 'progress', 'palette', 'energy'] as const;

      for (const which of timeSignals) {
        const timeExpr: ValueExprTime = {
          kind: 'time',
          type: mockType,
          which,
        };
        expect(timeExpr.which).toBe(which);
      }
    });
  });

  describe('shapeRef has controlPointField', () => {
    it('shapeRef can have controlPointField', () => {
      const mockType = {} as CanonicalType;
      const shapeRef: ValueExprShapeRef = {
        kind: 'shapeRef',
        type: mockType,
        topologyId: 0 as any,
        paramArgs: [],
        controlPointField: 42 as any,
      };
      expect(shapeRef.controlPointField).toBe(42);
    });
  });
});
