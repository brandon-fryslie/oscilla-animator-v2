# Implementation Context: Runtime Instance Count Fix

## Sprint: runtime-instance-count
Generated: 2026-01-19

## Background

The diagnostic infrastructure (ParamChanged, BlockLowered events) has been implemented and shows that:
1. UI param changes reach PatchStore correctly
2. Compiler reads param values correctly during lowering
3. BlockLowered events show the correct count from params

The gap is in the **runtime execution layer** - verifying that the compiled instance count actually affects execution.

## Key Code Paths

### 1. Compilation → Instance Declaration

**File:** `src/compiler/passes-v2/pass6-block-lowering.ts`

Array block lowering creates instances:
```typescript
// In array-blocks.ts lower function:
const count = (config?.count as number) ?? 100;
const instanceId = ctx.b.createInstance(DOMAIN_CIRCLE, count, { kind: 'unordered' });
```

The instance is registered in IRBuilder, which becomes part of `UnlinkedIRFragments.builder.getInstances()`.

### 2. Schedule Construction

**File:** `src/compiler/passes-v2/pass7-schedule.ts`

Instances from Pass 6 become schedule.instances:
```typescript
export function pass7Schedule(unlinkedIR: UnlinkedIRFragments): ScheduleIR {
  const instances = unlinkedIR.builder.getInstances();
  // ... becomes part of schedule
}
```

### 3. Runtime Execution

**File:** `src/runtime/ScheduleExecutor.ts`

The executor reads `schedule.instances` to determine how many iterations to run for field operations.

**Key question:** Does it properly read the instance count, or is it cached/hardcoded?

### 4. State Buffer Allocation

**File:** `src/main.ts` (runtime initialization) or `src/runtime/index.ts`

Runtime state is created based on compiled slot counts. If instance count changes significantly (5000 → 100), do buffers resize?

## Investigation Steps

### Step 1: Add Post-Recompile Logging

In `src/main.ts`, after `const program = compile(patch, options)`:

```typescript
// Log instance counts from compiled program
if (program.schedule?.instances) {
  for (const [id, decl] of program.schedule.instances) {
    log(`[Recompile] Instance ${id}: count=${decl.count}`);
  }
}
```

### Step 2: Check ScheduleExecutor Instance Handling

In `src/runtime/ScheduleExecutor.ts`, find where field operations iterate over instances:

```typescript
// Look for loops like:
for (let i = 0; i < instanceCount; i++) {
  // execute field operation
}
```

Verify `instanceCount` comes from `schedule.instances.get(instanceId).count`.

### Step 3: Verify Buffer Sizing

Check if runtime state allocation uses instance counts:
- Does `createRuntimeState()` take instance counts into account?
- Are field slot allocations multiplied by instance count?
- When count changes, are new allocations made?

## Likely Fix Locations

### If instances not iterating correctly:
`src/runtime/ScheduleExecutor.ts` - ensure `executeFieldOp()` uses current instance count

### If buffers not resizing:
`src/main.ts` or `src/runtime/RuntimeState.ts` - ensure state recreation on instance count change

### If GridLayout overriding:
`src/blocks/layout-blocks.ts` - ensure GridLayout reads instance count from context, not params

## Diagnostic Events Available

Use these events (already implemented) for tracing:

1. **ParamChanged** - Emitted when UI changes param
   - `[Param] Array#b2.count: 5000 → 100`

2. **BlockLowered** - Emitted during compilation
   - `[Compiler] Array#b2 created instance instance_0 with count=100`

3. **Add new diagnostic** - Instance count during execution
   - `[Runtime] Executing instance instance_0: count=100`

## Files Summary

| File | Purpose | Action |
|------|---------|--------|
| `src/main.ts` | Recompile orchestration | Add post-recompile instance logging |
| `src/runtime/ScheduleExecutor.ts` | Field op execution | Verify instance iteration |
| `src/runtime/RuntimeState.ts` | Buffer allocation | Check resize on instance change |
| `src/blocks/layout-blocks.ts` | GridLayout | Verify doesn't override count |
| `src/compiler/passes-v2/pass7-schedule.ts` | Schedule creation | Reference only |

## Expected Outcome

After fix, changing Array.count in UI should:
1. Trigger ParamChanged event (already works)
2. Trigger recompile with new count (already works)
3. **NEW:** Runtime executes with new instance count
4. **NEW:** Visual preview shows correct number of elements
