# Implementation Context: quality-fixes
Generated: 2026-02-01
Source: EVALUATION-2026-02-01-195800.md

## 1. Fix sourceAddress Matching Bug

### File: `src/compiler/frontend/normalize-adapters.ts`
**Lines 190-198** in `analyzeLenses()`:

Current code (buggy):
```typescript
for (const lens of port.lenses) {
  // Find all edges targeting this (block, port) pair
  // For now, we insert lens for all edges to this port.
  // The sourceAddress in the lens could be used for more precise matching in the future.
  for (const edge of patch.edges) {
    if (edge.enabled === false) continue;
    if (edge.to.kind !== 'port') continue;
    if (edge.from.kind !== 'port') continue;
    if (edge.to.blockId !== blockId || edge.to.slotId !== portId) continue;
```

Fix: After line 198, add sourceAddress matching:
```typescript
    // Match lens to the specific source edge via sourceAddress
    // sourceAddress format: "v1:blocks.{blockId}.outputs.{portId}"
    const expectedSource = parseSourceAddress(lens.sourceAddress);
    if (expectedSource && (edge.from.blockId !== expectedSource.blockId || edge.from.slotId !== expectedSource.portId)) {
      continue;
    }
```

Add helper function (above `analyzeLenses` or at top of file):
```typescript
function parseSourceAddress(addr: string): { blockId: string; portId: string } | null {
  // Format: "v1:blocks.{blockId}.outputs.{portId}"
  const match = addr.match(/^v1:blocks\.(.+)\.outputs\.(.+)$/);
  if (!match) return null;
  return { blockId: match[1], portId: match[2] };
}
```

Remove the comment on lines 192-193.

### Test File: `src/graph/__tests__/pass2-adapters.test.ts`
Add test cases following the existing pattern (9 tests currently pass). The tests use `PatchBuilder` to construct patches. Example pattern from existing tests:

```typescript
it('expands lens only for matching source edge', () => {
  // Build patch with two sources connected to same port, lens on one
  // Verify only the matching edge gets lens block
});
```

---

## 2. Replace JSON.stringify Extent Comparison

### File: `src/blocks/adapter-spec.ts`

**Line 139** in `extentMatches()`:
```typescript
// BEFORE (line 139):
if (JSON.stringify(actualAxis) !== JSON.stringify(patternAxis)) {

// AFTER: use per-axis equality
```

The pattern is a `Partial<Extent>`, so each key maps to an `Axis<T>`. Import the per-axis equality from canonical-types:

```typescript
import { extentsEqual } from '../core/canonical-types';
import { requireInst } from '../core/canonical-types/axis';
import {
  cardinalitiesEqual,
  temporalitiesEqual,
  bindingsEqual,
  perspectivesEqual,
  branchesEqual,
} from '../core/canonical-types/equality';
```

Replace the loop body in `extentMatches()`:
```typescript
function extentMatches(actual: Extent, pattern: ExtentPattern): boolean {
  if (pattern === 'any') return true;

  for (const key in pattern) {
    const k = key as keyof Extent;
    const patternAxis = pattern[k];
    const actualAxis = actual[k];
    if (!patternAxis) continue;

    // Use per-axis structural equality
    if (!axisValuesEqual(k, actualAxis, patternAxis)) {
      return false;
    }
  }
  return true;
}
```

Where `axisValuesEqual` dispatches by axis name:
```typescript
function axisValuesEqual(axisName: keyof Extent, a: Axis<unknown>, b: Axis<unknown>): boolean {
  const aVal = requireInst(a, axisName);
  const bVal = requireInst(b, axisName);
  switch (axisName) {
    case 'cardinality': return cardinalitiesEqual(aVal, bVal);
    case 'temporality': return temporalitiesEqual(aVal, bVal);
    case 'binding': return bindingsEqual(aVal, bVal);
    case 'perspective': return perspectivesEqual(aVal, bVal);
    case 'branch': return branchesEqual(aVal, bVal);
  }
}
```

**Line 191** in `patternsAreCompatible()`:
```typescript
// BEFORE:
return JSON.stringify(from.extent) === JSON.stringify(to.extent);

// AFTER:
return extentsEqual(from.extent as Extent, to.extent as Extent);
```

### Import paths:
- `extentsEqual`: from `'../core/canonical-types'` (already re-exported)
- Per-axis fns: from `'../core/canonical-types/equality'`
- `requireInst`: from `'../core/canonical-types/axis'`
- `Axis` type: from `'../core/canonical-types/axis'`

### Existing import (line 16, keep):
```typescript
import { unitsEqual } from '../core/canonical-types';
```

Change to:
```typescript
import { unitsEqual, extentsEqual } from '../core/canonical-types';
```

### Test File: `src/blocks/__tests__/adapter-spec.test.ts`
Add a test that constructs two Extent objects with the same semantic values. The existing tests should all pass since the equality semantics are unchanged (just more robust).

---

## 3. Remove Debug Console Logs

### File: `src/ui/reactFlowEditor/lensUtils.ts`

**Lines 110-129** current code:
```typescript
export function findCompatibleLenses(
  sourceType: InferenceCanonicalType,
  targetType: InferenceCanonicalType
): LensTypeInfo[] {
  const allLenses = getAvailableLensTypes();

  console.log('[Lens Debug] Finding lenses for:', {    // DELETE lines 111-115
    source: sourceType,
    target: targetType,
    availableLenses: allLenses.length,
  });

  const compatible = allLenses.filter(lens => {
    const canApply = canApplyLens(sourceType, lens.inputType, lens.outputType, targetType);
    console.log('[Lens Debug] Checking lens:', {        // DELETE lines 119-124
      lens: lens.label,
      lensInput: lens.inputType,
      lensOutput: lens.outputType,
      canApply,
    });
    return canApply;
  });

  console.log('[Lens Debug] Compatible lenses found:', compatible.length);  // DELETE line 128
  return compatible;
}
```

After cleanup:
```typescript
export function findCompatibleLenses(
  sourceType: InferenceCanonicalType,
  targetType: InferenceCanonicalType
): LensTypeInfo[] {
  const allLenses = getAvailableLensTypes();
  return allLenses.filter(lens =>
    canApplyLens(sourceType, lens.inputType, lens.outputType, targetType)
  );
}
```
