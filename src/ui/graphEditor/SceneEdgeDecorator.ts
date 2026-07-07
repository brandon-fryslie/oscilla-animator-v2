/**
 * SceneEdgeDecorator — the pillar provider of the EdgeDecorator seam.
 *
 * The pillar model stores no chain on an edge; a scalar route reaches an input
 * through inline `'transform'`-category blocks (Scale / Offset / Clamp). This
 * provider reuses the ONE trace that the Modulation Table reads — `traceRoute` —
 * to recover the chain feeding an edge's target input, and projects each transform
 * block to a neutral step whose params are the block's config fields. A param write
 * routes to `PillarPatchStore.updateConfig`, the same authored-config mutation the
 * table performs, so a chip edit and a table edit are the same store operation on
 * the same source of truth. [LAW:one-source-of-truth]
 *
 * Because a transform block feeds exactly one input and the route is traced from
 * that input, a non-empty chain surfaces on precisely the final input edge of the
 * route — the edge whose target is the consuming input — mirroring where V1 paints
 * its lens chips. A direct wire traces to an empty chain and shows nothing.
 */

import type { PillarPatchStore } from '../../stores/PillarPatchStore';
import { traceRoute } from '../nativeEditor/modulationTable';
import { sceneControlToHint } from './scene-projection';
import type { EdgeDecoration, EdgeDecorator, EdgeRef, DecorationParam } from './edge-decorations';

/** Chip color for a pillar transform step. */
const TRANSFORM_CHIP_COLOR = '#3fb6c4';

export class SceneEdgeDecorator implements EdgeDecorator {
  constructor(private readonly store: PillarPatchStore) {}

  decorations(edge: EdgeRef): readonly EdgeDecoration[] {
    const route = traceRoute(
      this.store.patch,
      this.store.registry,
      edge.targetBlockId,
      edge.targetPortId,
    );
    if (route === null) return [];
    return route.transforms.map((transform) => ({
      id: transform.blockId,
      label: transform.displayName,
      color: TRANSFORM_CHIP_COLOR,
      tooltip: `${transform.displayName} (${transform.type})`,
      params: transform.fields.map(
        (field): DecorationParam => ({
          id: field.key,
          label: field.label,
          value: field.value,
          hint: sceneControlToHint(field.control),
        }),
      ),
    }));
  }

  setParam(edge: EdgeRef, decorationId: string, paramId: string, value: unknown): void {
    // Edge-scope the write symmetrically with the V1 provider. A pillar decoration id
    // is a globally-unique block id, so `updateConfig` alone would happily mutate a
    // transform from an UNRELATED edge; the contract is that `decorationId` names a
    // step on THIS edge. Verify it against the edge's traced chain and throw on a
    // mismatch — the same loud rejection V1's `updateLensParams` gives for a lens not
    // on the target port — rather than silently writing the wrong block's config.
    // [LAW:no-silent-failure]
    const route = traceRoute(
      this.store.patch,
      this.store.registry,
      edge.targetBlockId,
      edge.targetPortId,
    );
    const onEdge = route?.transforms.some((t) => t.blockId === decorationId) ?? false;
    if (!onEdge) {
      throw new Error(
        `EdgeDecorator.setParam: decoration "${decorationId}" is not on edge ` +
          `${edge.sourceBlockId}.${edge.sourcePortId} -> ${edge.targetBlockId}.${edge.targetPortId}`,
      );
    }
    this.store.updateConfig(decorationId, paramId, value);
  }
}
