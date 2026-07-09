import { describe, expect, it } from 'vitest';
import type { Node } from 'reactflow';
import { reconcileNodesFromAdapter } from '../nodeDataTransform';
import type { BlockLike, EdgeLike, GraphDataAdapter } from '../types';

/**
 * reconcile must carry over a node's `selected` flag — otherwise any data-only
 * refresh (an edit elsewhere, a frontend recompile) would silently clear the
 * user's multi-selection that the clipboard / duplicate ops read from. This pins
 * that contract so it cannot regress. [LAW:one-source-of-truth]
 */

function block(id: string): BlockLike {
  return {
    id,
    type: 'Const',
    typeLabel: 'Const',
    displayName: id,
    params: {},
    inputPorts: new Map(),
    outputPorts: new Map([['out', { id: 'out', label: 'out' }]]),
    controls: [],
  };
}

/** A read-only adapter over a fixed block set; reconcile only reads blocks/edges. */
function readOnlyAdapter(ids: readonly string[]): GraphDataAdapter {
  const blocks = new Map<string, BlockLike>(ids.map((id) => [id, block(id)]));
  return {
    blocks,
    edges: [] as readonly EdgeLike[],
    addBlock: () => { throw new Error('unused'); },
    removeBlock: () => { throw new Error('unused'); },
    getBlockPosition: () => ({ x: 0, y: 0 }),
    setBlockPosition: () => { throw new Error('unused'); },
    addEdge: () => { throw new Error('unused'); },
    removeEdge: () => { throw new Error('unused'); },
  };
}

describe('reconcileNodesFromAdapter selection preservation', () => {
  it('carries over selected from existing nodes and defaults new nodes to unselected', () => {
    const adapter = readOnlyAdapter(['a', 'b', 'c']);
    // 'a' was selected, 'b' not; 'c' is new (no existing node).
    const existing: Node[] = [
      { id: 'a', type: 'unified', position: { x: 0, y: 0 }, data: {}, selected: true },
      { id: 'b', type: 'unified', position: { x: 0, y: 0 }, data: {}, selected: false },
    ];

    const { nodes } = reconcileNodesFromAdapter(adapter, existing, (id) => adapter.getBlockPosition(id));
    const selectedById = new Map(nodes.map((n) => [n.id, n.selected]));

    expect(selectedById.get('a'), 'existing selected node stays selected').toBe(true);
    expect(selectedById.get('b'), 'existing unselected node stays unselected').toBe(false);
    expect(selectedById.get('c'), 'a freshly-projected node is unselected').toBe(false);
  });
});
