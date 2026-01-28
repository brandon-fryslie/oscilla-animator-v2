# Implementation Context: slot-declarations

Generated: 2026-01-28-054900  
Status: READY FOR IMPLEMENTATION  
Plan: SPRINT-20260128-054900-slot-declarations-PLAN.md

This document provides the exact file locations, line numbers, and implementation patterns needed to complete the sprint with no prior context.

---

## Files to Modify

### Primary Files (Required Changes)
1. `src/compiler/ir/types.ts` - Add type aliases (lines 638-665)
2. `src/compiler/backend/schedule-program.ts` - Add accessor functions (after line 77)

### Secondary Files (Documentation)
3. `src/compiler/backend/schedule-program.ts` - Update JSDoc (lines 32-60)

### Test Files (New or Modified)
4. `src/compiler/backend/__tests__/schedule-program.test.ts` - Add accessor tests (create if missing)

---

## 1. Type Alias Definitions

**File**: `src/compiler/ir/types.ts`  
**Location**: After line 638 (after `StateMappingScalar` interface) and after line 660 (after `StateMappingField` interface)

### Current Code Context (lines 628-665)

```typescript
/**
 * State mapping for scalar (signal cardinality) state.
 *
 * Used for stateful primitives operating on a single value per frame.
 */
export interface StateMappingScalar {
  readonly kind: 'scalar';
  /** Stable semantic identity */
  readonly stateId: StableStateId;
  /** Positional slot index (changes each compile) */
  readonly slotIndex: number;
  /** Floats per state element (usually 1) */
  readonly stride: number;
  /** Initial values (length = stride) */
  readonly initial: readonly number[];
}

/**
 * State mapping for field (many cardinality) state.
 *
 * Used for stateful primitives operating on per-lane state arrays.
 * Lane remapping during hot-swap uses the continuity mapping service.
 */
export interface StateMappingField {
  readonly kind: 'field';
  /** Stable semantic identity */
  readonly stateId: StableStateId;
  /** Instance this state tracks (for lane mapping) */
  readonly instanceId: string;
  /** Start offset in state array (positional, changes each compile) */
  readonly slotStart: number;
  /** Number of lanes at compile time */
  readonly laneCount: number;
  /** Floats per lane (>=1) */
  readonly stride: number;
  /** Per-lane initial values template (length = stride) */
  readonly initial: readonly number[];
}

/**
 * Union of scalar and field state mappings.
 */
export type StateMapping = StateMappingScalar | StateMappingField;
```

### Change to Make

**Insert after line 638** (after `StateMappingScalar` closing brace):

```typescript
/**
 * Spec-aligned type alias for scalar state slot declarations.
 *
 * This is the name used in the specification (04-compilation.md §I9).
 * The implementation uses `StateMappingScalar` as the canonical name
 * because it clarifies the "mapping" between semantic state IDs and
 * positional slots.
 *
 * @see StateMappingScalar
 * @see design-docs/CANONICAL-oscilla-v2.5-20260109/topics/04-compilation.md §I9
 */
export type ScalarSlotDecl = StateMappingScalar;
```

**Insert after line 660** (after `StateMappingField` closing brace):

```typescript
/**
 * Spec-aligned type alias for field state slot declarations.
 *
 * This is the name used in the specification (04-compilation.md §I9).
 * The implementation uses `StateMappingField` as the canonical name
 * because it clarifies the "mapping" between semantic state IDs and
 * positional slots, with lane remapping for hot-swap.
 *
 * @see StateMappingField
 * @see design-docs/CANONICAL-oscilla-v2.5-20260109/topics/04-compilation.md §I9
 */
export type FieldSlotDecl = StateMappingField;
```

---

## 2. Convenience Accessor Functions

**File**: `src/compiler/backend/schedule-program.ts`  
**Location**: After line 77 (in "Helper Functions" section, before `findRenderBlocks`)

### Current Code Context (lines 75-97)

```typescript
/**
 * State slot definition
 */
export interface StateSlotDef {
  readonly initialValue: number;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Find all render blocks in the validated graph.
 */
function findRenderBlocks(
  blocks: readonly Block[]
): Array<{ block: Block; index: BlockIndex }> {
  // ... implementation
}
```

### Change to Make

**Insert after line 77** (before `findRenderBlocks` function):

```typescript
/**
 * Get scalar state slot declarations from a schedule.
 *
 * Filters the `stateMappings` array to return only scalar (signal cardinality) state slots.
 * This provides the spec-aligned API name while maintaining the single-source-of-truth
 * implementation via the union array.
 *
 * @param schedule - The schedule IR to query
 * @returns Array of scalar state slot declarations
 *
 * @example
 * ```typescript
 * const scalars = getScalarSlots(schedule);
 * scalars.forEach(slot => {
 *   console.log(`Scalar state ${slot.stateId} at slot ${slot.slotIndex}`);
 * });
 * ```
 */
export function getScalarSlots(schedule: ScheduleIR): ScalarSlotDecl[] {
  return schedule.stateMappings.filter((m): m is ScalarSlotDecl => m.kind === 'scalar');
}

/**
 * Get field state slot declarations from a schedule.
 *
 * Filters the `stateMappings` array to return only field (many cardinality) state slots.
 * These represent per-lane state that undergoes continuity-based remapping during hot-swap.
 *
 * @param schedule - The schedule IR to query
 * @returns Array of field state slot declarations
 *
 * @example
 * ```typescript
 * const fields = getFieldSlots(schedule);
 * fields.forEach(slot => {
 *   console.log(`Field state ${slot.stateId} for instance ${slot.instanceId}: ${slot.laneCount} lanes`);
 * });
 * ```
 */
export function getFieldSlots(schedule: ScheduleIR): FieldSlotDecl[] {
  return schedule.stateMappings.filter((m): m is FieldSlotDecl => m.kind === 'field');
}
```

**Import Statement Update** (near top of file, around line 18):

Add `ScalarSlotDecl, FieldSlotDecl` to the import from `'../ir/types'`:

```typescript
import type { 
  Step, StepEvalEvent, StepRender, StepMaterialize, StepContinuityMapBuild, 
  StepContinuityApply, TimeModel, InstanceId, InstanceDecl, FieldExprId, 
  SigExprId, SigExpr, FieldExpr, ValueSlot, ContinuityPolicy, StateMapping, 
  EventSlotId, ScalarSlotDecl, FieldSlotDecl  // <-- ADD THESE
} from '../ir/types';
```

---

## 3. Documentation Updates

**File**: `src/compiler/backend/schedule-program.ts`  
**Location**: Lines 32-60 (ScheduleIR interface JSDoc)

### Current Code (lines 32-60)

```typescript
/**
 * ScheduleIR - Complete execution schedule
 *
 * Contains everything the runtime needs to execute a frame:
 * - timeModel: Time configuration
 * - instances: Instance declarations (count, layout, etc)
 * - steps: Ordered execution steps
 * - stateSlotCount: Number of persistent state slots
 * - stateSlots: Initial values for state slots (legacy format)
 * - stateMappings: State mappings with stable IDs for hot-swap migration
 */
export interface ScheduleIR {
  /** Time model configuration */
  readonly timeModel: TimeModel;

  /** Instance declarations (instance ID → InstanceDecl) */
  readonly instances: ReadonlyMap<InstanceId, InstanceDecl>;

  /** Ordered execution steps */
  readonly steps: readonly Step[];

  /** Number of persistent state slots */
  readonly stateSlotCount: number;

  /** Initial values for state slots (legacy format, use stateMappings for hot-swap) */
  readonly stateSlots: readonly StateSlotDef[];

  /** State mappings with stable IDs for hot-swap migration */
  readonly stateMappings: readonly StateMapping[];
  
  // ... rest of interface
}
```

### Changes to Make

**Update interface JSDoc** (replace lines 32-42):

```typescript
/**
 * ScheduleIR - Complete execution schedule
 *
 * Contains everything the runtime needs to execute a frame:
 * - timeModel: Time configuration
 * - instances: Instance declarations (count, layout, etc)
 * - steps: Ordered execution steps
 * - stateSlotCount: Number of persistent state slots
 * - stateSlots: Initial values (legacy format, prefer stateMappings)
 * - stateMappings: Canonical source for state slot declarations (ScalarSlotDecl | FieldSlotDecl)
 *
 * **Accessing State Slots:**
 * Use `getScalarSlots(schedule)` and `getFieldSlots(schedule)` for typed access to state declarations.
 * These provide the spec-aligned API (ScalarSlotDecl, FieldSlotDecl) while maintaining the
 * implementation's union array (stateMappings).
 *
 * @see ScalarSlotDecl - Type alias for scalar state slots (spec terminology)
 * @see FieldSlotDecl - Type alias for field state slots (spec terminology)
 * @see getScalarSlots - Helper to filter scalar slots
 * @see getFieldSlots - Helper to filter field slots
 * @see design-docs/CANONICAL-oscilla-v2.5-20260109/topics/04-compilation.md §I9
 */
```

**Update `stateSlots` field comment** (line 56):

```typescript
/**
 * **Legacy format** - Initial values for state slots.
 *
 * This is an expanded array used only for initial state buffer allocation.
 * For hot-swap migration and semantic state queries, use `stateMappings` instead.
 * For typed access, use `getScalarSlots()` or `getFieldSlots()`.
 *
 * @deprecated Legacy expanded format. Use stateMappings for hot-swap migration.
 *             Use getScalarSlots() / getFieldSlots() for spec-aligned typed access.
 */
readonly stateSlots: readonly StateSlotDef[];
```

**Update `stateMappings` field comment** (line 59-60):

```typescript
/**
 * Canonical source for state slot declarations with stable IDs.
 *
 * This array contains both scalar and field state mappings (ScalarSlotDecl | FieldSlotDecl).
 * Each mapping includes:
 * - Stable semantic identity (stateId) for hot-swap migration
 * - Positional slot information (slotIndex/slotStart)
 * - Memory layout (stride, laneCount)
 * - Initial values
 *
 * Use `getScalarSlots()` / `getFieldSlots()` for typed access, or iterate directly:
 *
 * @example
 * ```typescript
 * // Option 1: Typed accessors
 * const scalars = getScalarSlots(schedule);
 * const fields = getFieldSlots(schedule);
 *
 * // Option 2: Direct iteration with discrimination
 * for (const mapping of schedule.stateMappings) {
 *   if (mapping.kind === 'scalar') {
 *     console.log(`Scalar: ${mapping.stateId} at slot ${mapping.slotIndex}`);
 *   } else {
 *     console.log(`Field: ${mapping.stateId}, ${mapping.laneCount} lanes`);
 *   }
 * }
 * ```
 */
readonly stateMappings: readonly StateMapping[];
```

---

## 4. Unit Tests

**File**: `src/compiler/backend/__tests__/schedule-program.test.ts` (create if doesn't exist)

If the test file exists, add this test suite. If not, create the file with this content:

```typescript
import { getScalarSlots, getFieldSlots } from '../schedule-program';
import type { ScheduleIR, ScalarSlotDecl, FieldSlotDecl } from '../../ir/types';

describe('State Slot Accessors', () => {
  // Helper to create minimal test schedule
  function createTestSchedule(stateMappings: Array<ScalarSlotDecl | FieldSlotDecl>): ScheduleIR {
    return {
      timeModel: { kind: 'continuous', fps: 60 },
      instances: new Map(),
      steps: [],
      stateSlotCount: stateMappings.reduce((sum, m) => 
        sum + (m.kind === 'scalar' ? m.stride : m.laneCount * m.stride), 0
      ),
      stateSlots: [],
      stateMappings,
      eventSlotCount: 0,
      eventExprCount: 0
    };
  }

  describe('getScalarSlots', () => {
    it('should return only scalar state mappings', () => {
      const schedule = createTestSchedule([
        { kind: 'scalar', stateId: 's1' as any, slotIndex: 0, stride: 1, initial: [0] },
        { kind: 'field', stateId: 'f1' as any, instanceId: 'inst1', slotStart: 1, laneCount: 4, stride: 1, initial: [0] },
        { kind: 'scalar', stateId: 's2' as any, slotIndex: 5, stride: 2, initial: [0, 0] }
      ]);

      const result = getScalarSlots(schedule);

      expect(result).toHaveLength(2);
      expect(result[0].kind).toBe('scalar');
      expect(result[0].stateId).toBe('s1');
      expect(result[1].kind).toBe('scalar');
      expect(result[1].stateId).toBe('s2');
    });

    it('should return empty array when no scalar slots exist', () => {
      const schedule = createTestSchedule([
        { kind: 'field', stateId: 'f1' as any, instanceId: 'inst1', slotStart: 0, laneCount: 4, stride: 1, initial: [0] }
      ]);

      const result = getScalarSlots(schedule);

      expect(result).toHaveLength(0);
    });

    it('should narrow TypeScript type correctly', () => {
      const schedule = createTestSchedule([
        { kind: 'scalar', stateId: 's1' as any, slotIndex: 0, stride: 1, initial: [0] }
      ]);

      const result = getScalarSlots(schedule);

      // TypeScript type test - should compile without type assertion
      const slotIndex: number = result[0].slotIndex;
      expect(slotIndex).toBe(0);

      // Should NOT have field-specific properties
      // @ts-expect-error - slotStart doesn't exist on ScalarSlotDecl
      const slotStart = result[0].slotStart;
    });
  });

  describe('getFieldSlots', () => {
    it('should return only field state mappings', () => {
      const schedule = createTestSchedule([
        { kind: 'scalar', stateId: 's1' as any, slotIndex: 0, stride: 1, initial: [0] },
        { kind: 'field', stateId: 'f1' as any, instanceId: 'inst1', slotStart: 1, laneCount: 4, stride: 1, initial: [0] },
        { kind: 'field', stateId: 'f2' as any, instanceId: 'inst2', slotStart: 5, laneCount: 8, stride: 2, initial: [0, 0] }
      ]);

      const result = getFieldSlots(schedule);

      expect(result).toHaveLength(2);
      expect(result[0].kind).toBe('field');
      expect(result[0].stateId).toBe('f1');
      expect(result[0].laneCount).toBe(4);
      expect(result[1].kind).toBe('field');
      expect(result[1].stateId).toBe('f2');
      expect(result[1].laneCount).toBe(8);
    });

    it('should return empty array when no field slots exist', () => {
      const schedule = createTestSchedule([
        { kind: 'scalar', stateId: 's1' as any, slotIndex: 0, stride: 1, initial: [0] }
      ]);

      const result = getFieldSlots(schedule);

      expect(result).toHaveLength(0);
    });

    it('should narrow TypeScript type correctly', () => {
      const schedule = createTestSchedule([
        { kind: 'field', stateId: 'f1' as any, instanceId: 'inst1', slotStart: 0, laneCount: 4, stride: 1, initial: [0] }
      ]);

      const result = getFieldSlots(schedule);

      // TypeScript type test - should compile without type assertion
      const laneCount: number = result[0].laneCount;
      expect(laneCount).toBe(4);

      // Should NOT have scalar-specific properties
      // @ts-expect-error - slotIndex doesn't exist on FieldSlotDecl
      const slotIndex = result[0].slotIndex;
    });
  });

  describe('Integration', () => {
    it('should partition stateMappings array correctly', () => {
      const mappings = [
        { kind: 'scalar' as const, stateId: 's1' as any, slotIndex: 0, stride: 1, initial: [0] },
        { kind: 'field' as const, stateId: 'f1' as any, instanceId: 'inst1', slotStart: 1, laneCount: 4, stride: 1, initial: [0] },
        { kind: 'scalar' as const, stateId: 's2' as any, slotIndex: 5, stride: 2, initial: [0, 0] },
        { kind: 'field' as const, stateId: 'f2' as any, instanceId: 'inst2', slotStart: 7, laneCount: 8, stride: 1, initial: [0] }
      ];
      const schedule = createTestSchedule(mappings);

      const scalars = getScalarSlots(schedule);
      const fields = getFieldSlots(schedule);

      // Should partition correctly
      expect(scalars.length + fields.length).toBe(mappings.length);
      expect(scalars).toHaveLength(2);
      expect(fields).toHaveLength(2);

      // No overlap
      const scalarIds = new Set(scalars.map(s => s.stateId));
      const fieldIds = new Set(fields.map(f => f.stateId));
      expect([...scalarIds].some(id => fieldIds.has(id))).toBe(false);
    });
  });
});
```

---

## Testing Strategy

### Manual Verification Steps

1. **Type Checking:**
   ```bash
   npm run typecheck
   # Expect: 0 errors
   ```

2. **Run Tests:**
   ```bash
   npm test -- schedule-program.test.ts
   # Expect: All new tests pass
   
   npm test
   # Expect: All 347+ tests pass (no regressions)
   ```

3. **IDE Verification:**
   - Open `src/compiler/ir/types.ts` in IDE
   - Hover over `ScalarSlotDecl` → should show JSDoc with spec reference
   - Type `ScalarSlot` → autocomplete should offer `ScalarSlotDecl`
   - Hover over `stateSlots` field in ScheduleIR → should show deprecation warning

4. **Usage Test:**
   ```typescript
   // Add this temporary test in a scratch file
   import { getScalarSlots, getFieldSlots } from './compiler/backend/schedule-program';
   
   function testUsage(schedule: ScheduleIR) {
     const scalars = getScalarSlots(schedule);  // Should infer ScalarSlotDecl[]
     const fields = getFieldSlots(schedule);    // Should infer FieldSlotDecl[]
     
     scalars.forEach(s => console.log(s.slotIndex));  // Should compile
     fields.forEach(f => console.log(f.laneCount));   // Should compile
   }
   ```

---

## Common Patterns in Codebase

### Existing StateMapping Usage

Current code already uses `stateMappings`. Example from `CompileOrchestrator.ts`:

```typescript
const stateMappings = newSchedule?.stateMappings ?? [];
for (const mapping of stateMappings) {
  if (mapping.kind === 'scalar') {
    // Handle scalar state
  } else {
    // Handle field state
  }
}
```

After this sprint, users can also write:

```typescript
const scalars = getScalarSlots(newSchedule);
const fields = getFieldSlots(newSchedule);

scalars.forEach(s => { /* ... */ });
fields.forEach(f => { /* ... */ });
```

### Type Guard Pattern

The implementation uses TypeScript's type predicate pattern:

```typescript
(m): m is ScalarSlotDecl => m.kind === 'scalar'
```

This tells TypeScript that if the predicate returns true, the type is narrowed to `ScalarSlotDecl`. This is superior to a type assertion because it's verified at runtime.

---

## Completion Checklist

- [ ] Types added to `src/compiler/ir/types.ts` (2 type aliases)
- [ ] Functions added to `src/compiler/backend/schedule-program.ts` (2 functions)
- [ ] Import statement updated (add ScalarSlotDecl, FieldSlotDecl)
- [ ] JSDoc updated for ScheduleIR interface
- [ ] JSDoc updated for stateMappings field
- [ ] Deprecation added to stateSlots field
- [ ] Unit tests created or added
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes (all tests)
- [ ] IDE shows correct autocomplete and deprecation warnings

**Estimated Time**: 1-2 hours for implementation + testing
