# Sprint: verification - Implementation Context

## Existing Infrastructure

### EventHub (`src/events/EventHub.ts`)

Central event bus with type-safe discriminated union. Add new events to the `EditorEvent` type:

```typescript
export type EditorEvent =
  | { type: 'GraphCommitted'; /* ... */ }
  | { type: 'CompileBegin'; /* ... */ }
  | { type: 'CompileEnd'; /* ... */ }
  | { type: 'ProgramSwapped'; /* ... */ }
  | { type: 'RuntimeHealthSnapshot'; /* ... */ }
  // ADD NEW EVENTS HERE:
  | { type: 'ParamChanged'; /* ... */ }
  | { type: 'BlockLowered'; /* ... */ }
```

### DiagnosticHub (`src/diagnostics/DiagnosticHub.ts`)

Subscribes to events and maintains diagnostic snapshots. Has a `log()` method for sending to LogPanel:

```typescript
// Existing pattern for subscriptions (lines ~88-115):
constructor(events: EventHub, patchId: string, patchGetter: () => any) {
  events.on('GraphCommitted', (event) => this.handleGraphCommitted(event));
  events.on('CompileBegin', (event) => this.handleCompileBegin(event));
  // ... add new subscriptions here
}

// DiagnosticsStore has the log method:
log(entry: Omit<LogEntry, 'id' | 'timestamp'>): void
```

### PatchStore (`src/stores/PatchStore.ts`)

The `updateBlockParams` method at lines 157-170 is where ParamChanged should be emitted:

```typescript
updateBlockParams(
  id: BlockId,
  params: Partial<Record<string, unknown>>
): void {
  const block = this._data.blocks.get(id);
  if (!block) {
    throw new Error(`Block not found: ${id}`);
  }

  // EMIT ParamChanged HERE (before the update)

  this._data.blocks.set(id, {
    ...block,
    params: { ...block.params, ...params },
  });
}
```

**Note:** PatchStore needs access to EventHub. Check if it's passed via constructor or accessible via rootStore.

### Pass 6 Block Lowering (`src/compiler/passes-v2/pass6-block-lowering.ts`)

The `lowerBlockInstance` function at lines 285-421 is where BlockLowered should be emitted:

```typescript
function lowerBlockInstance(
  block: Block,
  blockIndex: BlockIndex,
  blockDef: BlockDef,
  // ...
): Map<string, ValueRefPacked> {
  // ... lowering logic ...

  const result = blockDef.lower({ ctx, inputs, inputsById, config });

  // EMIT BlockLowered HERE if result.instanceContext exists

  return outputRefs;
}
```

**Note:** Pass 6 needs EventHub access. Check compile options or add to context.

## Key Files to Modify

| File | Change |
|------|--------|
| `src/events/EventHub.ts` | Add ParamChanged, BlockLowered to EditorEvent union |
| `src/stores/PatchStore.ts` | Emit ParamChanged in updateBlockParams |
| `src/compiler/passes-v2/pass6-block-lowering.ts` | Emit BlockLowered after lowering |
| `src/diagnostics/DiagnosticHub.ts` | Subscribe to new events, add handlers |

## Event Schemas

### ParamChanged

```typescript
{
  type: 'ParamChanged';
  patchId: string;
  patchRevision: number;
  blockId: string;
  blockType: string;
  paramKey: string;
  oldValue: unknown;
  newValue: unknown;
}
```

### BlockLowered

```typescript
{
  type: 'BlockLowered';
  compileId: string;
  patchRevision: number;
  blockId: string;
  blockType: string;
  instanceId?: string;      // Only if block creates instance
  instanceCount?: number;   // Only if block creates instance
}
```

## Integration Points

### PatchStore → EventHub

PatchStore is created with EventHub reference:

```typescript
// In RootStore constructor:
this.patch = new PatchStore(/* check constructor params */);
```

If EventHub isn't passed, it may need to be added.

### Compiler → EventHub

Compile options already include `events`:

```typescript
const result = compile(patch, {
  events: rootStore.events,  // EventHub is here!
  patchRevision: rootStore.getPatchRevision(),
  patchId: 'patch-0',
});
```

The EventHub needs to be threaded through to Pass 6.

## Log Message Format

Follow existing conventions seen in `main.ts`:

```typescript
// Existing patterns:
log(`[Continuity] Domain change: ${instanceId} ${oldCount}→${newCount} (${deltaStr})`);
log(`Recompiled: ${program.signalExprs.nodes.length} signals`);

// New patterns should match:
`[Param] ${blockType}#${blockId}.${paramKey}: ${oldValue} → ${newValue}`
`[Compiler] ${blockType}#${blockId} created instance ${instanceId} with count=${count}`
```

## Testing Considerations

1. **Unit tests** for new event emission
2. **Integration test** verifying full chain
3. **Manual verification** in running app

## Potential Complications

1. **PatchStore may not have EventHub** - Need to check constructor and add if missing
2. **Pass 6 may not have EventHub access** - Need to thread through compile options
3. **Event volume** - Param changes during slider drag may produce many events; consider debouncing in handler
