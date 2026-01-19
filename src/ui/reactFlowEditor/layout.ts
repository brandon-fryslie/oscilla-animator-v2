/**
 * Auto-arrange layout using ELKjs.
 * Computes node positions for a layered left-to-right graph.
 */
import ELK from 'elkjs/lib/elk.bundled.js';
import type { Node, Edge } from 'reactflow';

const elk = new ELK();

// Default node dimensions (can be overridden per-node)
const DEFAULT_NODE_WIDTH = 200;
const DEFAULT_NODE_HEIGHT = 120;

export interface LayoutOptions {
  direction?: 'RIGHT' | 'DOWN' | 'LEFT' | 'UP';
  nodeSpacing?: number;
  layerSpacing?: number;
}

const DEFAULT_OPTIONS: LayoutOptions = {
  direction: 'RIGHT',
  nodeSpacing: 100,
  layerSpacing: 80,
};

/**
 * Compute layout for React Flow nodes using ELK algorithm.
 * Returns new node array with updated positions.
 */
export async function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  options: LayoutOptions = {}
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  const { direction = 'RIGHT', nodeSpacing = 100, layerSpacing = 80 } = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  // Build ELK graph structure
  const elkGraph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction,
      'elk.spacing.nodeNode': String(nodeSpacing),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(layerSpacing),
      'elk.padding': '[top=20,left=20,bottom=20,right=20]',
    },
    children: nodes.map((node) => ({
      id: node.id,
      width: node.width ?? DEFAULT_NODE_WIDTH,
      height: node.height ?? DEFAULT_NODE_HEIGHT,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };

  // Run ELK layout algorithm
  const layoutedGraph = await elk.layout(elkGraph);

  // Map positions back to React Flow nodes
  const layoutedNodes = nodes.map((node) => {
    const elkNode = layoutedGraph.children?.find((n) => n.id === node.id);
    if (elkNode) {
      return {
        ...node,
        position: {
          x: elkNode.x ?? 0,
          y: elkNode.y ?? 0,
        },
      };
    }
    return node;
  });

  return { nodes: layoutedNodes, edges };
}
