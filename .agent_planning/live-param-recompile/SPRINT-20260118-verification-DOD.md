# Sprint: verification - Definition of Done

## P0: ParamChanged Event

- [ ] `ParamChanged` event type added to EventHub EditorEvent union
- [ ] Event interface includes: patchId, patchRevision, blockId, blockType, paramKey, oldValue, newValue
- [ ] Type-safe with existing discriminated union pattern
- [ ] Follows existing event naming conventions

## P1: BlockLowered Event

- [ ] `BlockLowered` event type added to EventHub EditorEvent union
- [ ] Event interface includes: compileId, patchRevision, blockId, blockType, instanceId?, instanceCount?
- [ ] Type-safe with existing discriminated union pattern

## P2: Event Emission

- [ ] PatchStore.updateBlockParams emits ParamChanged event
- [ ] Pass 6 emits BlockLowered for instance-creating blocks
- [ ] Events have all required context (compileId, patchRevision, etc.)
- [ ] No runtime errors from event emission

## P3: DiagnosticHub Integration

- [ ] DiagnosticHub subscribes to ParamChanged events
- [ ] DiagnosticHub subscribes to BlockLowered events
- [ ] Handlers log to LogPanel with proper formatting
- [ ] Log messages follow existing conventions (e.g., `[Param]`, `[Compiler]` prefixes)

## P4: End-to-End Verification

- [ ] Slider change triggers ParamChanged in LogPanel
- [ ] Recompile triggers BlockLowered with correct count in LogPanel
- [ ] Domain change detection fires if count differs
- [ ] Canvas visually reflects count change
- [ ] Build passes (`npm run typecheck`)
- [ ] Tests pass (`npm run test`)

## Overall Acceptance

**The sprint is COMPLETE when:**
1. All new events are properly typed in EventHub
2. Events are emitted at correct points in the flow
3. DiagnosticHub logs events to LogPanel
4. LogPanel displays param flow visibility
5. End-to-end chain verified working

## Verification Commands

```bash
# Build and typecheck
npm run typecheck

# Run tests
npm run test

# Start dev server
npm run dev

# In browser:
# 1. Open LogPanel (bottom panel area)
# 2. Select Array block
# 3. Change count slider
# 4. Verify logs appear:
#    - [Param] Array#<id>.count: 5000 → 100
#    - [Compiler] Array#<id> created instance <id> with count=100
#    - [Continuity] Domain change: <id> 5000→100 (-4900)
# 5. Verify canvas shows fewer circles
```

## Non-Goals

- This sprint does NOT add filtering UI for new events
- This sprint does NOT add structured diagnostic objects (just logs)
- Performance optimization of event emission is out of scope
