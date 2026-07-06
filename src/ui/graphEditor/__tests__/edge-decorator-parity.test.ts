/**
 * edge-decorator-parity.test — the acceptance gate: the decorator's chain equals
 * what the era's OWN editor authority reports for the same edge, in BOTH boots.
 *
 * This is the whole point of the seam: the canvas edge chips are not a second
 * opinion about an edge's transforms — they ARE the era's own chain, wrapped. So
 * for each era we assert the decorator agrees with its authority:
 *   - V1: the port's lenses filtered by `lensTargetsConnection` (exactly what
 *         OscillaEdge computed before the seam, sorted by `sortKey`).
 *   - pillar: the traced transform chain the Modulation Table renders
 *         (`buildModulationTable` → the row's route).
 * Each era asserts BOTH a decorated edge (non-empty, agreeing) and a bare edge
 * (empty), so the agreement is proven against a discriminating authority, never a
 * vacuous one. [LAW:one-source-of-truth] [LAW:verifiable-goals]
 */

import { describe, expect, it } from 'vitest';

import { registerAllBlocks } from '../../../blocks/all';
import { PatchStore } from '../../../stores/PatchStore';
import { PillarPatchStore } from '../../../stores/PillarPatchStore';
import { lensTargetsConnection } from '../../reactFlowEditor/lensUtils';
import { buildModulationTable } from '../../nativeEditor/modulationTable';

import { V1EdgeDecorator } from '../V1EdgeDecorator';
import { SceneEdgeDecorator } from '../SceneEdgeDecorator';

registerAllBlocks();

describe('edge-decorator parity: chain == era authority', () => {
  it('V1 — the decorator chain equals the lenses the era targets to this connection', () => {
    const store = new PatchStore();
    const timeId = store.addBlock('InfiniteTimeRoot');
    const ellipseId = store.addBlock('Ellipse');
    store.addEdge(
      { kind: 'port', blockId: timeId, slotId: 'tMs' },
      { kind: 'port', blockId: ellipseId, slotId: 'rx' },
    );
    store.addLens(ellipseId, 'rx', 'ScaleBias', `v1:blocks.${timeId}.outputs.tMs`, { scale: 2 });
    const decorator = new V1EdgeDecorator(store);

    // The era's own authority for "which lenses show on this edge".
    const sourceDisplayName = store.blocks.get(timeId)?.displayName;
    const authorityIds = store
      .getLensesForPort(ellipseId, 'rx')
      .filter((lens) => lensTargetsConnection(lens, timeId, 'tMs', sourceDisplayName))
      .slice()
      .sort((a, b) => a.sortKey - b.sortKey)
      .map((lens) => lens.id);

    const decorated = decorator.decorations({
      sourceBlockId: timeId,
      sourcePortId: 'tMs',
      targetBlockId: ellipseId,
      targetPortId: 'rx',
    });
    expect(decorated.map((d) => d.id)).toEqual(authorityIds);
    expect(authorityIds.length, 'decorated edge exercises a non-empty chain').toBeGreaterThan(0);
    // The param value is the attachment's, not a default.
    expect(decorated[0].params.find((p) => p.id === 'scale')?.value).toBe(2);

    // A port the era attaches no lens to is bare.
    const bare = decorator.decorations({
      sourceBlockId: timeId,
      sourcePortId: 'tMs',
      targetBlockId: ellipseId,
      targetPortId: 'resolution',
    });
    expect(bare, 'bare edge exercises the empty case').toHaveLength(0);
  });

  it('pillar — the decorator chain equals the Modulation Table route it traces', () => {
    const store = new PillarPatchStore({ blocks: [], edges: [] });
    const constId = store.addBlock('Constant');
    const waveId = store.addBlock('WaveOffset');
    const scaleId = store.addBlock('Scale');
    store.addEdge(constId, scaleId, 'in');
    store.addEdge(scaleId, waveId, 'amplitude');
    const decorator = new SceneEdgeDecorator(store);

    // The era's own authority: the route the Modulation Table shows for that input.
    const model = buildModulationTable(store.patch, store.registry);
    const rowIndex = model.rows.findIndex((r) => r.blockId === waveId && r.portId === 'amplitude');
    const rowRoute = model.cells[rowIndex][0]?.rowRoute ?? null;
    const authorityIds = rowRoute?.transforms.map((t) => t.blockId) ?? [];

    const decorated = decorator.decorations({
      sourceBlockId: scaleId,
      sourcePortId: 'out',
      targetBlockId: waveId,
      targetPortId: 'amplitude',
    });
    expect(decorated.map((d) => d.id)).toEqual(authorityIds);
    expect(decorated.map((d) => d.id), 'decorated edge exercises a non-empty chain').toEqual([scaleId]);
    // The param value is the transform block's config.
    const configFactor = store.patch.blocks.find((b) => b.id === scaleId)?.config.factor;
    expect(decorated[0].params.find((p) => p.id === 'factor')?.value).toBe(configFactor);

    // The upstream (direct) wire into the transform is bare.
    const bare = decorator.decorations({
      sourceBlockId: constId,
      sourcePortId: 'value',
      targetBlockId: scaleId,
      targetPortId: 'in',
    });
    expect(bare, 'bare edge exercises the empty case').toHaveLength(0);
  });
});
