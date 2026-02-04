/**
 * Shared ReactFlow edge data types.
 *
 * NOTE: This file was stripped to only its live exports.
 * The old node creation functions (createNodeFromBlock, getEffectiveDefaultSource,
 * createEdgeFromPatchEdge, etc.) were dead code — only consumed by the deleted sync.ts.
 * The live rendering path uses nodeDataTransform.ts in src/ui/graphEditor/.
 */

import type { LensAttachment } from '../../graph/Patch';
import type { Diagnostic } from '../../diagnostics/types';

/**
 * Custom data stored in each ReactFlow edge.
 * Used for lens visualization, error display, and other edge metadata.
 */
export interface OscillaEdgeData {
  /** Lenses attached to the target port for this connection */
  lenses?: readonly LensAttachment[];
  /** Whether this edge has an auto-inserted adapter */
  hasAdapter?: boolean;
  /** Whether this edge contributes to the final value (for multiedge ports) */
  isNonContributing?: boolean;
  /** Diagnostics affecting this edge (errors, warnings) */
  diagnostics?: Diagnostic[];
}
