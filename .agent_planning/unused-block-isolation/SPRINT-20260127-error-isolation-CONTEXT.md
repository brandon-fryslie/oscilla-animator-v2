# Implementation Context: Error Isolation for Unused Blocks

**Sprint**: SPRINT-20260127-error-isolation
**Date**: 2026-01-27

## Architecture Overview

### Current Error Flow

```
Pass 6 (lowerBlockInstance)
    │
    ├── Block has error → push to errors[]
    │
    ▼
compile.ts (line 262-270)
    │
    ├── errors.length > 0 → return CompileFailure
    │
    ▼
Never reaches Pass 7
```

### Proposed Error Flow

```
Pass 6 (lowerBlockInstance)
    │
    ├── Block has error → push to errors[]
    │
    ▼
compile.ts (new logic after Pass 6)
    │
    ├── Compute reachable blocks
    ├── Partition errors by reachability
    ├── Unreachable errors → convert to warnings
    │
    ├── reachableErrors.length > 0 → return CompileFailure
    │
    ▼
Pass 7 (continues normally)
```

## Key Files

### src/compiler/reachability.ts (NEW)

```typescript
/**
 * Compute set of blocks reachable from render blocks.
 * A block is reachable if it transitively feeds into any render block.
 */
export function computeRenderReachableBlocks(
  blocks: readonly Block[],
  edges: readonly NormalizedEdge[]
): Set<BlockIndex> {
  // Find render blocks
  const renderBlocks = findRenderBlocks(blocks);

  // BFS backward from render blocks
  const reachable = new Set<BlockIndex>();
  const queue: BlockIndex[] = renderBlocks.map(r => r.index);

  while (queue.length > 0) {
    const blockIdx = queue.shift()!;
    if (reachable.has(blockIdx)) continue;
    reachable.add(blockIdx);

    // Find all edges targeting this block
    for (const edge of edges) {
      if (edge.toBlock === blockIdx && !reachable.has(edge.fromBlock)) {
        queue.push(edge.fromBlock);
      }
    }
  }

  return reachable;
}
```

### src/compiler/compile.ts (MODIFY)

After Pass 6, before error check:

```typescript
// Check for errors from pass 6
if (unlinkedIR.errors.length > 0) {
  // NEW: Compute reachability and filter errors
  const reachableBlocks = computeRenderReachableBlocks(
    validated.blocks,
    validated.edges
  );

  // Build blockId → blockIndex map
  const blockIdToIndex = new Map<string, BlockIndex>();
  for (let i = 0; i < validated.blocks.length; i++) {
    blockIdToIndex.set(validated.blocks[i].id, i as BlockIndex);
  }

  // Partition errors
  const reachableErrors: CompileError[] = [];
  const unreachableErrors: CompileError[] = [];

  for (const error of unlinkedIR.errors) {
    const blockIdx = error.blockId
      ? blockIdToIndex.get(error.blockId)
      : undefined;

    if (blockIdx === undefined || reachableBlocks.has(blockIdx)) {
      reachableErrors.push(error);
    } else {
      unreachableErrors.push(error);
    }
  }

  // Convert unreachable errors to warnings
  if (unreachableErrors.length > 0) {
    emitUnreachableBlockWarnings(unreachableErrors, options);
  }

  // Only fail on reachable errors
  if (reachableErrors.length > 0) {
    const compileErrors: CompileError[] = reachableErrors.map((e) => ({
      kind: e.code,
      message: e.message,
      blockId: e.where?.blockId,
    }));
    return emitFailure(options, startTime, compileId, compileErrors);
  }
}
```

### src/diagnostics/types.ts (MODIFY)

Add new warning code:

```typescript
// In DiagnosticCode union
| 'W_BLOCK_UNREACHABLE_ERROR'
```

## Edge Cases

### Camera Block

Camera blocks have `capability: 'camera'` but affect rendering. Need to verify reachability handles them:
- Camera feeds into render globals, not render blocks directly
- May need special handling OR camera outputs feed into render pipeline naturally

### Multiple Render Blocks

If patch has multiple render blocks, a block is reachable if it feeds ANY of them.

### Instance-Creating Blocks

Array/Instance blocks create instances used by downstream. If downstream is reachable, Array is reachable.

### Blocks with Multiple Outputs

If block has multiple outputs and only some are connected:
- Block IS reachable (some output used)
- Entire block is lowered (can't partially lower)
- If block has error, it's a reachable error

## Testing Strategy

### Unit Tests (reachability.ts)

```typescript
describe('computeRenderReachableBlocks', () => {
  it('returns empty set for no render blocks', () => { ... });
  it('returns render block only if no inputs', () => { ... });
  it('traces through single edge', () => { ... });
  it('traces through chain', () => { ... });
  it('traces through diamond', () => { ... });
  it('excludes disconnected subgraph', () => { ... });
});
```

### Integration Tests (compile.test.ts)

```typescript
describe('error isolation for unused blocks', () => {
  it('compiles when only disconnected blocks have errors', () => {
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot', { id: 'time' });
      b.addBlock('Array', { id: 'arr', params: { count: 10 } });
      // ... minimal render pipeline ...

      // Disconnected block with error
      b.addBlock('Expression', {
        id: 'broken',
        params: { expr: 'syntax error!!!' }
      });
    });

    const result = compile(patch);
    expect(result.kind).toBe('ok'); // Compiles!
  });

  it('fails when connected block has error', () => {
    const patch = buildPatch((b) => {
      // ... render pipeline with broken block connected ...
    });

    const result = compile(patch);
    expect(result.kind).toBe('error');
  });
});
```

## Performance Considerations

- Reachability is O(V + E) - same as existing Pass 7 logic
- Currently computed twice (filter + schedule) - acceptable for now
- Future: Pass reachable set to Pass 7 to avoid recomputation

## Diagnostic Integration

Warnings should be emitted through EventHub to DiagnosticHub:

```typescript
function emitUnreachableBlockWarnings(
  errors: CompileError[],
  options?: CompileOptions
): void {
  if (!options?.events) return;

  for (const error of errors) {
    // Emit as diagnostic event or directly to hub
    // Warning format: W_BLOCK_UNREACHABLE_ERROR
  }
}
```

## Rollback Plan

If issues arise:
1. Remove error filtering code in compile.ts
2. Keep reachability.ts (useful for future)
3. Remove W_BLOCK_UNREACHABLE_ERROR code
4. Revert to current behavior (all errors fail compilation)
