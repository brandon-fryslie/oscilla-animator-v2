/**
 * src/ui/nativeEditor/chainFocus.ts
 *
 * The dataflow-chain focus model for the native editor canvas. Selecting a block
 * focuses its chain: the block plus everything that feeds it (upstream, transitively)
 * and everything it feeds (downstream, transitively). Off-chain blocks dim — the
 * 'anti-spaghetti' navigation model from the spec. Arrow keys step the selection
 * along that chain.
 *
 * [LAW:one-source-of-truth] Chain membership is DERIVED from `patch.edges` by a
 *   transitive reachability walk — there is no per-block "on chain" flag to keep in
 *   sync. The edge graph is the sole authority; the chain set is a pure function of
 *   it and the selected id.
 * [LAW:effects-at-boundaries] These are pure functions over plain edge data. They
 *   touch no store, no reactflow node, no DOM — the canvas performs the rendering
 *   effect at its boundary using the sets/ids these return.
 * [LAW:dataflow-not-control-flow] Variability lives in the derived chain set and the
 *   neighbor list, not in branches: dimming is `chain.has(id) ? full : dim` over a
 *   set this module computes, and traversal is "the first neighbor in a direction".
 */
import type { PillarEdge } from '../../pillars/types/graph';

/**
 * Direction along the dataflow. The native graph flows left→right (sources left,
 * sinks right), so `upstream` walks toward sources and `downstream` toward sinks.
 */
export type ChainDirection = 'upstream' | 'downstream';

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

/** Block ids reachable from `start` by repeatedly following `direction`, excluding `start`. */
function reachable(
  edges: readonly PillarEdge[],
  start: string,
  direction: ChainDirection,
): Set<string> {
  const found = new Set<string>();
  const frontier = [start];
  while (frontier.length > 0) {
    const id = frontier.pop() as string;
    for (const next of neighbors(edges, id, direction)) {
      if (!found.has(next)) {
        found.add(next);
        frontier.push(next);
      }
    }
  }
  return found;
}

/**
 * The full dataflow chain of `selectedId`: the block itself, all transitive feeders
 * (upstream) and all transitive consumers (downstream). A cycle terminates because
 * the reachability walk records visited ids.
 */
export function computeChainSet(
  edges: readonly PillarEdge[],
  selectedId: string,
): ReadonlySet<string> {
  const chain = new Set<string>([selectedId]);
  for (const id of reachable(edges, selectedId, 'upstream')) chain.add(id);
  for (const id of reachable(edges, selectedId, 'downstream')) chain.add(id);
  return chain;
}

/**
 * The block one step from `selectedId` along `direction`, or `null` if the chain
 * ends there. When a block branches (several neighbors in one direction) the first
 * in edge order is chosen — deterministic, and unambiguous on the linear chains the
 * layout produces; branch navigation is the perspective-rotation behavior, not this.
 */
export function stepChain(
  edges: readonly PillarEdge[],
  selectedId: string,
  direction: ChainDirection,
): string | null {
  return neighbors(edges, selectedId, direction)[0] ?? null;
}
