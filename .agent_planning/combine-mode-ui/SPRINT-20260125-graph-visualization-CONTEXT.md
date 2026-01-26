# Implementation Context: graph-visualization

**Sprint:** Combine Mode Visual Indication in Graph Editor
**Generated:** 2026-01-25
**Updated:** 2026-01-25 (unknowns resolved)

## Key Files

| File | Purpose |
|------|---------|
| `src/ui/reactFlowEditor/nodes.ts` | Edge creation - modify `createEdgeFromPatchEdge` |
| `src/ui/reactFlowEditor/sync.ts` | Patch→ReactFlow conversion - compute non-contributing edges |
| `src/compiler/passes-v2/combine-utils.ts` | `sortEdgesBySortKey` - reuse for ordering |
| `src/graph/Patch.ts` | `Edge.sortKey` field (now required) |

## Edge Sorting Logic

From `combine-utils.ts:339-349`:

```typescript
export function sortEdgesBySortKey(edges: readonly Edge[]): Edge[] {
  return [...edges].sort((a, b) => {
    const sortKeyA = a.sortKey ?? 0;
    const sortKeyB = b.sortKey ?? 0;
    if (sortKeyA !== sortKeyB) {
      return sortKeyA - sortKeyB;
    }
    return a.id.localeCompare(b.id);
  });
}
```

**Important:** `sortKey` is now REQUIRED on Edge (Sprint 1 change). No need for `?? 0` fallback.

## Non-Contributing Edge Logic

```typescript
import { sortEdgesBySortKey } from '../../compiler/passes-v2/combine-utils';
import type { CombineMode } from '../../types';
import type { Patch, Edge } from '../../graph/Patch';

/**
 * Get IDs of edges that don't contribute to a port's final value.
 * For 'last' mode, all but the highest-sortKey edge are non-contributing.
 * For 'first' mode, all but the lowest-sortKey edge are non-contributing.
 * For commutative modes (sum, etc.), all edges contribute.
 */
export function getNonContributingEdges(
  patch: Patch,
  targetBlockId: string,
  targetPortId: string,
  combineMode: CombineMode
): Set<string> {
  // Get all edges targeting this port
  const edgesToPort = patch.edges.filter(
    e => e.to.blockId === targetBlockId && e.to.slotId === targetPortId
  );

  // Single edge always contributes
  if (edgesToPort.length <= 1) {
    return new Set();
  }

  // Commutative modes: all edges contribute
  const commutativeModes: CombineMode[] = ['sum', 'average', 'max', 'min', 'mul', 'or', 'and'];
  if (commutativeModes.includes(combineMode)) {
    return new Set();
  }

  // Sort by sortKey (ascending), then edge ID
  const sorted = sortEdgesBySortKey(edgesToPort);

  // 'last': highest sortKey wins → all but last are non-contributing
  if (combineMode === 'last') {
    return new Set(sorted.slice(0, -1).map(e => e.id));
  }

  // 'first': lowest sortKey wins → all but first are non-contributing
  if (combineMode === 'first') {
    return new Set(sorted.slice(1).map(e => e.id));
  }

  // 'layer': all contribute (occlusion is complex, treat as all visible)
  return new Set();
}
```

## Computing All Non-Contributing Edges

```typescript
/**
 * Compute non-contributing edges for ALL ports in a patch.
 * Returns a Set of edge IDs that should be visually dimmed.
 */
export function computeAllNonContributingEdges(patch: Patch): Set<string> {
  const nonContributing = new Set<string>();

  // Group edges by target port
  const edgesByTarget = new Map<string, Edge[]>();
  for (const edge of patch.edges) {
    const key = `${edge.to.blockId}:${edge.to.slotId}`;
    if (!edgesByTarget.has(key)) {
      edgesByTarget.set(key, []);
    }
    edgesByTarget.get(key)!.push(edge);
  }

  // For each port with multiple edges, check combine mode
  for (const [key, edges] of edgesByTarget) {
    if (edges.length <= 1) continue;

    const [blockId, portId] = key.split(':');
    const block = patch.blocks.get(blockId);
    if (!block) continue;

    const inputPort = block.inputPorts.get(portId);
    if (!inputPort) continue;

    const combineMode = inputPort.combineMode;
    const nonContributingForPort = getNonContributingEdges(
      patch, blockId, portId, combineMode
    );

    for (const edgeId of nonContributingForPort) {
      nonContributing.add(edgeId);
    }
  }

  return nonContributing;
}
```

## Modifying createEdgeFromPatchEdge

In `nodes.ts`, update the function signature and implementation:

```typescript
export function createEdgeFromPatchEdge(
  edge: Edge,
  blocks?: ReadonlyMap<BlockId, Block>,
  nonContributingEdges?: Set<string>
): ReactFlowEdge {
  const isNonContributing = nonContributingEdges?.has(edge.id) ?? false;

  const rfEdge: ReactFlowEdge = {
    id: edge.id,
    source: edge.from.blockId,
    target: edge.to.blockId,
    sourceHandle: edge.from.slotId,
    targetHandle: edge.to.slotId,
    type: 'default',
    style: isNonContributing
      ? { opacity: 0.3, strokeDasharray: '5,5' }
      : undefined,
    label: isNonContributing
      ? 'Not contributing'
      : undefined,
  };

  // ... rest of existing logic
  return rfEdge;
}
```

## Updating sync.ts

In `buildNodesAndEdgesWithPositions`:

```typescript
// Before mapping edges, compute non-contributing set
const nonContributingEdges = computeAllNonContributingEdges(patch);

// Map edges with non-contributing info
const edges = patch.edges.map(e =>
  createEdgeFromPatchEdge(e, patch.blocks, nonContributingEdges)
);
```

## ReactFlow Edge Styling

ReactFlow edge styling via `style` prop:
- `opacity: 0.3` - Makes edge visually subdued
- `strokeDasharray: '5,5'` - Creates dashed line pattern

For tooltip on hover, options:
1. Simple: Use `label` prop (shows text along edge)
2. Rich: Use `data` prop and custom edge component with title attribute

Start with option 1 for simplicity.

## Testing

1. Create a patch with multiple edges to one input port
2. Default combine mode should be 'last'
3. Verify all but one edge is dimmed
4. Change combine mode to 'first' in port inspector
5. Verify different edge is now un-dimmed
6. Change to 'sum'
7. Verify all edges are full opacity
