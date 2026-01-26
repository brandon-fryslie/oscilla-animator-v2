# Implementation Context: graph-visualization

**Sprint:** Combine Mode Visual Indication in Graph Editor
**Generated:** 2026-01-25

## Key Files

| File | Purpose |
|------|---------|
| `src/ui/reactFlowEditor/edges/` | Custom edge components |
| `src/ui/reactFlowEditor/EdgeTypes.tsx` | Edge type definitions |
| `src/compiler/passes-v2/combine-utils.ts` | Edge sorting logic reference |

## Non-Contributing Edge Logic

From spec (`design-docs/CANONICAL-oscilla-v2.5-20260109/topics/15-graph-editor-ui.md:136-140`):

> If a combine mode means an input **never contributes** to output (e.g., `combine: 'last'` with deterministic ordering), that upstream path is **always dimmed**

### Algorithm

```typescript
function getNonContributingEdges(
  patch: Patch,
  targetBlockId: BlockId,
  targetPortId: string,
  combineMode: CombineMode
): Set<string> {
  // Get all edges targeting this port
  const edges = patch.edges.filter(
    e => e.to.blockId === targetBlockId && e.to.slotId === targetPortId
  );

  if (edges.length <= 1) {
    return new Set(); // Single edge always contributes
  }

  // For commutative modes, all edges contribute
  const commutativeModes: CombineMode[] = ['sum', 'average', 'max', 'min', 'mul', 'or', 'and'];
  if (commutativeModes.includes(combineMode)) {
    return new Set();
  }

  // Sort edges by deterministic order (edge ID alphabetically)
  const sorted = [...edges].sort((a, b) => a.id.localeCompare(b.id));

  // For 'last', all but last are non-contributing
  if (combineMode === 'last') {
    const nonContributing = sorted.slice(0, -1);
    return new Set(nonContributing.map(e => e.id));
  }

  // For 'first', all but first are non-contributing
  if (combineMode === 'first') {
    const nonContributing = sorted.slice(1);
    return new Set(nonContributing.map(e => e.id));
  }

  // For 'layer', technically all contribute (compositing)
  // But earlier layers may be fully occluded - complex to compute
  // For now, treat as all contributing
  return new Set();
}
```

## ReactFlow Edge Styling

In the edge rendering, apply conditional styles:

```tsx
// In edge component or edge config
const isNonContributing = nonContributingEdges.has(edge.id);

const edgeStyle: React.CSSProperties = {
  opacity: isNonContributing ? 0.3 : 1,
  strokeDasharray: isNonContributing ? '5,5' : undefined,
};
```

## Where to Compute

**Option A: In ReactFlow adapter** (recommended)
- Compute in the component that converts Patch edges to ReactFlow edges
- Memoize based on patch and affected ports

**Option B: In compiler/observation layer**
- Expose via DebugGraph
- More separation but may be overkill

## Tooltip Content

```tsx
title={isNonContributing
  ? `Not contributing: combine mode is '${combineMode}' and this edge has lower priority`
  : undefined}
```

## Edge Priority/Order

Current implementation sorts edges by edge ID (string comparison). This matches the pattern in `combine-utils.ts:334`:

> The last edge in the sorted array "wins" for 'last' mode.

If explicit priority is added later, this logic would change.
