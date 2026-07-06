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
import type { SceneConfigControl } from '../../pillars/scene';
import type { UIControlHint } from '../../types';
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
          hint: controlToHint(field.control),
        }),
      ),
    }));
  }

  setParam(_edge: EdgeRef, decorationId: string, paramId: string, value: unknown): void {
    this.store.updateConfig(decorationId, paramId, value);
  }
}

/**
 * Map a scene config control to the editor's neutral widget hint. The numeric and
 * boolean/color controls that transform blocks actually use map exactly; controls
 * that carry data the route projection does not surface (`select` options, asset
 * pickers) return undefined, so the neutral editor falls back to a value-directed
 * widget rather than inventing an empty picker — an explicit deferral, not a silent
 * gap. A new SceneConfigControl is a compile error here, forcing a decision.
 * [LAW:no-silent-failure]
 */
function controlToHint(control: SceneConfigControl): UIControlHint | undefined {
  switch (control) {
    case 'number':
      return { kind: 'float' };
    case 'integer':
      return { kind: 'int' };
    case 'color':
      return { kind: 'color' };
    case 'toggle':
      return { kind: 'boolean' };
    case 'select':
    case 'asset':
    case 'colorList':
      return undefined;
    default: {
      const _exhaustive: never = control;
      throw new Error(`Unhandled SceneConfigControl: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
