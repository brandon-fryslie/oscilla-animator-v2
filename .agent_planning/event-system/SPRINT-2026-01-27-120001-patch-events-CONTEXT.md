# Implementation Context: patch-events

## Key Files

### Primary Files to Modify
- `src/stores/PatchStore.ts` - Add event emission to mutation methods
- `src/stores/RootStore.ts` - May need to update EventHub wiring

### Reference Files
- `src/events/types.ts` - Event type definitions
- `src/events/EventHub.ts` - Event emission API
- `design-docs/_new/01-Event-System.md` - Spec

## PatchStore Analysis

### Current Structure
PatchStore manages the user's graph:
- `addBlock(block)` - Add a block to the patch
- `removeBlock(blockId)` - Remove a block (and its edges)
- `addEdge(edge)` - Connect two ports
- `removeEdge(edgeId)` - Disconnect ports
- `setParam(blockId, key, value)` - Update block parameters

### EventHub Access Pattern
Currently, PatchStore gets EventHub via `setEventHub()`:
```typescript
setEventHub(hub: EventHub) {
  this.eventHub = hub;
}
```

This should continue to work for the new events.

### Event Emission Points

**addBlock:**
```typescript
@action addBlock(block: Block) {
  this.patch.blocks.set(block.id, block);
  // EMIT: BlockAdded
  this.eventHub?.emit({
    type: 'BlockAdded',
    patchId: this.patchId,
    patchRevision: this.patchRevision,
    blockId: block.id,
  });
}
```

**removeBlock:**
```typescript
@action removeBlock(blockId: string) {
  // First, find and remove connected edges
  const connectedEdges = this.getEdgesForBlock(blockId);
  for (const edge of connectedEdges) {
    this.removeEdge(edge.id); // This emits EdgeRemoved
  }

  this.patch.blocks.delete(blockId);
  // EMIT: BlockRemoved
  this.eventHub?.emit({
    type: 'BlockRemoved',
    patchId: this.patchId,
    patchRevision: this.patchRevision,
    blockId,
  });
}
```

### Cascade Example (from spec)
```
onBlockRemoved(A)
  → listener removes edges connected to A
    → onEdgeRemoved(edge1)
    → onEdgeRemoved(edge2)
      → listener cleans up vararg connections
        → onBlockChanged(ExpressionBlock)
          → no further changes, cascade ends
```

This cascade is fine - spec explicitly allows it. The key rules:
1. Listeners must be idempotent
2. Listeners must not create cycles
3. Keep cascade depth shallow

## Ownership Table (from spec)

| Event Category | Emitter |
|----------------|---------|
| Patch events | PatchStore |
| Compilation events | CompilationService |
| Runtime events | RuntimeService |
| Selection events | SelectionStore |
| UI events | UI components/stores |

**PatchStore owns:**
- blockChanged
- blockAdded
- blockRemoved
- edgeAdded
- edgeRemoved
- patchReset

## Timing Semantics (from spec)

- **Synchronous**: Events fire immediately after mutation
- **Post-mutation**: Events fire after state change is complete
- **Order**: Listeners fire in registration order

This means: `addBlock()` should emit `BlockAdded` AFTER `this.patch.blocks.set()` completes.
