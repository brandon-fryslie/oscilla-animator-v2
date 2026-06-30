/**
 * src/ui/nativeEditor/graphLayout.ts
 *
 * Automatic left-to-right layered layout for the native editor's node graph,
 * computed with ELK. The native editor positions blocks algorithmically — the
 * user never drags a node — so this is the single owner of node placement.
 *
 * [LAW:effects-at-boundaries] A pure transform `(nodes, edges) -> positioned
 *   nodes`. The one effect (`elk.layout`) is awaited; the caller performs it at
 *   its boundary and feeds the positioned result to the renderer.
 * [LAW:one-way-deps] The native editor owns its layout. It deliberately does NOT
 *   import the V1 `reactFlowEditor` layout helper: that module is deprecated and
 *   slated for deletion, and the live native editor must not dangle on dead code.
 */
import ELK from 'elkjs/lib/elk.bundled.js';
import type { Node, Edge } from 'reactflow';

const elk = new ELK();

/** Fallback box used only when a node has not been measured yet. */
const FALLBACK_NODE_WIDTH = 180;
const FALLBACK_NODE_HEIGHT = 90;

/**
 * Position `nodes` in a compact left-to-right layered graph (sources left,
 * sinks right) and return a new node array with `position` filled in. Edges are
 * unchanged — they are read only to derive the layering.
 */
export async function layoutGraphLeftToRight(
  nodes: Node[],
  edges: Edge[],
): Promise<Node[]> {
  const elkGraph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': '36',
      'elk.layered.spacing.nodeNodeBetweenLayers': '110',
      'elk.padding': '[top=24,left=24,bottom=24,right=24]',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.layered.nodePlacement.favorStraightEdges': 'true',
      'elk.edgeRouting': 'POLYLINE',
      'elk.layered.thoroughness': '10',
      'elk.aspectRatio': '2.0',
    },
    children: nodes.map((node) => ({
      id: node.id,
      width: node.width ?? FALLBACK_NODE_WIDTH,
      height: node.height ?? FALLBACK_NODE_HEIGHT,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };

  const laidOut = await elk.layout(elkGraph);
  const positionById = new Map(
    (laidOut.children ?? []).map((child) => [child.id, child]),
  );

  return nodes.map((node) => {
    const placed = positionById.get(node.id);
    if (placed === undefined) return node;
    return { ...node, position: { x: placed.x ?? 0, y: placed.y ?? 0 } };
  });
}
