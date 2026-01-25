# PLAN: Fix Const Block Type Unification (Payload Generic)

**Created**: 2026-01-25
**Status**: DRAFT
**Confidence**: HIGH
**Risk**: LOW

## Problem Statement

The Const block's output is hardcoded to `'float'` payload type, causing type unification failures when used as a default source for `int` inputs (e.g., `Polygon.sides`).

**Spec Violation**: ESSENTIAL-SPEC.md line 279 explicitly states:
> `Const.out` is generic in both payload and unit — resolved by what it connects to, never defaulted to `float<scalar>`.

## Root Cause

In `src/blocks/signal-blocks.ts:66`:
```typescript
out: { label: 'Output', type: signalType('float', unitVar('const_out')) },
```

The output uses:
- **Payload**: `'float'` (hardcoded concrete type) ❌
- **Unit**: `unitVar('const_out')` (polymorphic) ✓

When pass1-type-constraints tries to unify `'float'` (from Const) with `'int'` (from Polygon.sides), it fails with "ConflictingPayloads" error.

## Solution

Change the Const block output to use `payloadVar()` for polymorphic payload resolution:

```typescript
out: { label: 'Output', type: signalType(payloadVar('const_payload'), unitVar('const_out')) },
```

This allows the constraint solver to resolve the payload type from context (what the Const block connects to).

## Implementation Steps

### Step 1: Update Const Block Output Type
**File**: `src/blocks/signal-blocks.ts`
**Change**: Line 66

```typescript
// BEFORE
out: { label: 'Output', type: signalType('float', unitVar('const_out')) },

// AFTER
out: { label: 'Output', type: signalType(payloadVar('const_payload'), unitVar('const_out')) },
```

**Note**: Import `payloadVar` at top of file (already may be there, verify).

### Step 2: Verify Lower Function Handles All Payload Types

The `lower` function (lines 68-150) already has a switch on `payloadType` that handles:
- `float` ✓
- `int` ✓
- `cameraProjection` ✓
- `bool` ✓
- `vec2` ✓
- `vec3` ✓
- `color` ✓
- `shape` ✓

All payload types are already handled. No changes needed.

### Step 3: Verify Test Coverage

Check existing tests pass and add regression test for int default source scenario.

## Verification Criteria

1. **Compilation succeeds** for patches where Const provides int default values (e.g., Polygon.sides)
2. **Existing patches compile** without regression
3. **Type constraint errors** give clear messages when Const connects to incompatible typed ports
4. **Spec compliance**: Const resolves payload from context, not hardcoded to float

## Risk Assessment

**LOW RISK** because:
- Single line change in block definition
- The lower function already handles all payload types
- The constraint solver is already built to handle payloadVar resolution
- No architectural changes required

## Files Modified

1. `src/blocks/signal-blocks.ts` - Change output type to use payloadVar

## Dependencies

None - this is a self-contained fix using existing infrastructure.

## Test Plan

1. **Unit Test**: Create test that compiles a patch with:
   - ProceduralPolygon block with unconnected `sides` input
   - Verify default source Const block gets `int` payload type

2. **Regression**: Run existing test suite to verify no regressions

3. **Manual Verification**: Load a patch with polygon and verify it compiles/renders
