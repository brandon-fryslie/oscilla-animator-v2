# SUPERSEDED — See SPRINT-20260201-140000-frontend-solver-CONTEXT.md
# Implementation Context: Frontend-Instance

Generated: 2026-02-01T12:00:00Z
Source: EVALUATION-20260201-120000.md
Confidence: MEDIUM

## 1. Backend Type Rewriting - Code to Remove

### File: `/Users/bmf/code/oscilla-animator-v2/src/compiler/backend/lower-blocks.ts`

### Import to modify (line 15)
```typescript
// Before:
import { type CanonicalType, withInstance, instanceRef as makeInstanceRef, requireInst } from "../../core/canonical-types";
// After:
import { type CanonicalType, requireInst } from "../../core/canonical-types";
```
Remove `withInstance` and `instanceRef as makeInstanceRef`.

### Lines to remove (411-428)
```typescript
    // REMOVE THIS ENTIRE BLOCK:
    // Rewrite outTypes with actual instance ref for downstream blocks.
    // Type inference (pass 1) uses placeholder instance IDs from block definitions.
    // When a block has inferredInstance from upstream, rewrite field output types
    // to carry the actual instance ID so runtime can find the instance.
    if (inferredInstance) {
      const instanceDecl = builder.getInstances().get(inferredInstance);
      if (instanceDecl) {
        const ref = makeInstanceRef(instanceDecl.domainType as string, inferredInstance as string);
        outTypes = outTypes.map(t => {
          // Only rewrite types that have many cardinality (field types)
          const card = t.extent.cardinality;
          if (card.kind === 'inst' && card.value.kind === 'many') {
            return withInstance(t, ref);
          }
          return t;
        });
      }
    }
```

### outTypes should become (lines 407-409, keep as-is)
```typescript
    const outTypes: CanonicalType[] = Object.keys(blockDef.outputs)
      .map(portName => portTypes?.get(portKey(blockIndex, portName, 'out')))
      .filter((t): t is CanonicalType => t !== undefined);
```
Change `let` to `const` since we no longer reassign.

---

## 2. inferInstanceContext Function - Audit

### Location: `lower-blocks.ts:282-296`
```typescript
function inferInstanceContext(
  blockIndex: BlockIndex,
  edges: readonly NormalizedEdge[],
  instanceContextByBlock: Map<BlockIndex, InstanceId>
): InstanceId | undefined {
  const incomingEdges = edges.filter((e) => e.toBlock === blockIndex);
  for (const edge of incomingEdges) {
    const instanceContext = instanceContextByBlock.get(edge.fromBlock);
    if (instanceContext !== undefined) {
      return instanceContext;
    }
  }
  return undefined;
}
```

### Usage at line 392-394
```typescript
let inferredInstance: InstanceId | undefined;
if (edges !== undefined && instanceContextByBlock !== undefined) {
  inferredInstance = inferInstanceContext(blockIndex, edges, instanceContextByBlock);
}
```

### inferredInstance passed to LowerCtx at line 444
```typescript
const ctx: LowerCtx = {
  // ...
  inferredInstance,  // <-- Used by block lowering functions
  // ...
};
```

### Action required
Search all block lowering functions that read `ctx.inferredInstance`:
```bash
grep -r "ctx\.inferredInstance\|inferredInstance" src/blocks/ --include="*.ts"
grep -r "ctx\.inferredInstance\|inferredInstance" src/compiler/backend/ --include="*.ts"
```
If only used for type rewriting (already removed), remove `inferredInstance` from `LowerCtx` entirely.
If used for other purposes (instance count lookup, intrinsic materialization), keep but derive from `portTypes`.

### LowerCtx type definition
Located in `src/blocks/registry.ts` (exported as part of block API):
```typescript
export interface LowerCtx {
  blockIdx: BlockIndex;
  blockType: string;
  instanceId: string;  // block.id
  label: string;
  inTypes: CanonicalType[];
  outTypes: CanonicalType[];
  b: IRBuilder;
  seedConstId: number;
  inferredInstance?: InstanceId;  // <-- candidate for removal
  varargConnections?: Map<string, VarargConnection[]>;
}
```

---

## 3. Frontend Instance Resolution - Where to Add

### File to modify
`/Users/bmf/code/oscilla-animator-v2/src/compiler/frontend/analyze-type-constraints.ts`

### Current structure
Pass 1 iterates blocks and resolves types. It already imports:
```typescript
import { getBlockDefinition, getBlockCardinalityMetadata } from '../../blocks/registry';
```

### Instance propagation approach
After initial port type resolution, add an instance propagation pass:

```
1. Build a block -> instance map from Array/domain blocks
   (blocks that create instances have them in their portTypes already)
2. Iterate edges in topological order
3. For each edge where source port has cardinality=many:
   Extract instance reference from source type
   If target block is cardinality-generic/preserving:
     Rewrite target block's output portTypes with this instance reference
4. Repeat until stable (or single pass if topological)
```

### Key functions from canonical-types.ts
```typescript
// Extract instance from a many-cardinality type
export function requireManyInstance(type: CanonicalType): InstanceRef
// Create new type with instance
export function withInstance(type: CanonicalType, instance: InstanceRef): CanonicalType
// Check cardinality
export function cardinalityMany(instance: InstanceRef): CardinalityMany
```

### Topological ordering
Pass 4 (`pass4-depgraph.ts`) builds a dependency graph. Pass 1 does not have one. Options:
- Build a simple edge-order traversal in Pass 1
- Use the block ordering from the normalized patch (blocks are already sorted by the normalizer)
- Iterate to fixpoint (simple but potentially slow for large graphs)

---

## 4. Enforcement Test Un-skip

### File to modify
`/Users/bmf/code/oscilla-animator-v2/src/compiler/__tests__/type-system-enforcement.test.ts` (created in Sprint A)

### Change
```typescript
// Before:
it.skip('backend must not call withInstance to rewrite types', () => {
// After:
it('backend must not call withInstance to rewrite types', () => {
```

---

## 5. Test Files

### Existing relevant tests
- `/Users/bmf/code/oscilla-animator-v2/src/compiler/__tests__/instance-unification.test.ts` - Tests `requireManyInstance` extraction from types
- `/Users/bmf/code/oscilla-animator-v2/src/compiler/frontend/__tests__/frontend-independence.test.ts` - Tests frontend/backend split

### New tests needed
Add to `src/compiler/frontend/__tests__/`:
- Test that Pass 1 output `portTypes` contains correct instance IDs for cardinality-preserving block outputs
- Test that Pass 1 propagates instance through edge chains
- Test error case: conflicting instances on a single block's inputs
