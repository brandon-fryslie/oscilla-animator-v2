# Sprint: verification - Param Flow Verification & Fix

**Generated:** 2026-01-18
**Updated:** 2026-01-18 (revised for proper diagnostic integration)
**Confidence:** HIGH
**Status:** READY FOR IMPLEMENTATION

## Sprint Goal

Add permanent diagnostic infrastructure for param flow visibility, verify live param recompile works end-to-end, and fix any gaps found.

## Context

Investigation confirms the param flow architecture is correct:
- UI → Store → Compiler → IR → Runtime chain is properly connected
- Test proves params DO flow through recompilation

This sprint adds **permanent diagnostic capabilities** integrated with the existing DiagnosticHub/EventHub/LogPanel infrastructure - not temporary console.logs.

## Scope

**Deliverables:**
1. New diagnostic events for param flow visibility (permanent infrastructure)
2. Integration with existing LogPanel and DiagnosticHub
3. Fix for any identified gaps
4. Verification that Array count changes affect rendered output

## Work Items

### P0: Add ParamChanged Event to EventHub

**Files to modify:**
- `src/events/EventHub.ts` - Add `ParamChanged` event type
- `src/events/types.ts` (if exists) - Add event interface

**Acceptance Criteria:**
- [ ] New `ParamChanged` event type in EventHub discriminated union
- [ ] Event includes: blockId, blockType, paramKey, oldValue, newValue, patchRevision
- [ ] Event is type-safe and follows existing patterns

**Implementation Notes:**
```typescript
// Add to EditorEvent union in EventHub.ts
| {
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

### P1: Add BlockLowered Event for Compiler Visibility

**Files to modify:**
- `src/events/EventHub.ts` - Add `BlockLowered` event type

**Acceptance Criteria:**
- [ ] New `BlockLowered` event type for compiler pass visibility
- [ ] Event includes: blockId, blockType, instanceId (if created), instanceCount (if applicable)
- [ ] Emitted during Pass 6 block lowering

**Implementation Notes:**
```typescript
// Add to EditorEvent union
| {
    type: 'BlockLowered';
    compileId: string;
    patchRevision: number;
    blockId: string;
    blockType: string;
    instanceId?: string;
    instanceCount?: number;
  }
```

### P2: Emit Events from Store and Compiler

**Files to modify:**
- `src/stores/PatchStore.ts` - Emit ParamChanged on updateBlockParams
- `src/compiler/passes-v2/pass6-block-lowering.ts` - Emit BlockLowered

**Acceptance Criteria:**
- [ ] PatchStore emits ParamChanged when params update
- [ ] Pass 6 emits BlockLowered for blocks that create instances
- [ ] Events include all relevant context

**Implementation Notes:**
```typescript
// In PatchStore.updateBlockParams:
this.events.emit({
  type: 'ParamChanged',
  patchId: this.patchId,
  patchRevision: this.revision,
  blockId: id,
  blockType: block.type,
  paramKey: Object.keys(params)[0], // or iterate for multiple
  oldValue: block.params[key],
  newValue: params[key],
});

// In pass6-block-lowering.ts (for instance-creating blocks):
if (result.instanceContext) {
  ctx.events?.emit({
    type: 'BlockLowered',
    compileId: ctx.compileId,
    patchRevision: ctx.patchRevision,
    blockId: block.id,
    blockType: block.type,
    instanceId: result.instanceContext,
    instanceCount: // get from builder
  });
}
```

### P3: Subscribe DiagnosticHub to New Events

**Files to modify:**
- `src/diagnostics/DiagnosticHub.ts` - Subscribe to ParamChanged, BlockLowered
- `src/stores/DiagnosticsStore.ts` - Expose param flow logs

**Acceptance Criteria:**
- [ ] DiagnosticHub handles ParamChanged → logs to LogPanel
- [ ] DiagnosticHub handles BlockLowered → logs instance creation
- [ ] Logs appear in LogPanel with proper formatting

**Implementation Notes:**
```typescript
// In DiagnosticHub constructor, add subscriptions:
events.on('ParamChanged', (event) => this.handleParamChanged(event));
events.on('BlockLowered', (event) => this.handleBlockLowered(event));

// Handler methods:
private handleParamChanged(event: ParamChangedEvent): void {
  this.log({
    level: 'info',
    message: `[Param] ${event.blockType}#${event.blockId}.${event.paramKey}: ${event.oldValue} → ${event.newValue}`,
  });
}

private handleBlockLowered(event: BlockLoweredEvent): void {
  if (event.instanceCount !== undefined) {
    this.log({
      level: 'info',
      message: `[Compiler] ${event.blockType}#${event.blockId} created instance ${event.instanceId} with count=${event.instanceCount}`,
    });
  }
}
```

### P4: Verify End-to-End

**Acceptance Criteria:**
- [ ] Change Array count slider in UI
- [ ] See ParamChanged log in LogPanel
- [ ] See BlockLowered log with new count in LogPanel
- [ ] See domain change log if count differs
- [ ] Visual change on canvas confirms count changed

## Dependencies

- Existing EventHub infrastructure
- Existing DiagnosticHub/DiagnosticsStore
- Existing LogPanel component

## Risks

| Risk | Mitigation |
|------|------------|
| Event volume may be high | Log level filtering already exists in LogPanel |
| Events need context (compileId, etc) | Pass through compile options |

## Exit Criteria

Sprint is complete when:
1. New events are emitted and logged properly
2. LogPanel shows param changes and block lowering
3. Full chain verified working

## Definition of Done

See `SPRINT-20260118-verification-DOD.md`
