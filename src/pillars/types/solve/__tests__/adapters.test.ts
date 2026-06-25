/**
 * Adapter search is unification over the catalog, not a registry lookup or a
 * pattern match. These tests pin that: an adapter matches iff the sub-solvers
 * unify both its endpoints, the binding it required is reported as the
 * candidate's substitution, and unmarked blocks are invisible to the search.
 * [LAW:one-type-per-behavior] [LAW:effects-at-boundaries]
 */

import { describe, it, expect } from 'vitest';
import {
  canonical,
  zFloat,
  oneExtent,
  manyExtent,
  payloadVar,
  unitVar,
  cardinalityVar,
  payloadVarId,
  unitVarId,
  cardinalityVarId,
  instanceRef,
  type ZAdapterSpec,
  type ZInferenceCanonicalType,
} from '../../schemas';
import type { DefinedBlock } from '../../../block-api';
import { findAdapterCandidates } from '../adapters';

// --- catalog builders ------------------------------------------------------

/** A one-in/one-out adapter block over single-field bundles. */
const adapter = (
  type: string,
  inputField: ZInferenceCanonicalType,
  outputField: ZInferenceCanonicalType,
  spec: ZAdapterSpec = { description: type },
): DefinedBlock => ({
  type,
  adapterSpec: spec,
  contract: {
    inputs: { in: { id: 'in', dir: 'in', type: { value: inputField } } },
    outputs: { out: { id: 'out', dir: 'out', type: { value: outputField } } },
  },
});

/** A structurally-identical block that is NOT marked as an adapter. */
const plainBlock = (
  type: string,
  inputField: ZInferenceCanonicalType,
  outputField: ZInferenceCanonicalType,
): DefinedBlock => ({
  type,
  contract: {
    inputs: { in: { id: 'in', dir: 'in', type: { value: inputField } } },
    outputs: { out: { id: 'out', dir: 'out', type: { value: outputField } } },
  },
});

// --- canonical-type helpers ------------------------------------------------

const degrees = (): ZInferenceCanonicalType =>
  canonical({ kind: 'float' }, { unit: { kind: 'angle', unit: 'degrees' } });
const radians = (): ZInferenceCanonicalType =>
  canonical({ kind: 'float' }, { unit: { kind: 'angle', unit: 'radians' } });
const seconds = (): ZInferenceCanonicalType =>
  canonical({ kind: 'float' }, { unit: { kind: 'time', unit: 'seconds' } });

describe('findAdapterCandidates', () => {
  it('matches an exact concrete adapter with an empty substitution', () => {
    const catalog = [adapter('DegToRad', degrees(), radians())];
    const result = findAdapterCandidates(degrees(), radians(), catalog);

    expect(result).toHaveLength(1);
    expect(result[0].blockType).toBe('DegToRad');
    expect(result[0].inputSlot).toBe('in');
    expect(result[0].outputSlot).toBe('out');
    expect(result[0].substitution.payloads.size).toBe(0);
    expect(result[0].substitution.units.size).toBe(0);
    expect(result[0].substitution.cardinalities.size).toBe(0);
  });

  it('binds the variables of a polymorphic UnitCast {P, U_in} → {P, U_out}', () => {
    const unitCast = adapter(
      'UnitCast',
      canonical(payloadVar('P'), { unit: unitVar('U_in') }),
      canonical(payloadVar('P'), { unit: unitVar('U_out') }),
    );
    const result = findAdapterCandidates(radians(), degrees(), [unitCast]);

    expect(result).toHaveLength(1);
    const { substitution } = result[0];
    expect(substitution.payloads.get(payloadVarId('P'))).toEqual({ kind: 'float' });
    expect(substitution.units.get(unitVarId('U_in'))).toEqual({ kind: 'angle', unit: 'radians' });
    expect(substitution.units.get(unitVarId('U_out'))).toEqual({ kind: 'angle', unit: 'degrees' });
  });

  describe('unit discriminator sensitivity', () => {
    // The ticket's "nested var inside a concrete variant" ({kind:'angle', unit:
    // <var>}) is unrepresentable in the landed schema — `angle.unit` is a closed
    // enum, and the only unit variable is the top-level one. So these cover the
    // realizable form of that intent: a TOP-LEVEL unit var adopts a concrete
    // structured unit, and a differing unit discriminator refuses to match.
    // (Nested-variant variables await the wzm3.10 axis-representation decision.)
    it('binds a top-level unit var to the structured unit of a concrete source', () => {
      const normalize = adapter(
        'ToRadians',
        canonical({ kind: 'float' }, { unit: unitVar('U') }),
        radians(),
      );
      const result = findAdapterCandidates(degrees(), radians(), [normalize]);

      expect(result).toHaveLength(1);
      expect(result[0].substitution.units.get(unitVarId('U'))).toEqual({
        kind: 'angle',
        unit: 'degrees',
      });
    });

    it('does not match when the unit discriminator differs (angle input vs time source)', () => {
      const catalog = [adapter('DegToRad', degrees(), radians())];
      expect(findAdapterCandidates(seconds(), radians(), catalog)).toEqual([]);
    });
  });

  it('returns nothing when no adapter bridges the edge', () => {
    const catalog = [adapter('DegToRad', degrees(), radians())];
    // Source is seconds — incompatible with the degrees input field.
    expect(findAdapterCandidates(seconds(), radians(), catalog)).toEqual([]);
  });

  it('sorts matches by priority ascending (default 0), tiebreaking on blockType', () => {
    const pass = (): ZInferenceCanonicalType => zFloat();
    const catalog = [
      adapter('B_high', pass(), pass(), { description: 'b', priority: 10 }),
      adapter('C_low', pass(), pass(), { description: 'c', priority: 1 }),
      adapter('A_low', pass(), pass(), { description: 'a', priority: 1 }),
      adapter('D_default', pass(), pass(), { description: 'd' }), // priority undefined ⇒ 0
    ];
    const result = findAdapterCandidates(zFloat(), zFloat(), catalog);

    expect(result.map((c) => c.blockType)).toEqual(['D_default', 'A_low', 'C_low', 'B_high']);
  });

  it('binds a cardinality var for a one → many broadcast adapter', () => {
    const broadcast = adapter(
      'Broadcast',
      canonical(payloadVar('P'), { unit: unitVar('U') }),
      canonical(payloadVar('P'), {
        unit: unitVar('U'),
        extent: { ...oneExtent(), cardinality: cardinalityVar('C') },
      }),
    );
    const source = zFloat(); // cardinality one
    const target = canonical({ kind: 'float' }, { extent: manyExtent(instanceRef('dots')) });
    const result = findAdapterCandidates(source, target, [broadcast]);

    expect(result).toHaveLength(1);
    expect(result[0].substitution.cardinalities.get(cardinalityVarId('C'))).toEqual({
      kind: 'many',
      instance: 'dots',
    });
  });

  it('never considers a block without an adapterSpec, even if it would unify', () => {
    const catalog = [
      plainBlock('PlainPassthrough', zFloat(), zFloat()),
      adapter('RealAdapter', zFloat(), zFloat()),
    ];
    const result = findAdapterCandidates(zFloat(), zFloat(), catalog);

    expect(result.map((c) => c.blockType)).toEqual(['RealAdapter']);
  });

  it('throws when an adapter-marked block violates the one-in/one-out shape', () => {
    const malformed: DefinedBlock = {
      type: 'TwoInputs',
      adapterSpec: { description: 'malformed' },
      contract: {
        inputs: {
          a: { id: 'a', dir: 'in', type: { value: zFloat() } },
          b: { id: 'b', dir: 'in', type: { value: zFloat() } },
        },
        outputs: { out: { id: 'out', dir: 'out', type: { value: zFloat() } } },
      },
    };
    expect(() => findAdapterCandidates(zFloat(), zFloat(), [malformed])).toThrow(
      /exactly one input slot/,
    );
  });
});
