/**
 * selection-detail-parity.test — the acceptance gate: the detail equals what the
 * era's OWN authority reports for the same selection, in BOTH boots.
 *
 * This is the whole point of the seam: the inspector is not a second opinion about
 * a block/edge — it IS the era's own model, wrapped. So for each era we assert the
 * detail agrees with its authority:
 *   - V1: the registry block def (exposed input ports; non-port config params) and
 *         the patch edges (endpoints).
 *   - pillar: the scene catalog (ports; config fields) and `traceRoute` (the edge's
 *         transform chain, the same trace the Modulation Table renders).
 * Each era asserts a NON-EMPTY case (real ports, real config, a real transform on
 * the edge), so the agreement is proven against a discriminating authority, never a
 * vacuous one. [LAW:one-source-of-truth] [LAW:verifiable-goals]
 */

import { describe, expect, it } from 'vitest';

import { registerAllBlocks } from '../../../blocks/all';
import { PatchStore } from '../../../stores/PatchStore';
import { FrontendResultStore } from '../../../stores/FrontendResultStore';
import { PillarPatchStore } from '../../../stores/PillarPatchStore';
import { getAnyBlockDefinition } from '../../../blocks/registry';
import { traceRoute } from '../../nativeEditor/modulationTable';

import { V1SelectionDetail } from '../V1SelectionDetail';
import { SceneSelectionDetail } from '../SceneSelectionDetail';

registerAllBlocks();

describe('selection-detail parity: detail == era authority', () => {
  it('V1 — block detail matches the registry def; edge detail matches the patch edge', () => {
    const store = new PatchStore();
    const timeId = store.addBlock('InfiniteTimeRoot');
    const compareId = store.addBlock('Compare');
    const edgeId = store.addEdge(
      { kind: 'port', blockId: timeId, slotId: 'tMs' },
      { kind: 'port', blockId: compareId, slotId: 'a' },
    );
    const detail = new V1SelectionDetail(store, new FrontendResultStore());

    // Authority: the registry def's input ports (exactly the set the V1 inspector
    // listed) and its NON-port params as config. `op` is exposedAsPort:false, so it is
    // BOTH a listed input and an editable config field — the same split V1 showed.
    const def = getAnyBlockDefinition('Compare')!;
    const authorityInputs = Object.keys(def.inputs);
    const authorityConfig = Object.keys(store.patch.blocks.get(compareId as never)!.params).filter(
      (k) => k !== 'payloadType' && def.inputs[k]?.exposedAsPort === false,
    );

    const block = detail.describeBlock(compareId)!;
    expect(block.inputs.map((p) => p.id).sort()).toEqual(authorityInputs.sort());
    expect(authorityInputs.length, 'block exercises a non-empty port set').toBeGreaterThan(0);

    const configIds = block.config.map((f) => (f.kind === 'control' ? f.control.id : 'expr'));
    expect(configIds.sort()).toEqual(authorityConfig.sort());
    expect(configIds).toContain('op');

    // Edge endpoints agree with the patch edge.
    const edge = detail.describeEdge(edgeId)!;
    expect(edge.source.blockId).toBe(timeId);
    expect(edge.source.portId).toBe('tMs');
    expect(edge.target.blockId).toBe(compareId);
    expect(edge.target.portId).toBe('a');
  });

  it('pillar — block detail matches the catalog; edge chain matches the traced route', () => {
    const store = new PillarPatchStore({ blocks: [], edges: [] });
    const constId = store.addBlock('Constant');
    const waveId = store.addBlock('WaveOffset');
    const scaleId = store.addBlock('Scale');
    store.addEdge(constId, scaleId, 'in');
    const edgeId = store.addEdge(scaleId, waveId, 'amplitude');
    const detail = new SceneSelectionDetail(store);

    // Authority: the scene catalog's ports + config fields.
    const catalog = store.registry.get('WaveOffset')!.catalog;
    const authorityInputs = catalog.ports.filter((p) => p.direction === 'input').map((p) => p.id);
    const authorityConfig = catalog.configFields.map((f) => f.key);

    const block = detail.describeBlock(waveId)!;
    expect(block.inputs.map((p) => p.id).sort()).toEqual(authorityInputs.sort());
    expect(block.config.map((f) => (f.kind === 'control' ? f.control.id : 'expr')).sort()).toEqual(
      authorityConfig.slice().sort(),
    );
    expect(authorityInputs.length, 'block exercises a non-empty port set').toBeGreaterThan(0);

    // Authority: the traced transform chain the Modulation Table reads.
    const route = traceRoute(store.patch, store.registry, waveId, 'amplitude');
    const authorityChain = route?.transforms.map((t) => t.displayName) ?? [];
    const edge = detail.describeEdge(edgeId)!;
    expect(edge.chain.map((s) => s.label)).toEqual(authorityChain);
    expect(authorityChain.length, 'edge exercises a non-empty transform chain').toBe(1);
    void scaleId;
  });
});
