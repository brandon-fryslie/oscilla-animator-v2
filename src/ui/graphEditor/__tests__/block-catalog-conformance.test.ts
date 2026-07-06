/**
 * block-catalog-conformance.test — the BlockCatalog contract run against every
 * provider, plus a negative control proving the contract rejects.
 *
 * The contract itself lives in ./block-catalog-conformance.contract. Here we
 * supply one `CatalogConformanceCase` per provider and run the shared suite over
 * each. A future backend becomes drop-in verifiable by adding one case below.
 * [LAW:verifiable-goals]
 */

import { describe, expect, it } from 'vitest';

import { registerAllBlocks } from '../../../blocks/all';
import { v1BlockCatalog } from '../V1BlockCatalog';
import { sceneBlockCatalog } from '../SceneBlockCatalog';
import type { BlockCatalog, CatalogEntry } from '../block-catalog';

import {
  assertEntriesSelfDescribing,
  assertKnownTypePresent,
  assertLookupRoundtrips,
  runCatalogConformanceSuite,
  type CatalogConformanceCase,
} from './block-catalog-conformance.contract';

// The V1 catalog is a lazy projection of the mutable registry; make sure it is
// populated before the suite reads it.
registerAllBlocks();

// =============================================================================
// One case per provider — same neutral contract, two different backends.
// =============================================================================

const v1Case: CatalogConformanceCase = {
  name: 'V1BlockCatalog',
  knownType: 'Const',
  setup: () => v1BlockCatalog,
};

const sceneCase: CatalogConformanceCase = {
  name: 'SceneBlockCatalog',
  knownType: 'Constant',
  setup: () => sceneBlockCatalog,
};

runCatalogConformanceSuite(v1Case);
runCatalogConformanceSuite(sceneCase);

// =============================================================================
// Negative control — a deliberately-broken catalog the contract MUST reject.
//
// If the assertions passed this, they would be vacuous. Each `expect(...).toThrow`
// pins a distinct invariant to the assertion that enforces it. [LAW:verifiable-goals]
// =============================================================================

/**
 * Violates the contract: a non-empty catalog whose single entry has an empty
 * label and an empty-typeDisplay port, and whose getEntry never resolves — so
 * nothing is self-describing, nothing round-trips, and no known type is present.
 */
const brokenEntry: CatalogEntry = {
  type: 'Broken',
  label: '', // violation: not self-describing
  category: 'X',
  form: 'primitive',
  editable: true,
  insertable: true,
  openBehavior: { kind: 'none' },
  inputs: [{ id: 'in', label: '', typeDisplay: { label: '', tooltip: '', color: '', compatibilityToken: '' } }],
  outputs: [],
};

const brokenCatalog: BlockCatalog = {
  entries: [brokenEntry],
  getEntry: () => undefined, // violation: real entries never resolve
};

const brokenCase: CatalogConformanceCase = {
  name: 'BrokenCatalog',
  knownType: 'Broken',
  setup: () => brokenCatalog,
};

/**
 * A catalog whose entry is well-formed at the entry level but carries a port with
 * an empty tooltip — otherwise every field is populated. This isolates the
 * port-level type-display checks (which the fully-broken entry above never reaches,
 * because it fails on the entry label first) and proves the per-field port
 * assertions — including tooltip — actually have teeth. [LAW:verifiable-goals]
 */
const brokenPortCatalog: BlockCatalog = {
  entries: [
    {
      type: 'BadPort',
      label: 'Bad Port',
      category: 'X',
      form: 'primitive',
      editable: true,
      insertable: true,
      openBehavior: { kind: 'none' },
      inputs: [
        {
          id: 'in',
          label: 'In',
          // Every field populated EXCEPT tooltip — the field the new assertion guards.
          typeDisplay: { label: 'float', tooltip: '', color: '#fff', compatibilityToken: 'float' },
        },
      ],
      outputs: [],
    },
  ],
  getEntry: (type) => (type === 'BadPort' ? brokenPortCatalog.entries[0] : undefined),
};

const brokenPortCase: CatalogConformanceCase = {
  name: 'BrokenPortCatalog',
  knownType: 'BadPort',
  setup: () => brokenPortCatalog,
};

describe('catalog conformance contract rejects a non-conforming catalog (negative control)', () => {
  it('rejects entries that are not self-describing', () => {
    expect(() => assertEntriesSelfDescribing(brokenCase)).toThrow();
  });

  it('rejects a getEntry that does not round-trip real entries', () => {
    expect(() => assertLookupRoundtrips(brokenCase)).toThrow();
  });

  it('rejects a catalog missing its declared known type', () => {
    expect(() => assertKnownTypePresent(brokenCase)).toThrow();
  });

  it('rejects a port whose type-display tooltip is empty', () => {
    expect(() => assertEntriesSelfDescribing(brokenPortCase)).toThrow();
  });
});
