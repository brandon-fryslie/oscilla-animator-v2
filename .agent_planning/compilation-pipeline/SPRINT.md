# Sprint 2: Compiler Passes 5-10 Completion

**Status:** IN PROGRESS
**Started:** 2026-01-09
**Mode:** TDD (test-driven where tests exist, manual validation otherwise)

## Goal

Complete compiler passes 5-10 to build dense execution tables, execution class assignment, schedule construction, and slot planning.

## Context

- Sprint 1 complete: IR schema + bridge functions + runtime migration
- 123 tests passing
- Current pass implementations are partial

## Sprint 2 Deliverables

### 1. Pass 5 Enhancement: Execution Class Assignment

**File:** `src/compiler/passes-v2/pass5-scc.ts`

Currently only does SCC/cycle validation. Needs enhancement to classify nodes by execution class:

- `one + continuous` → SignalContinuous
- `many(domain) + continuous` → FieldContinuous
- `one + discrete` → SignalDiscrete
- Sinks → RenderEndpoint

**Output:** Each node gets an `executionClass` field.

### 2. Pass 6 Enhancement: Build Dense Execution Tables

**File:** `src/compiler/passes-v2/pass6-block-lowering.ts`

Currently builds sparse IR fragments. Needs to build dense arrays:

- `signalExprs.nodes[]` - dense array, no gaps
- `fieldExprs.nodes[]` - dense array, no gaps
- `eventExprs.nodes[]` - dense array, no gaps
- Tables ordered by slotId ascending

**Key Change:** Convert from Map-based storage to dense array storage.

### 3. Pass 7: Schedule Construction (NEW)

**File:** `src/compiler/passes-v2/pass7-schedule.ts` (CREATE)

Build execution schedule with phase ordering:

1. Update rails/time inputs
2. Execute continuous scalars (SignalContinuous)
3. Execute continuous fields (FieldContinuous) - domain loops
4. Apply discrete ops (SignalDiscrete) - events
5. Sinks (RenderEndpoint)

**Output:** ScheduleIR with explicit phase steps.

### 4. Pass 8 Enhancement: Slot Planning

**File:** `src/compiler/passes-v2/pass8-link-resolution.ts`

Currently does link resolution. Needs to add slot planning:

- Assign storage class to each slot (f64, f32, i32, u32, object)
- Compute offset per storage class
- Offsets stable-ordered by slotId
- Update SlotMetaEntry with offset + storage

**Key Invariant:** Offsets are per-storage (not global).

## Acceptance Criteria

- [ ] All nodes assigned to execution class
- [ ] Execution tables are dense arrays (no gaps)
- [ ] Schedule steps are explicit data structure
- [ ] Phase ordering: rails → scalars → fields → events → sinks
- [ ] Dependencies respected in schedule
- [ ] All slots have assigned storage class
- [ ] Offsets are per-storage (not global)
- [ ] All existing tests still pass (123+)
- [ ] New tests for pass 7 schedule construction

## Implementation Order

1. Pass 5 enhancement (execution class)
2. Pass 6 enhancement (dense tables)
3. Pass 7 creation (schedule)
4. Pass 8 enhancement (slot planning)

## Key Files

```
src/compiler/passes-v2/
├── pass5-scc.ts          # Enhance with execution class
├── pass6-block-lowering.ts # Enhance with dense tables
├── pass7-schedule.ts     # CREATE NEW
├── pass8-link-resolution.ts # Enhance with slot planning
└── index.ts              # Update exports

src/compiler/ir/
├── program.ts            # CompiledProgramIR schema
├── types.ts              # Legacy IR types
└── bridges.ts            # Type conversion helpers

src/core/
└── canonical-types.ts    # Canonical 5-axis type system
```

## Progress Tracking

### Completed
- None yet

### In Progress
- Setting up sprint planning

### Blocked
- None

## Notes

- Use canonical type system from `src/core/canonical-types.ts`
- Use bridge functions from `src/compiler/ir/bridges.ts`
- SlotMetaEntry already has required `offset: number`
- Execution tables should be TypedArray-compatible (dense indices)
- Schedule must be deterministic (stable ordering)
