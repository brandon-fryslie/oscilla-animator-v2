/**
 * block-catalog-conformance.contract — the BlockCatalog contract, stated once,
 * as executable assertions.
 *
 * This file IS the specification of what makes a catalog "editor-usable". Every
 * provider (V1BlockCatalog, SceneBlockCatalog, and any future backend) is checked
 * against this one contract; a behavior this file does not assert is not part of
 * the contract, and a provider that passes every assertion here is presumed
 * drop-in for the block library, connection picker, and replacement menu.
 * [LAW:single-enforcer] [LAW:verifiable-goals]
 *
 * DECOMPOSITION: a `CatalogConformanceCase` is the seam. It carries the whole
 * truth a provider must supply to be checkable — how to build the catalog, and a
 * block type its registry is known to contain. The `assert*` functions below know
 * only the neutral vocabulary (`BlockCatalog` / `CatalogEntry`); they never import
 * a store, a registry, or an era-specific type. This is what lets one contract
 * check heterogeneous providers. [LAW:decomposition] [LAW:one-way-deps]
 *
 * The `assert*` functions are also the negative control's instrument: aimed at a
 * deliberately-broken catalog they must throw, proving the suite has teeth rather
 * than vacuously passing.
 */

import { describe, expect, it } from 'vitest';
import {
  type BlockCatalog,
  type CatalogEntry,
  type CatalogEntryForm,
  catalogCategories,
  catalogEntriesInCategory,
  insertableEntries,
  requireCatalogEntry,
  searchEntries,
} from '../block-catalog';

const VALID_FORMS: readonly CatalogEntryForm[] = ['primitive', 'macro', 'composite'];

/** Everything a provider must supply to be run through the conformance contract. */
export interface CatalogConformanceCase {
  readonly name: string;
  /** Build the catalog under test. */
  setup(): BlockCatalog;
  /** A block type this provider is known to contain (proves non-empty, real content). */
  readonly knownType: string;
}

/** A well-formed port carries a label and a presentation-ready type display. */
function assertPortWellFormed(entry: CatalogEntry, port: CatalogEntry['inputs'][number], name: string): void {
  expect(port.id.length, `${name}: ${entry.type} port carries an id`).toBeGreaterThan(0);
  expect(port.label.length, `${name}: ${entry.type} port ${port.id} carries a label`).toBeGreaterThan(0);
  expect(
    port.typeDisplay.label.length,
    `${name}: ${entry.type} port ${port.id} type label`,
  ).toBeGreaterThan(0);
  expect(
    port.typeDisplay.tooltip.length,
    `${name}: ${entry.type} port ${port.id} type tooltip`,
  ).toBeGreaterThan(0);
  expect(
    port.typeDisplay.color.length,
    `${name}: ${entry.type} port ${port.id} type color`,
  ).toBeGreaterThan(0);
  expect(
    port.typeDisplay.compatibilityToken.length,
    `${name}: ${entry.type} port ${port.id} compatibility token`,
  ).toBeGreaterThan(0);
}

/** The catalog contains real block types (a usable palette is never empty). */
export function assertCatalogNonEmpty(c: CatalogConformanceCase): void {
  const catalog = c.setup();
  expect(catalog.entries.length, `${c.name}: catalog must contain entries`).toBeGreaterThan(0);
}

/** Every entry and every port is self-describing — no registry needed to render it. */
export function assertEntriesSelfDescribing(c: CatalogConformanceCase): void {
  const catalog = c.setup();
  for (const entry of catalog.entries) {
    expect(entry.type.length, `${c.name}: entry carries a type`).toBeGreaterThan(0);
    expect(entry.label.length, `${c.name}: entry ${entry.type} carries a label`).toBeGreaterThan(0);
    expect(entry.category.length, `${c.name}: entry ${entry.type} carries a category`).toBeGreaterThan(0);
    expect(VALID_FORMS, `${c.name}: entry ${entry.type} has a valid form`).toContain(entry.form);
    expect(
      ['none', 'expressionEditor'],
      `${c.name}: entry ${entry.type} has a valid open behavior`,
    ).toContain(entry.openBehavior.kind);
    for (const port of [...entry.inputs, ...entry.outputs]) {
      assertPortWellFormed(entry, port, c.name);
    }
  }
}

/** getEntry round-trips every entry by its own type, and rejects unknown types. */
export function assertLookupRoundtrips(c: CatalogConformanceCase): void {
  const catalog = c.setup();
  for (const entry of catalog.entries) {
    expect(
      catalog.getEntry(entry.type)?.type,
      `${c.name}: getEntry(${entry.type}) round-trips`,
    ).toBe(entry.type);
  }
  expect(
    catalog.getEntry('__no_such_block_type__'),
    `${c.name}: getEntry of an unknown type is undefined`,
  ).toBeUndefined();
}

/** The provider's declared known type resolves — the catalog holds real content. */
export function assertKnownTypePresent(c: CatalogConformanceCase): void {
  const catalog = c.setup();
  const entry = requireCatalogEntry(catalog, c.knownType);
  expect(entry.type, `${c.name}: known type ${c.knownType} resolves`).toBe(c.knownType);
}

/**
 * The derived views (insertable filter, category grouping, search) cohere with
 * the entry set they are computed from. [LAW:one-source-of-truth]
 */
export function assertDerivedViewsCohere(c: CatalogConformanceCase): void {
  const catalog = c.setup();
  const insertable = insertableEntries(catalog);
  const allTypes = new Set(catalog.entries.map((e) => e.type));
  for (const entry of insertable) {
    expect(allTypes.has(entry.type), `${c.name}: insertable entry ${entry.type} is a real entry`).toBe(true);
    expect(entry.insertable, `${c.name}: insertableEntries yields only insertable entries`).toBe(true);
  }

  for (const category of catalogCategories(catalog)) {
    expect(
      catalogEntriesInCategory(catalog, category).length,
      `${c.name}: category ${category} has entries`,
    ).toBeGreaterThan(0);
  }

  expect(
    searchEntries(catalog.entries, '').length,
    `${c.name}: empty search returns every entry`,
  ).toBe(catalog.entries.length);

  const sample = insertable[0];
  if (sample) {
    const hits = searchEntries(catalog.entries, sample.label);
    expect(
      hits.some((e) => e.type === sample.type),
      `${c.name}: searching an entry's own label finds it`,
    ).toBe(true);
  }
}

/**
 * Register the whole contract against one provider. A future backend is drop-in
 * verifiable: build a CatalogConformanceCase for it and call this.
 */
export function runCatalogConformanceSuite(c: CatalogConformanceCase): void {
  describe(`BlockCatalog conformance: ${c.name}`, () => {
    it('exposes a non-empty catalog', () => assertCatalogNonEmpty(c));
    it('projects self-describing entries and ports', () => assertEntriesSelfDescribing(c));
    it('getEntry round-trips and rejects unknown types', () => assertLookupRoundtrips(c));
    it('contains the declared known type', () => assertKnownTypePresent(c));
    it('derived views cohere with the entry set', () => assertDerivedViewsCohere(c));
  });
}
