# Sprint: unified-slots - Unified Slot Allocation

Generated: 2026-01-25
Confidence: HIGH: 4, MEDIUM: 2, LOW: 0
Status: PARTIALLY READY
Source: EVALUATION-20260125.md

## Sprint Goal

Remove dual code paths and scattered stride handling by creating ONE allocation method that captures all slot metadata upfront, eliminating downstream complexity.

## Scope

**Deliverables:**
- Single `allocSlot(type)` method that computes stride, storage, and offset
- Remove `allocTypedSlot`, `allocValueSlot`, `registerSlotType` methods
- SlotMeta generated at allocation time (not in compile.ts)
- All stride computation centralized in one place

**Out of scope:**
- Event slot unification (separate sprint)
- Time signal special handling (separate sprint)
- Debug index simplification (separate sprint)

## Work Items

### P0 [HIGH] Centralize Stride Computation

**Dependencies**: None
**Spec Reference**: N/A (implementation cleanup)
**Status Reference**: EVALUATION-20260125.md "Stride computation duplicated in 4 places"

#### Description

Create single source of truth for stride computation. Currently duplicated in:
1. IRBuilderImpl.allocTypedSlot()
2. IRBuilderImpl.getSlotMetaInputs()
3. compile.ts convertLinkedIRToProgram()
4. Block lowering via strideOf()

Move to one function in canonical-types.ts (strideOf already exists, just remove duplicates).

#### Acceptance Criteria

- [ ] `strideOf(payload)` is the ONLY stride computation in codebase
- [ ] All calls to compute stride from payload use `strideOf`
- [ ] No inline switch statements computing stride from payload type
- [ ] Grep for `case 'vec2': stride = 2` returns 0 results outside canonical-types.ts

#### Technical Notes

The `strideOf` function already exists in `canonical-types.ts`. The work is removing the duplicate implementations, not creating new code.

---

### P0 [HIGH] Unified allocSlot Method

**Dependencies**: P0 Centralize Stride
**Spec Reference**: N/A (implementation cleanup)
**Status Reference**: EVALUATION-20260125.md "Three allocation methods"

#### Description

Replace three allocation methods with one:

```typescript
// BEFORE: 3 methods
allocSlot(stride?: number): ValueSlot
allocTypedSlot(type: SignalType): ValueSlot
allocValueSlot(type: SignalType): ValueSlot

// AFTER: 1 method
allocSlot(type: SignalType): SlotAllocation
// where SlotAllocation = { slot: ValueSlot, stride: number, offset: number }
```

The new method:
1. Takes type (required)
2. Computes stride via `strideOf`
3. Assigns offset immediately
4. Records in slotMeta immediately
5. Returns complete allocation info

#### Acceptance Criteria

- [ ] Only one `allocSlot` method exists in IRBuilder interface
- [ ] `allocTypedSlot` and `allocValueSlot` are deleted
- [ ] All block lowering code uses the new `allocSlot(type)` signature
- [ ] SlotMetaEntry created at allocation time, not in compile.ts
- [ ] `registerSlotType` method is deleted (no longer needed)

#### Technical Notes

This is a breaking change to the IRBuilder interface. All blocks must be updated. The change is mechanical: `allocSlot()` -> `allocSlot(type).slot`

---

### P1 [HIGH] Remove slotMeta Generation from compile.ts

**Dependencies**: P0 Unified allocSlot
**Spec Reference**: N/A
**Status Reference**: EVALUATION-20260125.md "slotMeta Generation Complexity"

#### Description

Currently compile.ts has 60+ lines of slotMeta generation code that:
- Iterates all slots
- Looks up types from slotTypes map
- Defaults to float if no type (hides bugs!)
- Computes storage class
- Computes stride
- Computes offset

All of this should be done at allocation time. compile.ts should just call `builder.getSlotMeta()`.

#### Acceptance Criteria

- [ ] compile.ts `convertLinkedIRToProgram` slotMeta section is <10 lines
- [ ] No "default to float if no type" fallback
- [ ] IRBuilder has `getSlotMeta(): readonly SlotMetaEntry[]` method
- [ ] slotMeta is built incrementally as slots are allocated

#### Technical Notes

This removes the "default to float" silent bug hiding. If a slot has no type, that's a compiler bug that should throw.

---

### P1 [HIGH] Update All Block Lowering

**Dependencies**: P0 Unified allocSlot
**Spec Reference**: N/A
**Status Reference**: All files in src/blocks/

#### Description

Update all block lowering functions to use new `allocSlot(type)` signature:

```typescript
// BEFORE
const slot = ctx.b.allocSlot(stride);
ctx.b.registerSlotType(slot, type);

// AFTER
const { slot } = ctx.b.allocSlot(type);
```

Files to update:
- signal-blocks.ts
- time-blocks.ts
- geometry-blocks.ts
- color-blocks.ts
- math-blocks.ts
- expression-blocks.ts
- primitive-blocks.ts
- array-blocks.ts
- instance-blocks.ts
- field-blocks.ts
- field-operations-blocks.ts
- path-blocks.ts
- path-operators-blocks.ts
- adapter-blocks.ts
- camera-block.ts
- render-blocks.ts
- identity-blocks.ts
- event-blocks.ts
- test-blocks.ts

#### Acceptance Criteria

- [ ] All blocks compile with new allocSlot signature
- [ ] No calls to `registerSlotType` remain
- [ ] No calls to `allocTypedSlot` or `allocValueSlot` remain
- [ ] All tests pass

#### Technical Notes

This is mechanical refactoring. Most blocks already have the type available.

---

### P2 [MEDIUM] Remove Continuity Pipeline Slot Allocation from pass7

**Dependencies**: P1 Remove slotMeta from compile.ts
**Spec Reference**: N/A
**Status Reference**: EVALUATION-20260125.md mentions pass7 allocating slots

#### Description

pass7-schedule.ts currently allocates additional slots for continuity buffers:

```typescript
let nextSlot = unlinkedIR.builder.getSlotCount();
const slotAllocator = (): ValueSlot => {
  return nextSlot++ as ValueSlot;
};
```

These slots have no type information, causing slotMeta gaps. Either:
1. Move continuity slot allocation to pass6 (with types)
2. Pass7 must use builder.allocSlot(type) instead of raw counter

#### Acceptance Criteria

- [ ] All slots in the program have type information
- [ ] No raw `nextSlot++` allocation without type registration
- [ ] Continuity buffer slots have proper slotMeta entries

#### Unknowns to Resolve

1. What type should continuity buffer slots have? They store Float32Array references (object storage).

#### Exit Criteria (to reach HIGH confidence)

- [ ] Determine proper type for continuity buffer slots
- [ ] Verify continuity system doesn't rely on untyped slots

---

### P2 [MEDIUM] Consolidate ValueRefPacked with SlotAllocation

**Dependencies**: P0 Unified allocSlot
**Spec Reference**: N/A
**Status Reference**: EVALUATION-20260125.md

#### Description

Currently blocks return ValueRefPacked which contains:
```typescript
{ k: 'sig', id: SigExprId, slot: ValueSlot, type: SignalType, stride: number }
```

And allocSlot will return:
```typescript
{ slot: ValueSlot, stride: number, offset: number }
```

These overlap. Consider whether ValueRefPacked should just use the SlotAllocation:

```typescript
{ k: 'sig', id: SigExprId, allocation: SlotAllocation, type: SignalType }
```

#### Acceptance Criteria

- [ ] No duplicate stride information stored
- [ ] Slot allocation info flows from allocSlot to output without recomputation
- [ ] Block lowering code is simpler (less fields to construct)

#### Unknowns to Resolve

1. Does pass6/pass7 need the offset field, or only slot and stride?
2. Would this simplification break any downstream consumers?

#### Exit Criteria (to reach HIGH confidence)

- [ ] Audit all consumers of ValueRefPacked
- [ ] Determine minimal required fields

## Dependencies

```
P0: Centralize Stride
    |
    v
P0: Unified allocSlot
    |
    +-----> P1: Remove slotMeta from compile.ts
    |
    +-----> P1: Update All Block Lowering
                |
                v
            P2: Remove Continuity Allocation from pass7
                |
                v
            P2: Consolidate ValueRefPacked
```

## Risks

1. **Risk**: Breaking change affects many files
   **Mitigation**: Mechanical refactoring, good test coverage, can be done incrementally per block file

2. **Risk**: Continuity system relies on raw slot allocation
   **Mitigation**: Audit continuity code before starting P2

3. **Risk**: Some blocks may need untyped slots for dynamic purposes
   **Mitigation**: Add explicit "object" type if needed, never default silently
