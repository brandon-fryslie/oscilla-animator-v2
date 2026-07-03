/**
 * src/pillars/types/solve/__tests__/extract-constraints.test.ts
 *
 * Regression tests for intra-block variable sharing ACROSS slots. A modifier
 * block whose input and output declare the same type variable must produce
 * cross-slot equality constraints and (for cardinality) the inherit-instance
 * marker — the variable's identity is block-scoped, not slot-scoped.
 * [LAW:behavior-not-structure]
 */

import { describe, it, expect } from 'vitest';
import {
  canonical,
  cardinalityVar,
  cardinalityVarId,
  payloadVar,
  unitVar,
  instanceRef,
  type ZInferenceCanonicalType,
} from '../../schemas';
import { extractConstraints } from '../extract-constraints';
import { resolveTypes, makeMutableGraph } from '../fixpoint';
import { draftPortKey } from '../typed-graph';
import type { MutableBlock, MutableEdge } from '../typed-graph';

const userOrigin = { kind: 'user' as const };

function block(
  id: string,
  type: string,
  contract: import('../../schemas').ZBlockContract,
): MutableBlock {
  return { id, type, origin: userOrigin, syntheticContract: contract };
}

function edge(
  id: string,
  source: string,
  outputSlot: string,
  target: string,
  inputSlot: string,
): MutableEdge {
  return { id, source, outputSlot, target, inputSlot, origin: userOrigin };
}

const floatVarCard = (card: string): ZInferenceCanonicalType =>
  canonical({ kind: 'float' }, {
    extent: {
      cardinality: cardinalityVar(card),
      temporality: { kind: 'continuous' },
      binding: { kind: 'unbound' },
      perspective: { kind: 'default' },
      branch: { kind: 'default' },
    },
  });

const floatMany = (): ZInferenceCanonicalType =>
  canonical({ kind: 'float' }, {
    extent: {
      cardinality: { kind: 'many', instance: instanceRef('inst:test') },
      temporality: { kind: 'continuous' },
      binding: { kind: 'unbound' },
      perspective: { kind: 'default' },
      branch: { kind: 'default' },
    },
  });

/** A modifier whose input and output share payload/unit/cardinality vars. */
const sharedVarModifier = (id: string): MutableBlock => {
  const shared = (): ZInferenceCanonicalType =>
    canonical(payloadVar('P'), {
      unit: unitVar('U'),
      extent: {
        cardinality: cardinalityVar('C'),
        temporality: { kind: 'continuous' },
        binding: { kind: 'unbound' },
        perspective: { kind: 'default' },
        branch: { kind: 'default' },
      },
    });
  return block(id, 'SharedVarModifier', {
    inputs: { input: { id: 'input', dir: 'in', type: { value: shared() } } },
    outputs: { output: { id: 'output', dir: 'out', type: { value: shared() } } },
  });
};

describe('extractConstraints — cross-slot variable sharing', () => {
  it('emits cross-slot equality constraints for vars shared between input and output', () => {
    const mod = sharedVarModifier('mod');
    const graph = makeMutableGraph([mod], []);

    const extracted = extractConstraints(graph, []);

    const inKey = draftPortKey('mod', 'input', 'value', 'in');
    const outKey = draftPortKey('mod', 'output', 'value', 'out');
    const spansSlots = (c: { a: string; b: string }) =>
      (c.a === inKey && c.b === outKey) || (c.a === outKey && c.b === inKey);

    expect(extracted.payloadUnitConstraints.filter((c) => c.kind === 'payloadEq').some(spansSlots)).toBe(true);
    expect(extracted.payloadUnitConstraints.filter((c) => c.kind === 'unitEq').some(spansSlots)).toBe(true);
    expect(extracted.cardinalityConstraints.filter((c) => c.kind === 'equal').some(spansSlots)).toBe(true);
  });

  it('marks a cardinality var shared across slots as inherit-instance', () => {
    const mod = sharedVarModifier('mod');
    const graph = makeMutableGraph([mod], []);

    const extracted = extractConstraints(graph, []);

    expect(extracted.inheritInstanceVars.has(cardinalityVarId('c:mod:C'))).toBe(true);
  });

  it('resolves a many source through a shared-cardinality-var modifier without spurious errors', () => {
    // src (concrete many) → mod (card var C on both ports) → sink (card var S).
    // The sink group only reaches 'many' through the modifier's cross-slot
    // equality; without it the cardinality solver reports UnresolvedInstanceVar.
    const src = block('src', 'ManySource', {
      inputs: {},
      outputs: { output: { id: 'output', dir: 'out', type: { value: floatMany() } } },
    });
    const mod = sharedVarModifier('mod');
    const snk = block('snk', 'VarSink', {
      inputs: { input: { id: 'input', dir: 'in', type: { value: floatVarCard('S') } } },
      outputs: {},
    });
    const graph = makeMutableGraph(
      [src, mod, snk],
      [edge('e1', 'src', 'output', 'mod', 'input'), edge('e2', 'mod', 'output', 'snk', 'input')],
    );

    const result = resolveTypes(graph, []);

    expect(result.diagnostics).toEqual([]);
    expect(result.strict).not.toBeNull();
    const outType = result.strict!.portTypes.get(draftPortKey('mod', 'output', 'value', 'out'));
    expect(outType?.extent.cardinality.kind).toBe('many');
  });
});
