/**
 * V1EdgeDecorator — the V1 provider of the EdgeDecorator seam.
 *
 * Wraps the SAME lens machinery the V1 editor already reads: the target input
 * port's `LensAttachment` records (filtered to the ones targeting this edge's
 * source, exactly as `OscillaEdge` did through its former direct-store bypass),
 * projected to neutral steps. Each step's params come from the lens block def's
 * non-`in` inputs (values from the attachment); a param write routes straight to
 * `PatchStore.updateLensParams`. It adds no concept of its own — it translates the
 * lens subsystem into the neutral vocabulary so the edge renderer holds no lens
 * opinion. [LAW:one-source-of-truth]
 */

import type { PatchStore } from '../../stores/PatchStore';
import { getAnyBlockDefinition } from '../../blocks/registry';
import type { BlockId } from '../../types';
import { getLensLabel, lensTargetsConnection } from '../reactFlowEditor/lensUtils';
import type { EdgeDecoration, EdgeDecorator, EdgeRef, DecorationParam } from './edge-decorations';

/** Chip color for a V1 lens step — the amber the edge chips have always used. */
const LENS_CHIP_COLOR = '#f0a020';

export class V1EdgeDecorator implements EdgeDecorator {
  constructor(private readonly patch: PatchStore) {}

  decorations(edge: EdgeRef): readonly EdgeDecoration[] {
    const sourceDisplayName = this.patch.blocks.get(edge.sourceBlockId as BlockId)?.displayName;
    const lenses = this.patch.getLensesForPort(edge.targetBlockId as BlockId, edge.targetPortId);
    return lenses
      .filter((lens) =>
        lensTargetsConnection(lens, edge.sourceBlockId, edge.sourcePortId, sourceDisplayName),
      )
      .slice()
      .sort((a, b) => a.sortKey - b.sortKey)
      .map((lens) => ({
        id: lens.id,
        label: getLensLabel(lens.lensType),
        color: LENS_CHIP_COLOR,
        tooltip: `${getLensLabel(lens.lensType)} (${lens.lensType})`,
        params: lensParams(lens.lensType, lens.params),
      }));
  }

  setParam(edge: EdgeRef, decorationId: string, paramId: string, value: unknown): void {
    this.patch.updateLensParams(edge.targetBlockId as BlockId, edge.targetPortId, decorationId, {
      [paramId]: value,
    });
  }
}

/**
 * Project a lens block def's editable inputs (everything but its `in` value port)
 * to neutral params, reading current values from the attachment and falling back
 * to the def default — the exact projection `LensParamControls` performed inline,
 * lifted behind the seam so the neutral param editor can render it. [LAW:decomposition]
 */
function lensParams(
  lensType: string,
  params: Record<string, unknown> | undefined,
): readonly DecorationParam[] {
  // Non-throwing lookup: `decorations()` runs for every edge on every render, so an
  // orphaned lens type (a def unregistered since the patch was authored) must not
  // crash the edge renderer. The chip still renders — `getLensLabel` falls back to a
  // derived label — so the broken lens stays visible; it just carries no editable
  // params. Honest degradation, not a silent drop or a crash. [LAW:no-silent-failure]
  const def = getAnyBlockDefinition(lensType);
  if (!def) return [];
  return Object.entries(def.inputs)
    .filter(([inputId]) => inputId !== 'in')
    .map(([paramId, inputDef]) => ({
      id: paramId,
      label: inputDef.label ?? paramId,
      // The value stays `unknown` — no fabricated `0`. A boolean/color param with
      // no default must not read back a number, or the value-first widget dispatch
      // in DecorationParamControls would render a slider for it. An absent value is
      // chosen by the honest hint/value dispatch instead. [LAW:types-are-the-program]
      value: params?.[paramId] ?? inputDef.defaultValue,
      hint: inputDef.uiHint,
    }));
}
