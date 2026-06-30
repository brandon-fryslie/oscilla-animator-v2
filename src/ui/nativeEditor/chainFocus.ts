/**
 * src/ui/nativeEditor/chainFocus.ts
 *
 * The dataflow-focus model for the native editor canvas. Selecting a block focuses
 * a single PATH through it: a linear walk from a source, through the selected block,
 * to a sink. At each pivot (a block with more than one feeder upstream or more than
 * one consumer downstream) exactly one branch is followed; everything off the path
 * dims — the 'anti-spaghetti' navigation model from the spec. Arrow keys step the
 * selection along that path; right-click rotates the perspective at a pivot to follow
 * a different branch.
 *
 * [LAW:one-source-of-truth] The focused path is DERIVED from `patch.edges` and the
 *   current selection by a directed walk — there is no per-block "on path" flag to
 *   keep in sync. The only stored focus state besides the selection is the
 *   `PerspectiveChoices`: which branch index is followed at each pivot. The path is a
 *   pure function of (edges, selection, choices).
 * [LAW:effects-at-boundaries] These are pure functions over plain edge data. They
 *   touch no store, no reactflow node, no DOM — the canvas performs the rendering
 *   effect at its boundary using the set/ids/choices these return.
 * [LAW:dataflow-not-control-flow] Variability lives in the choices map and the
 *   neighbor list, not in branches: the walk is "follow the chosen neighbor" with the
 *   choice carried as a value, and dimming is `path.has(id) ? full : dim`.
 */
import type { PillarEdge } from '../../pillars/types/graph';

/**
 * Direction along the dataflow. The native graph flows left→right (sources left,
 * sinks right), so `upstream` walks toward sources and `downstream` toward sinks.
 */
export type ChainDirection = 'upstream' | 'downstream';

/**
 * Which neighbor index is followed at each pivot, keyed by block id, per direction.
 * A pivot absent from a map follows index 0 (the first neighbor in edge order). This
 * is the "perspective": rotation advances one entry; the lit path is derived from it.
 */
export interface PerspectiveChoices {
  readonly upstream: ReadonlyMap<string, number>;
  readonly downstream: ReadonlyMap<string, number>;
}

/** The perspective before any rotation: every pivot follows its first branch. */
export const DEFAULT_PERSPECTIVE: PerspectiveChoices = {
  upstream: new Map(),
  downstream: new Map(),
};

/** The block ids directly adjacent to `blockId` in one dataflow direction, in edge order. */
function neighbors(
  edges: readonly PillarEdge[],
  blockId: string,
  direction: ChainDirection,
): string[] {
  return edges
    .filter((e) => (direction === 'upstream' ? e.target === blockId : e.source === blockId))
    .map((e) => (direction === 'upstream' ? e.source : e.target));
}

/**
 * The block one step from `blockId` along `direction` under the current perspective,
 * or `null` when the chain ends there. At a pivot (several neighbors) the chosen
 * index is followed — defaulting to the first in edge order — so the same single
 * decision drives the lit path, the arrow-key walk, and rotation. The index is taken
 * modulo the neighbor count, so it stays valid even if the topology shrinks.
 */
export function stepChain(
  edges: readonly PillarEdge[],
  blockId: string,
  direction: ChainDirection,
  choices: PerspectiveChoices,
): string | null {
  const options = neighbors(edges, blockId, direction);
  if (options.length === 0) return null;
  const index = (choices[direction].get(blockId) ?? 0) % options.length;
  return options[index];
}

/**
 * The block ids on the path from `start` following `direction` under `choices`,
 * excluding `start`. A cycle terminates because visited ids stop the walk.
 */
function walkPath(
  edges: readonly PillarEdge[],
  start: string,
  direction: ChainDirection,
  choices: PerspectiveChoices,
): string[] {
  const path: string[] = [];
  const seen = new Set<string>([start]);
  let current = start;
  for (;;) {
    const next = stepChain(edges, current, direction, choices);
    if (next === null || seen.has(next)) break;
    seen.add(next);
    path.push(next);
    current = next;
  }
  return path;
}

/**
 * The focused path of `selectedId` under `choices`: the block itself, the chosen
 * feeder chain upstream, and the chosen consumer chain downstream. Off-path blocks
 * dim. Rotating a pivot's choice re-roots which branch this path follows.
 */
export function computeFocusPath(
  edges: readonly PillarEdge[],
  selectedId: string,
  choices: PerspectiveChoices,
): ReadonlySet<string> {
  const path = new Set<string>([selectedId]);
  for (const id of walkPath(edges, selectedId, 'upstream', choices)) path.add(id);
  for (const id of walkPath(edges, selectedId, 'downstream', choices)) path.add(id);
  return path;
}

/**
 * The direction whose walk from `selectedId` passes through `pivotId` AND has more
 * than one branch to choose there — `null` if `pivotId` is not a rotatable pivot on
 * the current path. Downstream takes precedence: the only block that can branch both
 * ways on one simple path is the selection itself, so a both-ways selection rotates
 * its consumer branch first (deterministic).
 */
function pivotRotationDirection(
  edges: readonly PillarEdge[],
  selectedId: string,
  choices: PerspectiveChoices,
  pivotId: string,
): ChainDirection | null {
  const onWalk = (direction: ChainDirection): boolean =>
    pivotId === selectedId || walkPath(edges, selectedId, direction, choices).includes(pivotId);
  if (onWalk('downstream') && neighbors(edges, pivotId, 'downstream').length > 1) return 'downstream';
  if (onWalk('upstream') && neighbors(edges, pivotId, 'upstream').length > 1) return 'upstream';
  return null;
}

/**
 * Advance the branch followed at `pivotId`, re-rooting the focused path to its next
 * branch. When `pivotId` is not a rotatable pivot on the current path the perspective
 * is returned unchanged (same reference) — right-clicking a non-pivot has nothing to
 * rotate, which is the correct no-op, not a swallowed failure. // [LAW:no-silent-failure]
 */
export function rotatePerspective(
  edges: readonly PillarEdge[],
  selectedId: string,
  choices: PerspectiveChoices,
  pivotId: string,
): PerspectiveChoices {
  const direction = pivotRotationDirection(edges, selectedId, choices, pivotId);
  if (direction === null) return choices;
  const count = neighbors(edges, pivotId, direction).length;
  const next = new Map(choices[direction]);
  next.set(pivotId, ((choices[direction].get(pivotId) ?? 0) + 1) % count);
  return { ...choices, [direction]: next };
}
