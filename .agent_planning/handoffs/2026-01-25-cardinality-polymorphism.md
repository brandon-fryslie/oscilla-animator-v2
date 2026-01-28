# Handoff: Cardinality Polymorphism for Field Operation Blocks

**Date:** 2026-01-25
**Status:** In Progress
**Branch:** bmf_dev

## Problem Statement

Compilation fails with type mismatch errors when connecting field outputs to polymorphic blocks like `Add`:

```
NoConversionPath: Type mismatch: cannot connect many+continuous<float, unit:scalar>
to one+continuous<float, unit:scalar> (GoldenAngle.angle -> Add.a)
```

The root cause: blocks like `GoldenAngle`, `AngularOffset`, etc. were marked as `cardinalityMode: 'fieldOnly'` with `signalTypeField()` port types, but they should be **cardinality-polymorphic** (work with both signals and fields).

## Key Insight (from user)

> "A signal is just 1 item. A field is just a bunch of signals. There isn't anything different about operating as a signal or a field."

This means:
1. Blocks shouldn't need separate signal/field paths in their `lower` functions
2. Port types should use `canonicalType()` (polymorphic) not `signalTypeField()` (forces many)
3. The type system should allow cardinality mixing for polymorphic blocks

## Completed Work

### 1. Pass 2 Type Graph Fix (COMMITTED - 436f5a8)

Modified `src/compiler/passes-v2/pass2-types.ts`:

- Updated `isTypeCompatible()` to accept `targetBlockType` parameter
- For blocks with `cardinalityMode: 'preserve'` and `broadcastPolicy: 'allowZipSig'` or `'requireBroadcastExpr'`, allow cardinality mismatches
- This lets polymorphic blocks accept both signal and field inputs

### 2. Block Metadata Updates (PARTIALLY DONE - uncommitted)

In `src/blocks/field-operations-blocks.ts`:

**Changed to `cardinalityMode: 'preserve'`:**
- FromDomainId
- GoldenAngle
- AngularOffset
- FieldPolarToCartesian
- FieldCartesianToPolar
- Pulse
- RadiusSqrt
- Jitter2D
- HueFromPhase
- SetZ

**Changed port types from `signalTypeField()` to `canonicalType()`:**
- FromDomainId (output)
- GoldenAngle (input/output)
- AngularOffset (input/output)

## Remaining Work

### 1. Update Port Types for Remaining Blocks

Need to change `signalTypeField('float', 'default')` to `canonicalType('float')` for:

- FieldPolarToCartesian (inputs: angle, radius; output: pos)
- FieldCartesianToPolar (input: pos; outputs: angle, radius)
- Pulse (input: id01; output: value)
- RadiusSqrt (inputs: id01, radius; output: out)
- Jitter2D (inputs: pos, rand; output: out)
- HueFromPhase (input: id01; output: hue)
- SetZ (inputs: pos, z; output: out)

### 2. Update Other Block Files

Similar changes needed in:
- `src/blocks/identity-blocks.ts` (StableIdHash, DomainIndex)
- `src/blocks/path-operators-blocks.ts` (PathField)
- `src/blocks/render-blocks.ts` (RenderInstances2D)

### 3. Verify Lower Functions

The `lower` functions currently have guards like:
```typescript
if (!id01 || id01.k !== 'field') {
  throw new Error('GoldenAngle id01 must be a field');
}
```

Per user guidance, these should NOT need changes - the runtime handles signals as single-element fields. But verify this works correctly after port type changes.

### 4. Test and Commit

1. Run `npm run typecheck`
2. Test compilation with actual patch
3. Commit block changes

## Files to Modify

```
src/blocks/field-operations-blocks.ts  # Port types for remaining blocks
src/blocks/identity-blocks.ts          # StableIdHash, DomainIndex
src/blocks/path-operators-blocks.ts    # PathField
src/blocks/render-blocks.ts            # RenderInstances2D
```

## How to Continue

```bash
# Check current state
git status
git diff src/blocks/field-operations-blocks.ts

# Continue updating port types in field-operations-blocks.ts
# Pattern: signalTypeField('X', 'default') -> canonicalType('X')

# After all port types updated, run typecheck
npm run typecheck

# Test compilation
npm run dev
# Load a patch that uses GoldenAngle/AngularOffset -> Add

# Commit when working
git add -A && git commit -m "refactor: Make field operation blocks cardinality-polymorphic"
```

## Context Files

- Spec: `design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md`
- Type system: `src/core/canonical-types.ts`
- Block registry: `src/blocks/registry.ts`
- Pass 2: `src/compiler/passes-v2/pass2-types.ts`
