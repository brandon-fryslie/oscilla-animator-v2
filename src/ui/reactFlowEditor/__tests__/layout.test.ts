/**
 * Tests for auto-arrange layout functionality
 *
 * Coverage:
 * - ELK layout algorithm integration
 * - Node positioning without overlaps
 * - Edge case handling (empty graph, single node)
 * - Layout configuration (direction, spacing)
 */

import { describe, it, expect } from 'vitest';
import { getLayoutedElements } from '../layout';
import type { Node, Edge } from 'reactflow';

describe('getLayoutedElements', () => {
  it('should handle empty graph gracefully', async () => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    const result = await getLayoutedElements(nodes, edges);

    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  it('should handle single node', async () => {
    const nodes: Node[] = [
      {
        id: 'node1',
        type: 'oscilla',
        data: { label: 'Test' },
        position: { x: 0, y: 0 },
      },
    ];
    const edges: Edge[] = [];

    const result = await getLayoutedElements(nodes, edges);

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe('node1');
    // Position should be updated by ELK
    expect(result.nodes[0].position).toBeDefined();
    expect(typeof result.nodes[0].position.x).toBe('number');
    expect(typeof result.nodes[0].position.y).toBe('number');
  });

  it('should arrange two connected nodes horizontally (left-to-right)', async () => {
    const nodes: Node[] = [
      {
        id: 'source',
        type: 'oscilla',
        data: { label: 'Source' },
        position: { x: 0, y: 0 },
        width: 200,
        height: 120,
      },
      {
        id: 'target',
        type: 'oscilla',
        data: { label: 'Target' },
        position: { x: 0, y: 0 },
        width: 200,
        height: 120,
      },
    ];
    const edges: Edge[] = [
      {
        id: 'edge1',
        source: 'source',
        target: 'target',
      },
    ];

    const result = await getLayoutedElements(nodes, edges);

    expect(result.nodes).toHaveLength(2);

    const sourceNode = result.nodes.find(n => n.id === 'source')!;
    const targetNode = result.nodes.find(n => n.id === 'target')!;

    // Target should be to the right of source (left-to-right layout)
    expect(targetNode.position.x).toBeGreaterThan(sourceNode.position.x);

    // Nodes should have minimum spacing (100px node spacing + node width)
    const horizontalSpacing = targetNode.position.x - (sourceNode.position.x + (sourceNode.width || 200));
    expect(horizontalSpacing).toBeGreaterThanOrEqual(50); // Some spacing should exist
  });

  it('should arrange three nodes in a chain without overlap', async () => {
    const nodes: Node[] = [
      {
        id: 'node1',
        type: 'oscilla',
        data: { label: 'Node 1' },
        position: { x: 0, y: 0 },
        width: 200,
        height: 120,
      },
      {
        id: 'node2',
        type: 'oscilla',
        data: { label: 'Node 2' },
        position: { x: 0, y: 0 },
        width: 200,
        height: 120,
      },
      {
        id: 'node3',
        type: 'oscilla',
        data: { label: 'Node 3' },
        position: { x: 0, y: 0 },
        width: 200,
        height: 120,
      },
    ];
    const edges: Edge[] = [
      { id: 'edge1', source: 'node1', target: 'node2' },
      { id: 'edge2', source: 'node2', target: 'node3' },
    ];

    const result = await getLayoutedElements(nodes, edges);

    expect(result.nodes).toHaveLength(3);

    // Check no overlaps (each pair of nodes should not overlap)
    for (let i = 0; i < result.nodes.length; i++) {
      for (let j = i + 1; j < result.nodes.length; j++) {
        const nodeA = result.nodes[i];
        const nodeB = result.nodes[j];

        const aRight = nodeA.position.x + (nodeA.width || 200);
        const aBottom = nodeA.position.y + (nodeA.height || 120);
        const bRight = nodeB.position.x + (nodeB.width || 200);
        const bBottom = nodeB.position.y + (nodeB.height || 120);

        // Check if rectangles overlap
        const noOverlap =
          aRight <= nodeB.position.x || // A is left of B
          nodeA.position.x >= bRight || // A is right of B
          aBottom <= nodeB.position.y || // A is above B
          nodeA.position.y >= bBottom;   // A is below B

        expect(noOverlap).toBe(true);
      }
    }
  });

  it('should respect custom layout direction', async () => {
    const nodes: Node[] = [
      {
        id: 'source',
        type: 'oscilla',
        data: { label: 'Source' },
        position: { x: 0, y: 0 },
        width: 200,
        height: 120,
      },
      {
        id: 'target',
        type: 'oscilla',
        data: { label: 'Target' },
        position: { x: 0, y: 0 },
        width: 200,
        height: 120,
      },
    ];
    const edges: Edge[] = [
      {
        id: 'edge1',
        source: 'source',
        target: 'target',
      },
    ];

    // Test DOWN direction (vertical layout)
    const result = await getLayoutedElements(nodes, edges, { direction: 'DOWN' });

    const sourceNode = result.nodes.find(n => n.id === 'source')!;
    const targetNode = result.nodes.find(n => n.id === 'target')!;

    // Target should be below source (top-to-bottom layout)
    expect(targetNode.position.y).toBeGreaterThan(sourceNode.position.y);
  });

  it('should handle disconnected nodes', async () => {
    const nodes: Node[] = [
      {
        id: 'isolated1',
        type: 'oscilla',
        data: { label: 'Isolated 1' },
        position: { x: 0, y: 0 },
      },
      {
        id: 'isolated2',
        type: 'oscilla',
        data: { label: 'Isolated 2' },
        position: { x: 0, y: 0 },
      },
    ];
    const edges: Edge[] = [];

    const result = await getLayoutedElements(nodes, edges);

    expect(result.nodes).toHaveLength(2);
    // Both nodes should have positions assigned
    expect(result.nodes[0].position).toBeDefined();
    expect(result.nodes[1].position).toBeDefined();
  });

  it('should preserve edge data unchanged', async () => {
    const nodes: Node[] = [
      {
        id: 'node1',
        type: 'oscilla',
        data: { label: 'Node 1' },
        position: { x: 0, y: 0 },
      },
      {
        id: 'node2',
        type: 'oscilla',
        data: { label: 'Node 2' },
        position: { x: 0, y: 0 },
      },
    ];
    const edges: Edge[] = [
      {
        id: 'edge1',
        source: 'node1',
        target: 'node2',
        data: { customData: 'test' },
      },
    ];

    const result = await getLayoutedElements(nodes, edges);

    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]).toEqual(edges[0]);
  });

  it('should handle complex graph with multiple layers', async () => {
    // Create a graph like: A -> B -> D
    //                       A -> C -> D
    const nodes: Node[] = [
      { id: 'A', type: 'oscilla', data: {}, position: { x: 0, y: 0 }, width: 200, height: 120 },
      { id: 'B', type: 'oscilla', data: {}, position: { x: 0, y: 0 }, width: 200, height: 120 },
      { id: 'C', type: 'oscilla', data: {}, position: { x: 0, y: 0 }, width: 200, height: 120 },
      { id: 'D', type: 'oscilla', data: {}, position: { x: 0, y: 0 }, width: 200, height: 120 },
    ];
    const edges: Edge[] = [
      { id: 'e1', source: 'A', target: 'B' },
      { id: 'e2', source: 'A', target: 'C' },
      { id: 'e3', source: 'B', target: 'D' },
      { id: 'e4', source: 'C', target: 'D' },
    ];

    const result = await getLayoutedElements(nodes, edges);

    expect(result.nodes).toHaveLength(4);

    const nodeA = result.nodes.find(n => n.id === 'A')!;
    const nodeB = result.nodes.find(n => n.id === 'B')!;
    const nodeC = result.nodes.find(n => n.id === 'C')!;
    const nodeD = result.nodes.find(n => n.id === 'D')!;

    // Layer 0: A should be leftmost
    expect(nodeA.position.x).toBeLessThan(nodeB.position.x);
    expect(nodeA.position.x).toBeLessThan(nodeC.position.x);

    // Layer 2: D should be rightmost
    expect(nodeD.position.x).toBeGreaterThan(nodeA.position.x);
    expect(nodeD.position.x).toBeGreaterThan(nodeB.position.x);
    expect(nodeD.position.x).toBeGreaterThan(nodeC.position.x);

    // B and C should be in middle layer (between A and D)
    expect(nodeB.position.x).toBeGreaterThan(nodeA.position.x);
    expect(nodeB.position.x).toBeLessThan(nodeD.position.x);
    expect(nodeC.position.x).toBeGreaterThan(nodeA.position.x);
    expect(nodeC.position.x).toBeLessThan(nodeD.position.x);
  });

  it('should use default node dimensions when not specified', async () => {
    const nodes: Node[] = [
      {
        id: 'node1',
        type: 'oscilla',
        data: { label: 'No Dimensions' },
        position: { x: 0, y: 0 },
        // width and height not specified
      },
    ];
    const edges: Edge[] = [];

    const result = await getLayoutedElements(nodes, edges);

    expect(result.nodes).toHaveLength(1);
    // Should not crash, should use defaults (200x120 from layout.ts)
    expect(result.nodes[0].position).toBeDefined();
  });
});
