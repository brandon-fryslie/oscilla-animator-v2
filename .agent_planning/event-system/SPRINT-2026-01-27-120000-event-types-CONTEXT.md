# Implementation Context: event-types

## Key Files

### Primary Files to Modify
- `src/events/types.ts` - Add all new event types
- `src/events/EventHub.ts` - Add `once()` method
- `src/events/__tests__/EventHub.test.ts` - Add tests for new functionality

### Reference Files (Read Only)
- `design-docs/_new/01-Event-System.md` - The spec
- `src/types.ts` - Existing type definitions to reference

## Architecture Notes

### Event Type Structure
The spec uses a different API shape than current implementation:

**Spec API:**
```typescript
interface EventHub {
  on<K extends keyof EventMap>(event: K, handler: EventMap[K]): () => void;
  emit<K extends keyof EventMap>(event: K, ...args: Parameters<EventMap[K]>): void;
  once<K extends keyof EventMap>(event: K, handler: EventMap[K]): () => void;
}
```

**Current API:**
```typescript
class EventHub {
  on<T extends EditorEvent['type']>(
    type: T,
    handler: (event: Extract<EditorEvent, { type: T }>) => void
  ): () => void;
  emit(event: EditorEvent): void;
}
```

**Decision:** Keep the current discriminated union approach (more type-safe), but ensure event types match the spec semantics.

### Event Categories (from spec)

1. **Patch Events** - Emitted by PatchStore
   - blockChanged, blockAdded, blockRemoved
   - edgeAdded, edgeRemoved, patchReset

2. **Compilation Events** - Emitted by CompilationService
   - compileStarted, compileSucceeded, compileFailed, diagnosticsChanged

3. **Runtime Events** - Emitted by RuntimeService
   - frameStarted, frameCompleted, playbackStateChanged, runtimeError

4. **Selection Events** - Emitted by SelectionStore
   - selectionChanged, hoverChanged

5. **UI Events** - Emitted by UI components/stores
   - panelLayoutChanged, viewportChanged

6. **Editor State Events** - Emitted by EditorStateStore
   - editorStateChanged

### Ownership Rule
Each event type has exactly ONE emitter. This is enforced by convention, not code.

## Patterns to Follow

### Event Interface Pattern
```typescript
export interface BlockAddedEvent {
  readonly type: 'BlockAdded';
  readonly patchId: string;
  readonly patchRevision: number;
  readonly blockId: string;
  // Optional: additional context
}
```

### Test Pattern
```typescript
it('emits BlockAdded event', () => {
  const hub = new EventHub();
  const handler = vi.fn();
  hub.on('BlockAdded', handler);

  hub.emit({
    type: 'BlockAdded',
    patchId: 'patch-0',
    patchRevision: 1,
    blockId: 'block-123',
  });

  expect(handler).toHaveBeenCalledWith(expect.objectContaining({
    type: 'BlockAdded',
    blockId: 'block-123',
  }));
});
```

## Common Pitfalls to Avoid

1. **Don't break existing events** - Add, don't modify
2. **Don't skip patchId/patchRevision** - All events need these for tracing
3. **Don't use `any`** - Discriminated unions require proper typing
4. **Don't forget readonly** - All event properties are immutable
