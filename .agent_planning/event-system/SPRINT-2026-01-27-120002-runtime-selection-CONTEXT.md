# Implementation Context: runtime-selection

## Key Files

### Primary Files to Modify
- `src/services/AnimationLoop.ts` - Frame and playback events
- `src/stores/SelectionStore.ts` - Selection events
- `src/runtime/HealthMonitor.ts` - Runtime error events (maybe)

### Reference Files
- `src/events/types.ts` - Event type definitions
- `src/events/EventHub.ts` - Event emission API
- `design-docs/_new/01-Event-System.md` - Spec

## Ownership Table (from spec)

| Event | Emitter |
|-------|---------|
| frameStarted | RuntimeService |
| frameCompleted | RuntimeService |
| playbackStateChanged | RuntimeService |
| runtimeError | RuntimeService |
| selectionChanged | SelectionStore |
| hoverChanged | SelectionStore |

## AnimationLoop Analysis

### Current Structure
AnimationLoop manages the render loop:
```typescript
class AnimationLoop {
  private playing: boolean;
  private frameNumber: number;

  start() { /* begin animation */ }
  stop() { /* stop animation */ }
  pause() { /* pause animation */ }

  private tick() {
    // Called every frame
    // Execute schedule
    // Render frame
    // Request next frame
  }
}
```

### Event Emission Points

**Playback state:**
```typescript
start() {
  this.playing = true;
  this.eventHub?.emit({
    type: 'PlaybackStateChanged',
    patchId: this.patchId,
    patchRevision: this.patchRevision,
    state: 'playing',
  });
}

pause() {
  this.playing = false;
  this.eventHub?.emit({
    type: 'PlaybackStateChanged',
    ...
    state: 'paused',
  });
}

stop() {
  this.playing = false;
  this.frameNumber = 0;
  this.eventHub?.emit({
    type: 'PlaybackStateChanged',
    ...
    state: 'stopped',
  });
}
```

**Frame events:**
```typescript
private tick() {
  this.eventHub?.emit({
    type: 'FrameStarted',
    patchId: this.patchId,
    patchRevision: this.patchRevision,
    frameNumber: this.frameNumber,
  });

  // ... execute frame ...

  this.eventHub?.emit({
    type: 'FrameCompleted',
    ...
  });

  this.frameNumber++;
}
```

### Performance Consideration

Per-frame events at 60fps = 120 events/second (start + complete).

Options:
1. **Always emit** - Simple, overhead is tiny if no listeners
2. **Check listener count** - Skip emit if no listeners
3. **Opt-in flag** - Only emit if explicitly enabled

Recommended: Option 1 (always emit) - EventHub is already fast.

## SelectionStore Analysis

### Current Structure
SelectionStore tracks what's selected:
```typescript
class SelectionStore {
  @observable selection: Selection;

  @action selectBlock(blockId: string) { ... }
  @action selectEdge(edgeId: string) { ... }
  @action clearSelection() { ... }
}
```

### Event Emission Pattern
```typescript
@action selectBlock(blockId: string) {
  this.selection = { type: 'block', blockId };
  this.eventHub?.emit({
    type: 'SelectionChanged',
    patchId: this.patchId,
    patchRevision: this.patchRevision,
    selection: this.selection,
  });
}
```

## Hover Tracking

Hover is likely tracked in UI components, not stores. Need to investigate:
- `src/ui/reactFlowEditor/` - ReactFlow handles hover?
- `src/stores/PortHighlightStore.ts` - May track hover state

If hover isn't centralized, may need to:
1. Create hover tracking in SelectionStore
2. Have UI components call `setHover(target)`
3. SelectionStore emits `HoverChanged`
