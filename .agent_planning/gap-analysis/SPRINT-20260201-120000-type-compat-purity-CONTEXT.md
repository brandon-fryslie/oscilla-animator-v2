# SUPERSEDED — See SPRINT-20260201-140000-purity-authority-CONTEXT.md + SPRINT-20260201-140000-frontend-solver-CONTEXT.md
# Implementation Context: Type-Compat-Purity

Generated: 2026-02-01T12:00:00Z
Source: EVALUATION-20260201-120000.md
Confidence: MEDIUM

## 1. isTypeCompatible - Mechanical Removal

### File to modify
`/Users/bmf/code/oscilla-animator-v2/src/compiler/frontend/analyze-type-graph.ts`

### Current signature (line 55)
```typescript
function isTypeCompatible(from: CanonicalType, to: CanonicalType, sourceBlockType?: string, targetBlockType?: string): boolean {
```

### Target signature
```typescript
function isTypeCompatible(from: CanonicalType, to: CanonicalType): boolean {
```

### Lines to remove
- **Lines 79-86**: Cardinality-generic exception block
```typescript
    if (targetBlockType) {
      const meta = getBlockCardinalityMetadata(targetBlockType);
      if (meta && isCardinalityGeneric(targetBlockType)) {
        if (meta.broadcastPolicy === 'allowZipSig' || meta.broadcastPolicy === 'requireBroadcastExpr') {
          return true;
        }
      }
    }
```

- **Lines 88-97**: Cardinality-preserving exception block
```typescript
    if (fromCard.kind === 'one' && toCard.kind === 'many' && sourceBlockType) {
      const sourceMeta = getBlockCardinalityMetadata(sourceBlockType);
      if (sourceMeta?.cardinalityMode === 'preserve') {
        return true;
      }
    }
```

### Import to remove (line 22-23)
```typescript
import {
  getBlockDefinition,
  getBlockCardinalityMetadata,  // REMOVE
  isCardinalityGeneric,         // REMOVE
} from "../../blocks/registry";
```
Keep `getBlockDefinition` (used on line 137).

### Call site to update (line 182)
```typescript
// Before:
if (!isTypeCompatible(fromType, toType, fromBlock.type, toBlock.type)) {
// After:
if (!isTypeCompatible(fromType, toType)) {
```

---

## 2. Cardinality Resolution in Type Inference (Pass 1)

### File to modify
`/Users/bmf/code/oscilla-animator-v2/src/compiler/frontend/analyze-type-constraints.ts`

### Current behavior
Pass 1 resolves port types into `TypeResolvedPatch.portTypes: ReadonlyMap<PortKey, CanonicalType>`. For cardinality-generic blocks, the output type uses the BlockDef's static cardinality (typically `one` for signal).

### Required change
When resolving output port types for cardinality-generic blocks, check input cardinality:
- If any input has `cardinality.value.kind === 'many'`, resolve all outputs to `many` with the same instance reference
- If all inputs are `one`, outputs stay `one`

### Key functions/types involved

**Block registry cardinality metadata** (`src/blocks/registry.ts`):
```typescript
export function getBlockCardinalityMetadata(blockType: string): BlockCardinalityMetadata | undefined
export function isCardinalityGeneric(blockType: string): boolean
// isCardinalityGeneric = cardinalityMode === 'preserve' && laneCoupling === 'laneLocal'
```

**CanonicalType construction** (`src/core/canonical-types.ts`):
```typescript
export function withInstance(type: CanonicalType, instance: InstanceRef): CanonicalType
export function cardinalityMany(instance: InstanceRef): CardinalityMany
```

**TypeResolvedPatch output** (`src/compiler/frontend/analyze-type-constraints.ts:29-31`):
```typescript
export interface TypeResolvedPatch extends NormalizedPatch {
  readonly portTypes: ReadonlyMap<PortKey, CanonicalType>;
}
```

### Where to add cardinality resolution logic
In `analyze-type-constraints.ts`, after initial port type resolution but before returning `portTypes`. The pass already iterates blocks and resolves types. Add a second pass or inline check:

```
For each block with isCardinalityGeneric(block.type):
  Collect input port types from portTypes map
  If any input has cardinality.value.kind === 'many':
    Get the instance reference from that input
    For each output port:
      Rewrite output type with withInstance(outputType, instanceRef)
```

### Pattern to follow
The existing code in `analyze-type-constraints.ts` already uses `getBlockCardinalityMetadata` (imported at line 14). The cardinality resolution logic should live here, not in Pass 2.

---

## 3. Enforcement Test Un-skip

### File to modify
`/Users/bmf/code/oscilla-animator-v2/src/compiler/__tests__/type-system-enforcement.test.ts` (created in Sprint A)

### Change
```typescript
// Before:
it.skip('isTypeCompatible signature must be pure (2 params only)', () => {
// After:
it('isTypeCompatible signature must be pure (2 params only)', () => {
```

---

## 4. Test Files to Update/Add

### Existing test to check
`/Users/bmf/code/oscilla-animator-v2/src/compiler/__tests__/` - search for tests that compile mixed-cardinality graphs

### New test cases needed
Add to `src/compiler/frontend/__tests__/` (or `src/compiler/__tests__/`):
- Compile a graph: ArrayBlock(Circle) -> Mul(field, signal) -> downstream. Verify Mul output has `cardinality: many`.
- Compile a graph: signal -> Sin -> downstream. Verify Sin output has `cardinality: one`.
- Compile a graph: field -> Add(field1, field2 same instance) -> downstream. Verify Add output matches instance.
- Error case: field1(instanceA) -> Add <- field2(instanceB). Should produce type error (instance mismatch).
