/**
 * src/pillars/types/__tests__/validate-axes.test.ts
 *
 * One invariant test per guardrail. Each test constructs a minimal graph that
 * either satisfies or violates a specific rule, then asserts the gate catches
 * exactly what it should catch. [LAW:behavior-not-structure] [LAW:single-enforcer]
 *
 * Invariants covered:
 *   1. Clean graph — no diagnostics
 *   2. EventInvariantBroken (payload) — discrete + non-bool payload
 *   3. EventInvariantBroken (unit)    — discrete + non-none unit
 *   4. NoInstance                     — cardinality:many but instance absent
 *   5. VarEscape                      — inference var in portTypes
 *   6. AdapterShapeError (slots)      — adapter with 2 input slots
 *   7. AdapterShapeError (fields)     — adapter slot with 2 fields
 *   8. CategoryGatingError (sum)      — sum combine on bool port
 *   9. CategoryGatingError (or)       — or combine on float port
 *  10. first/last combine — always clean
 */

import { describe, it, expect } from 'vitest';
import {
  canonical,
  zFloat,
  manyExtent,
  instanceRef,
  type ZAdapterSpec,
  type ZCanonicalType,
  type ZInferenceCanonicalType,
} from '../schemas';
import type { DefinedBlock } from '../../block-api';
import type { DraftPortKey, MutableGraph, StrictTypedGraph } from '../solve/typed-graph';
import { draftPortKey } from '../solve/typed-graph';
import { validateAxes } from '../validate/axis-validate';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const asConcrete = (t: ZInferenceCanonicalType): ZCanonicalType =>
  t as unknown as ZCanonicalType;

const inst = instanceRef('i');

const floatType = (): ZCanonicalType => asConcrete(zFloat());
const fieldType = (): ZCanonicalType =>
  asConcrete(canonical({ kind: 'float' }, { extent: manyExtent(inst) }));

const discreteExtent = {
  cardinality: { kind: 'one' as const },
  temporality: { kind: 'discrete' as const },
  binding: { kind: 'unbound' as const },
  perspective: { kind: 'default' as const },
  branch: { kind: 'default' as const },
};
const eventType = (): ZCanonicalType =>
  asConcrete(canonical({ kind: 'bool' }, { extent: discreteExtent }));

const emptyGraph = (): MutableGraph => ({
  blocks: [],
  edges: [],
  obligations: [],
  revision: 0,
});

function makeStrict(
  portEntries: Record<string, ZCanonicalType>,
  blocks: MutableGraph['blocks'] = [],
): StrictTypedGraph {
  return {
    graph: { ...emptyGraph(), blocks },
    portTypes: new Map(
      Object.entries(portEntries).map(([k, v]) => [k as DraftPortKey, v]),
    ),
    diagnostics: [],
  };
}

function adapterBlock(
  type: string,
  inType: ZInferenceCanonicalType,
  outType: ZInferenceCanonicalType,
  spec: ZAdapterSpec = { description: type },
): DefinedBlock {
  return {
    type,
    adapterSpec: spec,
    contract: {
      inputs: { in: { id: 'in', dir: 'in', type: { value: inType } } },
      outputs: { out: { id: 'out', dir: 'out', type: { value: outType } } },
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('validateAxes', () => {
  it('1. clean graph → no diagnostics', () => {
    const key = draftPortKey('b', 'output', 'v', 'out');
    const strict = makeStrict({ [key]: floatType() });
    expect(validateAxes(strict, [])).toHaveLength(0);
  });

  it('2. EventInvariantBroken (payload) — discrete + float payload', () => {
    // Manually construct a type that violates the event invariant (discrete + non-bool)
    const badEventType = asConcrete(
      canonical({ kind: 'float' }, { extent: discreteExtent }),
    );
    const key = draftPortKey('b', 'output', 'v', 'out');
    const strict = makeStrict({ [key]: badEventType });
    const diags = validateAxes(strict, []);

    const d = diags.find((d) => d.code === 'EventInvariantBroken' && d.stableKey.includes('payload'));
    expect(d).toBeDefined();
    expect(d?.message).toContain('non-bool payload');
  });

  it('3. EventInvariantBroken (unit) — discrete + non-none unit', () => {
    const badEventType = asConcrete(
      canonical({ kind: 'bool' }, {
        unit: { kind: 'angle', unit: 'degrees' },
        extent: discreteExtent,
      }),
    );
    const key = draftPortKey('b', 'output', 'v', 'out');
    const strict = makeStrict({ [key]: badEventType });
    const diags = validateAxes(strict, []);

    const d = diags.find((d) => d.code === 'EventInvariantBroken' && d.stableKey.includes('unit'));
    expect(d).toBeDefined();
    expect(d?.message).toContain('non-none unit');
  });

  it('4. NoInstance — cardinality:many with no instance ref (manually broken graph)', () => {
    // Bypass schema to construct a broken type
    const brokenMany = {
      payload: { kind: 'float' },
      unit: { kind: 'none' },
      extent: {
        cardinality: { kind: 'many' }, // missing `instance`
        temporality: { kind: 'continuous' },
        binding: { kind: 'unbound' },
        perspective: { kind: 'default' },
        branch: { kind: 'default' },
      },
    } as unknown as ZCanonicalType;
    const key = draftPortKey('b', 'output', 'v', 'out');
    const strict = makeStrict({ [key]: brokenMany });
    const diags = validateAxes(strict, []);

    expect(diags.some((d) => d.code === 'NoInstance')).toBe(true);
  });

  it('5. VarEscape — inference var in portTypes', () => {
    const varType = {
      payload: { kind: 'var', var: 'P' },
      unit: { kind: 'none' },
      extent: {
        cardinality: { kind: 'one' },
        temporality: { kind: 'continuous' },
        binding: { kind: 'unbound' },
        perspective: { kind: 'default' },
        branch: { kind: 'default' },
      },
    } as unknown as ZCanonicalType;
    const key = draftPortKey('b', 'output', 'v', 'out');
    const strict = makeStrict({ [key]: varType });
    const diags = validateAxes(strict, []);

    expect(diags.some((d) => d.code === 'VarEscape')).toBe(true);
  });

  it('6. AdapterShapeError (slots) — adapter with 2 input slots', () => {
    const badAdapter: DefinedBlock = {
      type: 'BadAdapter',
      adapterSpec: { description: 'bad' },
      contract: {
        inputs: {
          in1: { id: 'in1', dir: 'in', type: { value: zFloat() } },
          in2: { id: 'in2', dir: 'in', type: { value: zFloat() } },
        },
        outputs: { out: { id: 'out', dir: 'out', type: { value: zFloat() } } },
      },
    };
    const strict = makeStrict({});
    const diags = validateAxes(strict, [badAdapter]);

    const d = diags.find((d) => d.code === 'AdapterShapeError');
    expect(d).toBeDefined();
    expect(d?.message).toContain('BadAdapter');
    expect(d?.stableKey).toContain('slots');
  });

  it('7. AdapterShapeError (fields) — adapter slot with 2 fields', () => {
    const badAdapter: DefinedBlock = {
      type: 'BadFieldAdapter',
      adapterSpec: { description: 'bad' },
      contract: {
        inputs: {
          in: { id: 'in', dir: 'in', type: { x: zFloat(), y: zFloat() } }, // 2-field slot
        },
        outputs: { out: { id: 'out', dir: 'out', type: { value: zFloat() } } },
      },
    };
    const strict = makeStrict({});
    const diags = validateAxes(strict, [badAdapter]);

    const d = diags.find((d) => d.code === 'AdapterShapeError');
    expect(d).toBeDefined();
    expect(d?.stableKey).toContain('fields');
  });

  it('8. CategoryGatingError — sum on bool port', () => {
    const key = draftPortKey('blk', 'input', 'value', 'in');
    const boolType = asConcrete(
      canonical({ kind: 'bool' }, { unit: { kind: 'none' } }),
    );
    const block: MutableGraph['blocks'][number] = {
      id: 'blk',
      type: 'SumBlock',
      origin: { kind: 'user' },
      syntheticContract: {
        inputs: {
          input: { id: 'input', dir: 'in', type: { value: canonical({ kind: 'bool' }) }, combine: 'sum' },
        },
        outputs: {},
      },
    };
    const strict = makeStrict({ [key]: boolType }, [block]);
    const diags = validateAxes(strict, []);

    expect(diags.some((d) => d.code === 'CategoryGatingError')).toBe(true);
    expect(diags.find((d) => d.code === 'CategoryGatingError')?.message).toContain("'sum'");
  });

  it('9. CategoryGatingError — or on float port', () => {
    const key = draftPortKey('blk', 'input', 'value', 'in');
    const block: MutableGraph['blocks'][number] = {
      id: 'blk',
      type: 'OrBlock',
      origin: { kind: 'user' },
      syntheticContract: {
        inputs: {
          input: { id: 'input', dir: 'in', type: { value: zFloat() }, combine: 'or' },
        },
        outputs: {},
      },
    };
    const strict = makeStrict({ [key]: floatType() }, [block]);
    const diags = validateAxes(strict, []);

    expect(diags.some((d) => d.code === 'CategoryGatingError')).toBe(true);
    expect(diags.find((d) => d.code === 'CategoryGatingError')?.message).toContain("'or'");
  });

  it('10. first/last combine on any payload → always clean', () => {
    const floatKey = draftPortKey('blk', 'inF', 'value', 'in');
    const boolKey = draftPortKey('blk', 'inB', 'value', 'in');
    const boolType = asConcrete(canonical({ kind: 'bool' }));
    const block: MutableGraph['blocks'][number] = {
      id: 'blk',
      type: 'PickBlock',
      origin: { kind: 'user' },
      syntheticContract: {
        inputs: {
          inF: { id: 'inF', dir: 'in', type: { value: zFloat() }, combine: 'first' },
          inB: { id: 'inB', dir: 'in', type: { value: canonical({ kind: 'bool' }) }, combine: 'last' },
        },
        outputs: {},
      },
    };
    const strict = makeStrict({ [floatKey]: floatType(), [boolKey]: boolType }, [block]);
    const diags = validateAxes(strict, []);

    expect(diags.filter((d) => d.code === 'CategoryGatingError')).toHaveLength(0);
  });

  it('clean adapter passes shape check', () => {
    const ok = adapterBlock('DegToRad', zFloat(), zFloat());
    const key = draftPortKey('b', 'output', 'v', 'out');
    const strict = makeStrict({ [key]: floatType() });
    expect(validateAxes(strict, [ok])).toHaveLength(0);
  });

  it('valid field type passes NoInstance check', () => {
    const key = draftPortKey('b', 'output', 'v', 'out');
    const strict = makeStrict({ [key]: fieldType() });
    expect(validateAxes(strict, [])).toHaveLength(0);
  });

  it('valid event type passes event invariant check', () => {
    const key = draftPortKey('b', 'output', 'v', 'out');
    const strict = makeStrict({ [key]: eventType() });
    expect(validateAxes(strict, [])).toHaveLength(0);
  });
});
