/**
 * src/pillars/scene/blocks/instance-grid.ts
 *
 * Instance-source block: lays a `rows × cols` grid of animated instances and
 * emits the per-instance field bundle (position, rotation, color) as PlanExprs.
 *
 * This is where authored *parameters* become backend-neutral *expressions* —
 * the "Oscilla fields/expressions → TSL expressions" mapping of the migration
 * (design-docs/three-fork-integration-proposal.md §3). The block stores scalar
 * grid/animation parameters; the lowering synthesizes the index/rank math.
 *
 * [LAW:one-source-of-truth] `rows`/`cols`/`spacing`/animation coefficients are
 *   the canonical authored intent; the `PlanExpr` trees below are derived from
 *   them, never stored alongside them.
 * [LAW:dataflow-not-control-flow] Per-instance variation lives in the *values*
 *   (the `index`/`rank` intrinsics flowing through the expressions), not in any
 *   per-instance branch.
 */

import {
  add,
  div,
  floor,
  input,
  intrinsic,
  konst,
  mod,
  mul,
} from '../../../render/scene-plan';
import {
  readFiniteNumber,
  readPositiveInt,
  readPositiveNumber,
  type SceneBlockDefinition,
  type SceneContribution,
} from '../scene-block';

interface InstanceGridConfig {
  readonly rows: number;
  readonly cols: number;
  readonly spacing: number;
  readonly rotationPerIndex: number;
  readonly rotationPerTime: number;
  readonly huePerTime: number;
  readonly saturation: number;
  readonly lightness: number;
}

export const InstanceGridBlock: SceneBlockDefinition<InstanceGridConfig> = {
  type: 'InstanceGrid',
  role: 'instanceSource',

  readConfig: (raw, blockId, diagnostics) => {
    const rows = readPositiveInt(raw, 'rows', blockId, diagnostics);
    const cols = readPositiveInt(raw, 'cols', blockId, diagnostics);
    const spacing = readPositiveNumber(raw, 'spacing', blockId, diagnostics);
    const rotationPerIndex = readFiniteNumber(raw, 'rotationPerIndex', blockId, diagnostics);
    const rotationPerTime = readFiniteNumber(raw, 'rotationPerTime', blockId, diagnostics);
    const huePerTime = readFiniteNumber(raw, 'huePerTime', blockId, diagnostics);
    const saturation = readFiniteNumber(raw, 'saturation', blockId, diagnostics);
    const lightness = readFiniteNumber(raw, 'lightness', blockId, diagnostics);

    if (
      rows === null ||
      cols === null ||
      spacing === null ||
      rotationPerIndex === null ||
      rotationPerTime === null ||
      huePerTime === null ||
      saturation === null ||
      lightness === null
    ) {
      return null;
    }
    return { rows, cols, spacing, rotationPerIndex, rotationPerTime, huePerTime, saturation, lightness };
  },

  contribute: (config): SceneContribution => {
    const index = intrinsic('index');
    const rank = intrinsic('rank');
    const time = input('time');

    // Grid placement: row-major. col = index % cols; row = floor(index / cols).
    const col = mod(index, konst(config.cols));
    const row = floor(div(index, konst(config.cols)));

    return {
      role: 'instanceSource',
      bundle: {
        count: config.rows * config.cols,
        transform: {
          positionX: mul(col, konst(config.spacing)),
          positionY: mul(row, konst(config.spacing)),
          // rotation = index * rotationPerIndex + time * rotationPerTime
          rotation: add(
            mul(index, konst(config.rotationPerIndex)),
            mul(time, konst(config.rotationPerTime)),
          ),
        },
        color: {
          space: 'hsl',
          // hue spreads across the grid by normalized rank and cycles over time.
          h: add(rank, mul(time, konst(config.huePerTime))),
          s: konst(config.saturation),
          l: konst(config.lightness),
        },
      },
    };
  },
};
