# Definition of Done: unified-slots

Generated: 2026-01-25
Status: PARTIALLY READY
Plan: SPRINT-20260125-unified-slots-PLAN.md

## Acceptance Criteria

### P0: Centralize Stride Computation

- [ ] `strideOf(payload)` in canonical-types.ts is the ONLY stride computation
- [ ] IRBuilderImpl.allocTypedSlot() switch statement deleted
- [ ] IRBuilderImpl.getSlotMetaInputs() switch statement deleted
- [ ] compile.ts payloadStride() call removed (use strideOf)
- [ ] Grep `case 'vec2':.*stride.*=.*2` returns only canonical-types.ts
- [ ] All existing tests pass

### P0: Unified allocSlot Method

- [ ] IRBuilder interface has exactly one `allocSlot(type: SignalType): SlotAllocation`
- [ ] `allocTypedSlot` method deleted from interface and impl
- [ ] `allocValueSlot` method deleted from interface and impl
- [ ] `registerSlotType` method deleted from interface and impl
- [ ] `SlotAllocation` type exported: `{ slot: ValueSlot, stride: number, storage: StorageClass }`
- [ ] All existing tests pass

### P1: Remove slotMeta Generation from compile.ts

- [ ] compile.ts slotMeta section is <= 10 lines
- [ ] No fallback to `signalType('float')` for unknown types
- [ ] IRBuilder.getSlotMeta() returns readonly SlotMetaEntry[]
- [ ] Attempting to get slotMeta for unallocated slot throws
- [ ] All existing tests pass

### P1: Update All Block Lowering

- [ ] signal-blocks.ts uses new allocSlot
- [ ] time-blocks.ts uses new allocSlot
- [ ] geometry-blocks.ts uses new allocSlot
- [ ] color-blocks.ts uses new allocSlot
- [ ] math-blocks.ts uses new allocSlot
- [ ] expression-blocks.ts uses new allocSlot
- [ ] primitive-blocks.ts uses new allocSlot
- [ ] array-blocks.ts uses new allocSlot
- [ ] instance-blocks.ts uses new allocSlot
- [ ] field-blocks.ts uses new allocSlot
- [ ] field-operations-blocks.ts uses new allocSlot
- [ ] path-blocks.ts uses new allocSlot
- [ ] path-operators-blocks.ts uses new allocSlot
- [ ] adapter-blocks.ts uses new allocSlot
- [ ] camera-block.ts uses new allocSlot
- [ ] render-blocks.ts uses new allocSlot
- [ ] identity-blocks.ts uses new allocSlot
- [ ] event-blocks.ts uses new allocSlot
- [ ] test-blocks.ts uses new allocSlot
- [ ] No `registerSlotType` calls remain in src/blocks/
- [ ] All existing tests pass
- [ ] Application renders correctly with test patches

### P2: Remove Continuity Pipeline Slot Allocation (if started)

- [ ] pass7-schedule.ts uses builder.allocSlot() not raw counter
- [ ] Continuity buffer slots have proper type
- [ ] All slotMeta entries have valid type (no defaults)
- [ ] Continuity tests pass

### P2: Consolidate ValueRefPacked (if started)

- [ ] ValueRefPacked uses allocation info from allocSlot
- [ ] No duplicate stride storage
- [ ] All consumers of ValueRefPacked updated
- [ ] All tests pass

## Exit Criteria (for MEDIUM confidence items)

### P2: Remove Continuity Pipeline Slot Allocation

- [ ] Determined proper type for continuity buffer slots
- [ ] Verified continuity system doesn't rely on untyped slots
- [ ] Have test coverage for continuity slot allocation

### P2: Consolidate ValueRefPacked

- [ ] Audited all consumers of ValueRefPacked
- [ ] Determined minimal required fields
- [ ] Have test coverage for ValueRefPacked changes

## Verification Commands

```bash
# Verify no duplicate stride computation
rg "case 'vec2'.*stride" --type ts | grep -v canonical-types.ts | wc -l
# Expected: 0

# Verify no registerSlotType calls
rg "registerSlotType" --type ts -c
# Expected: 0 (after completion)

# Verify no allocTypedSlot/allocValueSlot
rg "allocTypedSlot|allocValueSlot" --type ts -c
# Expected: 0 (after completion)

# Run tests
npm run test

# Verify app renders
npm run dev
# Manually test with a few patches
```
