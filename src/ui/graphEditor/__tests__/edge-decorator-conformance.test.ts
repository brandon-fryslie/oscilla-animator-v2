/**
 * edge-decorator-conformance.test — the EdgeDecorator contract run against every
 * provider, plus a negative control proving the contract rejects.
 *
 * The contract itself lives in ./edge-decorator-conformance.contract. Here we supply
 * one `EdgeDecoratorConformanceCase` per provider (seeding it in that provider's own
 * vocabulary — a V1 patch with a lens on an edge, a pillar patch with a transform on
 * a route) and run the shared suite over each. A future backend becomes drop-in
 * verifiable by adding one case below. [LAW:verifiable-goals]
 */

import { describe, expect, it } from 'vitest';

import { registerAllBlocks } from '../../../blocks/all';
import { PatchStore } from '../../../stores/PatchStore';
import { PillarPatchStore } from '../../../stores/PillarPatchStore';

import { V1EdgeDecorator } from '../V1EdgeDecorator';
import { SceneEdgeDecorator } from '../SceneEdgeDecorator';
import { noEdgeDecorator } from '../edge-decorations';
import type { EdgeDecorator } from '../edge-decorations';

import {
  assertBareEdgeUndecorated,
  assertDecoratesKnownEdge,
  assertParamRoundTrips,
  runEdgeDecoratorConformanceSuite,
  type EdgeDecoratorConformanceCase,
} from './edge-decorator-conformance.contract';

registerAllBlocks();

// =============================================================================
// V1 provider — a time signal drives Ellipse.rx, with a ScaleBias lens on that
// connection. The rx edge decorates to [ScaleBias]; the resolution edge is bare.
// =============================================================================

function v1Case(): EdgeDecoratorConformanceCase {
  const store = new PatchStore();
  const timeId = store.addBlock('InfiniteTimeRoot');
  const ellipseId = store.addBlock('Ellipse');
  store.addEdge(
    { kind: 'port', blockId: timeId, slotId: 'tMs' },
    { kind: 'port', blockId: ellipseId, slotId: 'rx' },
  );
  const lensId = store.addLens(
    ellipseId,
    'rx',
    'ScaleBias',
    `v1:blocks.${timeId}.outputs.tMs`,
    { scale: 2 },
  );

  return {
    name: 'V1EdgeDecorator',
    decorator: new V1EdgeDecorator(store),
    decoratedEdge: { sourceBlockId: timeId, sourcePortId: 'tMs', targetBlockId: ellipseId, targetPortId: 'rx' },
    bareEdge: { sourceBlockId: timeId, sourcePortId: 'tMs', targetBlockId: ellipseId, targetPortId: 'resolution' },
    editable: { decorationId: lensId, paramId: 'scale', value: 3 },
  };
}

// =============================================================================
// Pillar provider — Constant → Scale → WaveOffset.amplitude. The Scale.out edge
// decorates to [Scale]; the Constant → Scale.in edge is a bare (direct) wire.
// =============================================================================

function sceneCase(): EdgeDecoratorConformanceCase {
  const store = new PillarPatchStore({ blocks: [], edges: [] });
  const constId = store.addBlock('Constant');
  const waveId = store.addBlock('WaveOffset');
  const scaleId = store.addBlock('Scale');
  store.addEdge(constId, scaleId, 'in');
  store.addEdge(scaleId, waveId, 'amplitude');

  return {
    name: 'SceneEdgeDecorator',
    decorator: new SceneEdgeDecorator(store),
    decoratedEdge: { sourceBlockId: scaleId, sourcePortId: 'out', targetBlockId: waveId, targetPortId: 'amplitude' },
    bareEdge: { sourceBlockId: constId, sourcePortId: 'value', targetBlockId: scaleId, targetPortId: 'in' },
    editable: { decorationId: scaleId, paramId: 'factor', value: 2.5 },
  };
}

runEdgeDecoratorConformanceSuite(v1Case());
runEdgeDecoratorConformanceSuite(sceneCase());

// =============================================================================
// Negative control — deliberately-broken decorators the contract MUST reject.
// Each `expect(...).toThrow` pins a distinct invariant to the assertion that
// enforces it, so no assertion can pass vacuously. [LAW:verifiable-goals]
// =============================================================================

const DUMMY = {
  decoratedEdge: { sourceBlockId: 'a', sourcePortId: 'o', targetBlockId: 'b', targetPortId: 'i' },
  bareEdge: { sourceBlockId: 'a', sourcePortId: 'o', targetBlockId: 'b', targetPortId: 'i' },
  editable: { decorationId: 'd', paramId: 'p', value: 9 },
} as const;

/** Returns a chain for EVERY edge — so it decorates the bare edge too. */
const brokenAlwaysDecorates: EdgeDecorator = {
  decorations: () => [{ id: 'x', label: 'x', color: '#fff', tooltip: '', params: [] }],
  setParam: () => {},
};

/** Returns a decoration with empty id/label/color — not a presentable chip. */
const brokenMalformed: EdgeDecorator = {
  decorations: () => [{ id: '', label: '', color: '', tooltip: '', params: [] }],
  setParam: () => {},
};

/** Reports a param but ignores writes — so an edit never reads back. */
const brokenIgnoresSetParam: EdgeDecorator = {
  decorations: () => [
    { id: 'd', label: 'D', color: '#fff', tooltip: '', params: [{ id: 'p', label: 'P', value: 0 }] },
  ],
  setParam: () => {},
};

describe('edge-decorator conformance contract rejects a non-conforming decorator (negative control)', () => {
  it('rejects a decorator that invents a chain for a bare edge', () => {
    expect(() => assertBareEdgeUndecorated({ name: 'x', decorator: brokenAlwaysDecorates, ...DUMMY })).toThrow();
  });

  it('rejects a decorator whose decoration is not a presentable chip', () => {
    expect(() => assertDecoratesKnownEdge({ name: 'x', decorator: brokenMalformed, ...DUMMY })).toThrow();
  });

  it('rejects a decorator that ignores a param write', () => {
    expect(() => assertParamRoundTrips({ name: 'x', decorator: brokenIgnoresSetParam, ...DUMMY })).toThrow();
  });
});

// =============================================================================
// noEdgeDecorator — pinned directly, because it is the one provider the conformance
// contract structurally cannot cover: it decorates no edge, so it supplies no
// decorated-edge / editable-param fixture. It is nonetheless production code (the
// composite editor), so its invariants are asserted here. [LAW:verifiable-goals]
// =============================================================================

describe('noEdgeDecorator', () => {
  const edge = { sourceBlockId: 'a', sourcePortId: 'o', targetBlockId: 'b', targetPortId: 'i' };

  it('decorates no edge', () => {
    expect(noEdgeDecorator.decorations(edge)).toHaveLength(0);
  });

  it('accepts a param write as a no-op without throwing', () => {
    expect(() => noEdgeDecorator.setParam(edge, 'd', 'p', 1)).not.toThrow();
  });
});

// =============================================================================
// SceneEdgeDecorator edge-scopes the write — a pillar decoration id is a globally
// unique block id, so `setParam` must reject a decoration that is not on the given
// edge's chain rather than silently mutating an unrelated block (symmetric with V1).
// =============================================================================

describe('SceneEdgeDecorator edge-scopes setParam', () => {
  function transformRoute() {
    const store = new PillarPatchStore({ blocks: [], edges: [] });
    const constId = store.addBlock('Constant');
    const waveId = store.addBlock('WaveOffset');
    const scaleId = store.addBlock('Scale');
    store.addEdge(constId, scaleId, 'in');
    store.addEdge(scaleId, waveId, 'amplitude');
    return { decorator: new SceneEdgeDecorator(store), constId, waveId, scaleId };
  }

  it('throws when the decoration is not on the given edge', () => {
    const { decorator, constId, scaleId } = transformRoute();
    // Scale is a decoration on (Scale.out -> amplitude), NOT on (Constant -> Scale.in).
    expect(() =>
      decorator.setParam(
        { sourceBlockId: constId, sourcePortId: 'value', targetBlockId: scaleId, targetPortId: 'in' },
        scaleId,
        'factor',
        9,
      ),
    ).toThrow();
  });

  it('accepts the write on the edge the decoration actually decorates', () => {
    const { decorator, waveId, scaleId } = transformRoute();
    expect(() =>
      decorator.setParam(
        { sourceBlockId: scaleId, sourcePortId: 'out', targetBlockId: waveId, targetPortId: 'amplitude' },
        scaleId,
        'factor',
        9,
      ),
    ).not.toThrow();
  });
});
