/**
 * edge-decorator-conformance.contract — the EdgeDecorator contract, stated once, as
 * executable assertions.
 *
 * This file IS the specification of what makes a decorator "editor-usable". Every
 * provider (V1EdgeDecorator, SceneEdgeDecorator, the empty decorator, and any future
 * backend) is checked against this one contract; a behavior this file does not
 * assert is not part of the contract, and a provider that passes every assertion
 * here is presumed drop-in for the edge renderer's chips + in-place param editor.
 * [LAW:single-enforcer] [LAW:verifiable-goals]
 *
 * DECOMPOSITION: an `EdgeDecoratorConformanceCase` carries the whole truth a
 * provider must supply to be checkable — the decorator, plus an edge its era is
 * known to decorate, an edge it is known NOT to decorate, and one editable param on
 * the decorated edge. The `assert*` functions know only the neutral vocabulary
 * (`EdgeDecorator` / `EdgeDecoration` / `EdgeRef`); they never import a store or an
 * era-specific model. That is what lets one contract check heterogeneous providers.
 * [LAW:decomposition] [LAW:one-way-deps]
 *
 * The `assert*` functions are also the negative control's instrument: aimed at a
 * deliberately-broken decorator they must throw, proving the suite has teeth rather
 * than vacuously passing.
 */

import { describe, expect, it } from 'vitest';
import type { EdgeDecoration, EdgeDecorator, EdgeRef } from '../edge-decorations';

/** Everything a provider must supply to be run through the conformance contract. */
export interface EdgeDecoratorConformanceCase {
  readonly name: string;
  /** The decorator under test, over a graph the provider has seeded. */
  readonly decorator: EdgeDecorator;
  /** An edge whose target input this era is known to decorate with a chain. */
  readonly decoratedEdge: EdgeRef;
  /** An edge this era is known to leave undecorated (a direct/bare wire). */
  readonly bareEdge: EdgeRef;
  /** One editable param on the decorated edge, with a value to write and read back. */
  readonly editable: {
    readonly decorationId: string;
    readonly paramId: string;
    readonly value: number;
  };
}

/** A decoration is a fully-formed chip: non-empty id/label/color, well-formed params. */
function assertDecorationWellFormed(d: EdgeDecoration, label: string): void {
  expect(d.id.length, `${label}: decoration has an id`).toBeGreaterThan(0);
  expect(d.label.length, `${label}: decoration has a label`).toBeGreaterThan(0);
  expect(d.color.length, `${label}: decoration has a color`).toBeGreaterThan(0);
  for (const p of d.params) {
    expect(p.id.length, `${label}: param has an id`).toBeGreaterThan(0);
    expect(p.label.length, `${label}: param has a label`).toBeGreaterThan(0);
  }
}

/** The known-decorated edge yields a non-empty, well-formed chain. */
export function assertDecoratesKnownEdge(c: EdgeDecoratorConformanceCase): void {
  const decorations = c.decorator.decorations(c.decoratedEdge);
  expect(decorations.length, `${c.name}: decorated edge has a chain`).toBeGreaterThan(0);
  decorations.forEach((d, i) => assertDecorationWellFormed(d, `${c.name}: decoration ${i}`));
}

/** The known-bare edge yields no decorations — a decorator never invents a chain. */
export function assertBareEdgeUndecorated(c: EdgeDecoratorConformanceCase): void {
  const decorations = c.decorator.decorations(c.bareEdge);
  expect(decorations, `${c.name}: bare edge has no chain`).toHaveLength(0);
}

/**
 * A param write round-trips: after `setParam`, the same param on the decorated edge
 * reads back the written value. This is what makes the neutral in-place editor real
 * — the provider's setParam is the era's own mutation, and the chain re-derives it.
 */
export function assertParamRoundTrips(c: EdgeDecoratorConformanceCase): void {
  c.decorator.setParam(c.decoratedEdge, c.editable.decorationId, c.editable.paramId, c.editable.value);
  const decoration = c.decorator
    .decorations(c.decoratedEdge)
    .find((d) => d.id === c.editable.decorationId);
  expect(decoration, `${c.name}: edited decoration still present`).toBeDefined();
  const param = decoration?.params.find((p) => p.id === c.editable.paramId);
  expect(param?.value, `${c.name}: param reflects the written value`).toBe(c.editable.value);
}

/**
 * Register the whole contract against one provider. A future backend is drop-in
 * verifiable: build an EdgeDecoratorConformanceCase for it and call this.
 */
export function runEdgeDecoratorConformanceSuite(c: EdgeDecoratorConformanceCase): void {
  describe(`EdgeDecorator conformance: ${c.name}`, () => {
    it('decorates a known edge with a well-formed chain', () => assertDecoratesKnownEdge(c));
    it('leaves a bare edge undecorated', () => assertBareEdgeUndecorated(c));
    it('round-trips a param edit', () => assertParamRoundTrips(c));
  });
}
