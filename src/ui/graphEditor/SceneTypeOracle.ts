/**
 * SceneTypeOracle — the pillar provider of the TypeOracle seam.
 *
 * Wraps the pillar's own compatibility algebra (`compareScenePorts` over
 * `SceneValueKind`) and its display projection (`sceneTypeDisplay`), resolving a
 * port reference to its declared value kind through the scene registry. This is
 * the provider that CLOSES the pillar wiring gap: before it, the mature ReactFlow
 * editor mounted the pillar patch with no `patch`, so the drag gate permitted any
 * wire. Now the same gate asks this oracle, and a pillar wire is judged by exactly
 * the algebra `validateScenePatch` reports against. [LAW:one-source-of-truth]
 */

import type { PillarPatchStore } from '../../stores/PillarPatchStore';
import { compareScenePorts } from '../../pillars/scene/port-compatibility';
import type { SceneValueKind } from '../../pillars/scene/scene-block';
import { sceneTypeDisplay } from './scene-projection';
import type { PortTypeDisplay } from './types';
import type {
  ConnectionVerdict,
  PortDirection,
  PortRef,
  TypeOracle,
} from './type-oracle';

export class SceneTypeOracle implements TypeOracle {
  constructor(private readonly store: PillarPatchStore) {}

  /** Resolve a port reference to its declared scene value kind, if it exists. */
  private kindOf(ref: PortRef, direction: PortDirection): SceneValueKind | undefined {
    const block = this.store.patch.blocks.find((b) => b.id === ref.blockId);
    if (!block) return undefined;
    const port = this.store.registry
      .get(block.type)
      ?.catalog.ports.find((p) => p.id === ref.portId && p.direction === direction);
    return port?.value;
  }

  canConnect(source: PortRef, target: PortRef): ConnectionVerdict {
    const from = this.kindOf(source, 'output');
    const to = this.kindOf(target, 'input');
    if (!from || !to) {
      return { kind: 'rejected', reason: 'Unknown port' };
    }
    const verdict = compareScenePorts(from, to);
    switch (verdict.kind) {
      case 'compatible':
        return { kind: 'allowed' };
      case 'adaptationNeeded':
        return { kind: 'allowedViaAdapter', adapterLabel: verdict.via };
      case 'mismatch':
        return { kind: 'rejected', reason: `Cannot wire ${verdict.from} → ${verdict.to}` };
      case 'unsupported':
        return { kind: 'rejected', reason: `${verdict.value} has no ScenePlan realization` };
      default: {
        // A new PortCompatibility kind is a compile error here (the `never`
        // assignment) and, if ever reached at runtime, fails loudly rather than
        // returning undefined or masquerading as a rejection. [LAW:no-silent-failure]
        const _exhaustive: never = verdict;
        throw new Error(`Unhandled scene port compatibility: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }

  describePort(ref: PortRef, direction: PortDirection): PortTypeDisplay | undefined {
    const kind = this.kindOf(ref, direction);
    return kind ? sceneTypeDisplay(kind) : undefined;
  }
}
