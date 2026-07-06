/**
 * type-oracle-conformance.test — the TypeOracle contract run against every
 * provider, plus a negative control proving the contract rejects.
 *
 * The contract itself lives in ./type-oracle-conformance.contract. Here we supply
 * one `TypeOracleConformanceCase` per provider (seeding it in that provider's own
 * vocabulary, with a wire the era is known to permit and one it is known to reject)
 * and run the shared suite over each. A future backend becomes drop-in verifiable
 * by adding one case below. [LAW:verifiable-goals]
 */

import { describe, expect, it } from 'vitest';

import { registerAllBlocks } from '../../../blocks/all';
import { buildPatch } from '../../../graph';
import { compileFrontend } from '../../../compiler/frontend';
import { FrontendResultStore } from '../../../stores/FrontendResultStore';
import { PillarPatchStore } from '../../../stores/PillarPatchStore';
import type { BlockId } from '../../../types';

import { V1TypeOracle } from '../V1TypeOracle';
import { SceneTypeOracle } from '../SceneTypeOracle';
import type { ConnectionVerdict, PortDirection, PortRef, TypeOracle } from '../type-oracle';

import {
  assertDescribesKnownPort,
  assertPermitsKnownGoodWire,
  assertRejectsKnownBadWire,
  assertUndefinedForUnknownPort,
  runTypeOracleConformanceSuite,
  type TypeOracleConformanceCase,
} from './type-oracle-conformance.contract';

registerAllBlocks();

// =============================================================================
// V1 provider — a compiled patch with a known-good and known-bad real wire.
// tMs (a resolved time signal) drives Ellipse.rx (float) — permitted; the same
// tMs into Ellipse.resolution (a count) contradicts — rejected. (An UNWIRED
// Const.out has no resolved type, so the cheap gate would reject it too — the
// permitted pair must be one whose source type actually resolves.)
// =============================================================================

function v1Case(): TypeOracleConformanceCase {
  const frontend = new FrontendResultStore();
  let timeId!: BlockId;
  let ellipseId!: BlockId;
  const patch = buildPatch((b) => {
    timeId = b.addBlock('InfiniteTimeRoot');
    ellipseId = b.addBlock('Ellipse');
  });
  frontend.updateFromFrontendResult(compileFrontend(patch), 1);

  return {
    name: 'V1TypeOracle',
    oracle: new V1TypeOracle(patch, frontend),
    permitted: {
      source: { blockId: timeId, portId: 'tMs' },
      target: { blockId: ellipseId, portId: 'rx' },
    },
    rejected: {
      source: { blockId: timeId, portId: 'tMs' },
      target: { blockId: ellipseId, portId: 'resolution' },
    },
    knownPort: { ref: { blockId: ellipseId, portId: 'rx' }, direction: 'input' },
  };
}

// =============================================================================
// Pillar provider — the self-seeded grid-of-squares patch.
// (grid.instances → color.primary is instanceBundle→instanceBundle; draw.draw is
//  a materialShell, which mismatches color.primary's instanceBundle.)
// =============================================================================

function sceneCase(): TypeOracleConformanceCase {
  const store = new PillarPatchStore();
  return {
    name: 'SceneTypeOracle',
    oracle: new SceneTypeOracle(store),
    permitted: {
      source: { blockId: 'grid', portId: 'instances' },
      target: { blockId: 'color', portId: 'primary' },
    },
    rejected: {
      source: { blockId: 'draw', portId: 'draw' },
      target: { blockId: 'color', portId: 'primary' },
    },
    knownPort: { ref: { blockId: 'grid', portId: 'instances' }, direction: 'output' },
  };
}

runTypeOracleConformanceSuite(v1Case());
runTypeOracleConformanceSuite(sceneCase());

// =============================================================================
// Negative control — deliberately-broken oracles the contract MUST reject.
//
// If the assertions passed these, they would be vacuous. Each `expect(...).toThrow`
// pins a distinct invariant to the assertion that enforces it. [LAW:verifiable-goals]
// =============================================================================

const DUMMY_REFS = {
  permitted: { source: { blockId: 'a', portId: 'o' }, target: { blockId: 'b', portId: 'i' } },
  rejected: { source: { blockId: 'a', portId: 'o' }, target: { blockId: 'b', portId: 'i' } },
  knownPort: { ref: { blockId: 'a', portId: 'o' }, direction: 'output' as PortDirection },
} as const;

/**
 * Permits every wire and invents a malformed type for every port — so it permits
 * the known-bad wire, types the unknown port, and its "type" is not presentable.
 */
const brokenPermissive: TypeOracle = {
  canConnect: (): ConnectionVerdict => ({ kind: 'allowed' }),
  describePort: (_ref: PortRef, _dir: PortDirection) => ({
    label: '',
    tooltip: '',
    color: '',
    compatibilityToken: '',
  }),
};

/** Rejects every wire — so it rejects the known-good wire too. */
const brokenRejecting: TypeOracle = {
  canConnect: (): ConnectionVerdict => ({ kind: 'rejected', reason: 'always' }),
  describePort: () => undefined,
};

const brokenPermissiveCase: TypeOracleConformanceCase = { name: 'BrokenPermissive', oracle: brokenPermissive, ...DUMMY_REFS };
const brokenRejectingCase: TypeOracleConformanceCase = { name: 'BrokenRejecting', oracle: brokenRejecting, ...DUMMY_REFS };

describe('type-oracle conformance contract rejects a non-conforming oracle (negative control)', () => {
  it('rejects an oracle that permits a known-bad wire', () => {
    expect(() => assertRejectsKnownBadWire(brokenPermissiveCase)).toThrow();
  });

  it('rejects an oracle that invents a type for an unknown port', () => {
    expect(() => assertUndefinedForUnknownPort(brokenPermissiveCase)).toThrow();
  });

  it('rejects an oracle whose known-port type is not presentable', () => {
    expect(() => assertDescribesKnownPort(brokenPermissiveCase)).toThrow();
  });

  it('rejects an oracle that refuses a known-good wire', () => {
    expect(() => assertPermitsKnownGoodWire(brokenRejectingCase)).toThrow();
  });
});
