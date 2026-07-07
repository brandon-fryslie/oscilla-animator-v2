/**
 * selection-detail-conformance.contract — the SelectionDetail contract, stated once,
 * as executable assertions.
 *
 * This file IS the specification of what makes a provider "inspector-usable". Every
 * provider (V1SelectionDetail, SceneSelectionDetail, the empty provider, and any
 * future backend) is checked against this one contract; a behavior this file does
 * not assert is not part of the contract, and a provider that passes every assertion
 * here is presumed drop-in for the neutral SelectionDetailView. [LAW:single-enforcer]
 * [LAW:verifiable-goals]
 *
 * DECOMPOSITION: a `SelectionDetailConformanceCase` carries the whole truth a
 * provider must supply to be checkable — the provider, plus a block/edge its era is
 * known to describe, ids it is known NOT to know (proving absent-as-absent), and one
 * editable config field to prove writes round-trip. The `assert*` functions know only
 * the neutral vocabulary; they never import a store or an era-specific model. That is
 * what lets one contract check heterogeneous providers. [LAW:decomposition]
 * [LAW:one-way-deps]
 *
 * The `assert*` functions are also the negative control's instrument: aimed at a
 * deliberately-broken provider they must throw, proving the suite has teeth rather
 * than vacuously passing.
 */

import { describe, expect, it } from 'vitest';
import type { BlockDetail, SelectionDetail } from '../selection-detail';

/** Everything a provider must supply to be run through the conformance contract. */
export interface SelectionDetailConformanceCase {
  readonly name: string;
  /** The provider under test, over a graph the case has seeded. */
  readonly detail: SelectionDetail;
  /** A block id this era is known to describe. */
  readonly knownBlockId: string;
  /** A block id this era is known NOT to have (proves absent-as-absent). */
  readonly unknownBlockId: string;
  /** An edge id this era is known to describe. */
  readonly knownEdgeId: string;
  /** An edge id this era is known NOT to have (proves absent-as-absent). */
  readonly unknownEdgeId: string;
  /** One editable config field on `knownBlockId`, with a value to write and read back. */
  readonly editableConfig: {
    readonly blockId: string;
    readonly paramId: string;
    readonly value: unknown;
  };
}

/** A block detail is well-formed: real identity, well-formed ports and config. */
function assertBlockWellFormed(block: BlockDetail, label: string): void {
  expect(block.variant, `${label}: is an ordinary block`).toBe('block');
  expect(block.id.length, `${label}: has an id`).toBeGreaterThan(0);
  expect(block.type.length, `${label}: has a type`).toBeGreaterThan(0);
  expect(block.typeLabel.length, `${label}: has a type label`).toBeGreaterThan(0);
  expect(block.displayName.length, `${label}: has a display name`).toBeGreaterThan(0);
  for (const port of [...block.inputs, ...block.outputs]) {
    expect(port.id.length, `${label}: port has an id`).toBeGreaterThan(0);
    expect(port.label.length, `${label}: port has a label`).toBeGreaterThan(0);
  }
  for (const field of block.config) {
    if (field.kind === 'control') {
      expect(field.control.id.length, `${label}: config control has an id`).toBeGreaterThan(0);
    } else {
      expect(field.blockId.length, `${label}: expression field has a block id`).toBeGreaterThan(0);
    }
  }
}

/** The known block yields a well-formed detail whose id is the one asked for. */
export function assertDescribesKnownBlock(c: SelectionDetailConformanceCase): void {
  const block = c.detail.describeBlock(c.knownBlockId);
  expect(block, `${c.name}: describes the known block`).toBeDefined();
  expect(block?.id, `${c.name}: detail id matches`).toBe(c.knownBlockId);
  assertBlockWellFormed(block!, `${c.name}: block`);
}

/** An unknown block is absent — a provider never invents a detail. */
export function assertUnknownBlockAbsent(c: SelectionDetailConformanceCase): void {
  expect(c.detail.describeBlock(c.unknownBlockId), `${c.name}: unknown block is absent`).toBeUndefined();
}

/** The known edge yields a detail with real source and target endpoints. */
export function assertDescribesKnownEdge(c: SelectionDetailConformanceCase): void {
  const edge = c.detail.describeEdge(c.knownEdgeId);
  expect(edge, `${c.name}: describes the known edge`).toBeDefined();
  expect(edge?.id, `${c.name}: edge id matches`).toBe(c.knownEdgeId);
  expect(edge?.source.blockId.length, `${c.name}: edge has a source block`).toBeGreaterThan(0);
  expect(edge?.target.blockId.length, `${c.name}: edge has a target block`).toBeGreaterThan(0);
}

/** An unknown edge is absent — a provider never invents an edge. */
export function assertUnknownEdgeAbsent(c: SelectionDetailConformanceCase): void {
  expect(c.detail.describeEdge(c.unknownEdgeId), `${c.name}: unknown edge is absent`).toBeUndefined();
}

/**
 * A config write round-trips: after `applyControl`, the same config field on the
 * block reads back the written value. This is what makes the neutral inspector's
 * editing real — the provider's applyControl is the era's own mutation, and the
 * detail re-derives it.
 */
export function assertConfigRoundTrips(c: SelectionDetailConformanceCase): void {
  const before = c.detail.describeBlock(c.editableConfig.blockId);
  const field = before?.config.find((f) => f.kind === 'control' && f.control.id === c.editableConfig.paramId);
  expect(field, `${c.name}: editable config field is present`).toBeDefined();
  if (field?.kind !== 'control') throw new Error('editable config field must be a control');

  c.detail.applyControl(field.control.target, c.editableConfig.value);

  const after = c.detail.describeBlock(c.editableConfig.blockId);
  const reread = after?.config.find((f) => f.kind === 'control' && f.control.id === c.editableConfig.paramId);
  if (reread?.kind !== 'control') throw new Error('config field vanished after write');
  expect(reread.control.value, `${c.name}: config reflects the written value`).toBe(c.editableConfig.value);
}

/**
 * Register the whole contract against one provider. A future backend is drop-in
 * verifiable: build a SelectionDetailConformanceCase for it and call this.
 */
export function runSelectionDetailConformanceSuite(c: SelectionDetailConformanceCase): void {
  describe(`SelectionDetail conformance: ${c.name}`, () => {
    it('describes a known block with well-formed detail', () => assertDescribesKnownBlock(c));
    it('leaves an unknown block absent', () => assertUnknownBlockAbsent(c));
    it('describes a known edge with real endpoints', () => assertDescribesKnownEdge(c));
    it('leaves an unknown edge absent', () => assertUnknownEdgeAbsent(c));
    it('round-trips a config edit', () => assertConfigRoundTrips(c));
  });
}
