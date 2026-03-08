/**
 * Shared topology creation helpers for shape blocks.
 *
 * Extracts the common line-path topology pattern used by
 * ProceduralPolygon, ProceduralStar, MakeShape2D, etc.
 */

import { PathVerb, type PathTopologyDefInput } from '../../shapes/types';

/**
 * Create a line-path topology definition.
 *
 * Topology structure:
 * - MOVE to first point
 * - LINE to each subsequent point
 * - CLOSE path (if closed=true)
 *
 * @param pointCount - Number of control points (must be >= 2)
 * @param closed - Whether the path is closed
 * @returns PathTopologyDefInput (id assigned by registry)
 */
export function createLinePathTopology(pointCount: number, closed: boolean): PathTopologyDefInput {
  if (pointCount < 2) {
    throw new Error(`Path requires at least 2 points, got ${pointCount}`);
  }

  // Build verb sequence: MOVE, LINE, LINE, ..., [CLOSE]
  const verbs: PathVerb[] = [PathVerb.MOVE];
  for (let i = 1; i < pointCount; i++) {
    verbs.push(PathVerb.LINE);
  }
  if (closed) {
    verbs.push(PathVerb.CLOSE);
  }

  // Points per verb: MOVE=1, LINE=1, CLOSE=0
  const pointsPerVerb: number[] = [1]; // MOVE
  for (let i = 1; i < pointCount; i++) {
    pointsPerVerb.push(1); // LINE
  }
  if (closed) {
    pointsPerVerb.push(0); // CLOSE
  }

  return {
    params: [],
    closed,
    verbs,
    pointsPerVerb,
    totalControlPoints: pointCount,
  };
}
