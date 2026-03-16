/**
 * ShapeBank Geometry Seam — Route classifier for ShapeBank-driven geometry consumption.
 *
 * // [LAW:one-source-of-truth] Geometry route classification is derived from
 * // canonical ShapeBank header fields only (Kind, TopologyMode, Flags,
 * // VertexCount, ParamBlockOffset, ParamBlockWords). Worker-derived fields
 * // (IndexCount, FirstIndex, BaseVertex, FirstVertex) are never read.
 *
 * This module introduces the seam that enables RECOVER-04 to cut Type 1 Rigid
 * shapes over from CPU-realized vertex/index buffers to direct ShapeBank
 * topology-buffer consumption.
 */

import {
  SHAPE_BANK_HEADER_WORDS,
  ShapeBankHeaderWord,
} from '../../runtime/RuntimeState';
import { ShapeClass, TopologyMode } from '../../shapes/types';
import type { RenderShapeBankSource } from './WebGPUShapeBankManager';

// =============================================================================
// Geometry Route Types
// =============================================================================

/**
 * Canonical fields extracted from a ShapeBank header for direct geometry
 * consumption. Only canonical (immutable-after-materialization) fields appear.
 *
 * // [LAW:one-source-of-truth] These fields are read from ShapeBankState.data
 * // at word offsets defined by ShapeBankHeaderWord. No worker-derived fields.
 */
export interface ShapeBankDirectGeometry {
  /** Word offset of this shape's header in the ShapeBank buffer. */
  readonly shapeWordOffset: number;
  /** ShapeClass value from header Kind word. */
  readonly shapeClass: ShapeClass;
  /** TopologyMode from header. */
  readonly topologyMode: TopologyMode;
  /** Flags word (bit 0 = closed for path topologies). */
  readonly flags: number;
  /** Number of control-point vertices from canonical header. */
  readonly vertexCount: number;
  /** Word offset of control-point payload in ShapeBank. */
  readonly paramBlockOffset: number;
  /** Word count of control-point payload. */
  readonly paramBlockWords: number;
}

/**
 * Geometry route for a single shape handle.
 *
 * - `shapeBankDirect`: Shape can consume geometry directly from the ShapeBank
 *   topology GPU storage buffer. The render pass vertex shader reads control
 *   points from the topology buffer at paramBlockOffset.
 *
 * - `legacy`: Shape uses the existing CPU-realized vertex/index buffer path.
 *   This is the fallback for shapes whose ShapeClass is not yet supported
 *   by the direct path.
 */
export type GeometryRoute =
  | { readonly kind: 'shapeBankDirect'; readonly geometry: ShapeBankDirectGeometry }
  | { readonly kind: 'legacy' };

// =============================================================================
// Route Classification
// =============================================================================

/**
 * Read canonical header fields at the given word offset and classify the
 * geometry route for this shape.
 *
 * // [LAW:one-source-of-truth] Classification reads only canonical header
 * // words. Worker-derived geometry offsets are not consulted.
 */
export function classifyGeometryRoute(
  data: Uint32Array,
  shapeWordOffset: number,
): GeometryRoute {
  const kind = data[shapeWordOffset + ShapeBankHeaderWord.Kind]! >>> 0;

  if (kind !== ShapeClass.Type1Rigid) {
    return { kind: 'legacy' };
  }

  const topologyMode = data[shapeWordOffset + ShapeBankHeaderWord.TopologyMode]! >>> 0;
  const flags = data[shapeWordOffset + ShapeBankHeaderWord.Flags]! >>> 0;
  const vertexCount = data[shapeWordOffset + ShapeBankHeaderWord.VertexCount]! >>> 0;
  const paramBlockOffset = data[shapeWordOffset + ShapeBankHeaderWord.ParamBlockOffset]! >>> 0;
  const paramBlockWords = data[shapeWordOffset + ShapeBankHeaderWord.ParamBlockWords]! >>> 0;

  return {
    kind: 'shapeBankDirect',
    geometry: {
      shapeWordOffset,
      shapeClass: ShapeClass.Type1Rigid,
      topologyMode: topologyMode as TopologyMode,
      flags,
      vertexCount,
      paramBlockOffset,
      paramBlockWords,
    },
  };
}

// =============================================================================
// Bulk Classification
// =============================================================================

/**
 * Classify geometry routes for all shapes in a ShapeBank source.
 *
 * Returns a Map from shape word offset → GeometryRoute.
 *
 * // [LAW:one-source-of-truth] Routes are derived from canonical ShapeBank
 * // header data. This map is the single classification authority for
 * // render-time geometry source selection.
 */
export function classifyAllGeometryRoutes(
  source: RenderShapeBankSource,
): Map<number, GeometryRoute> {
  const routes = new Map<number, GeometryRoute>();

  for (
    let handle = 0;
    handle + SHAPE_BANK_HEADER_WORDS <= source.volatilePtr;
    handle += SHAPE_BANK_HEADER_WORDS
  ) {
    // Skip empty headers (all zeros)
    let hasPayload = false;
    for (let word = 0; word < SHAPE_BANK_HEADER_WORDS; word++) {
      if (source.data[handle + word] !== 0) {
        hasPayload = true;
        break;
      }
    }
    if (!hasPayload) {
      continue;
    }

    routes.set(handle, classifyGeometryRoute(source.data, handle));
  }

  return routes;
}

/**
 * Count how many shapes in a route map use the shapeBankDirect path.
 */
export function countDirectRoutes(routes: Map<number, GeometryRoute>): number {
  let count = 0;
  for (const route of routes.values()) {
    if (route.kind === 'shapeBankDirect') {
      count++;
    }
  }
  return count;
}

/**
 * Check if any shape in the route map uses the shapeBankDirect path.
 */
export function hasDirectRoutes(routes: Map<number, GeometryRoute>): boolean {
  for (const route of routes.values()) {
    if (route.kind === 'shapeBankDirect') {
      return true;
    }
  }
  return false;
}
