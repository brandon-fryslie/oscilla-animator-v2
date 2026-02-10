# Fix: Backend Instance ID Rewriting for Source Blocks

## Context

Source blocks (Const, etc.) with no incoming edges don't get their output types rewritten from frontend instance IDs to runtime instance IDs. The frontend cardinality solver promotes a Const's output to `many(circle:grid-elements)` via zipBroadcast propagation, but the backend creates a runtime instance `inst-0`. Since `inferInstanceContext()` only checks incoming edges, it returns `undefined` for source blocks, so auto-propagation and rewriting never fire. When a downstream block (Multiply) calls `alignInputs()`, it sees `inst-0 != grid-elements` and throws.

The fix creates an explicit mapping from frontend instance refs to runtime instance IDs, and uses it as a fallback when edge-based inference fails.

## Changes

### 1. `src/compiler/ir/OrchestratorIRBuilder.ts` — Add two interface methods

```ts
import type { InstanceRef } from '../../core/canonical-types/instance-ref';

// In the OrchestratorIRBuilder interface, under "Queries" section:

/** Register mapping from frontend instance ref (block ID) to runtime instance ID. */
registerFrontendInstanceMapping(frontendRef: InstanceRef, runtimeId: InstanceId): void;

/** Look up runtime instance ID for a frontend instance ref. */
getRuntimeInstanceForFrontend(ref: InstanceRef): InstanceId | undefined;
```

### 2. `src/compiler/ir/IRBuilderImpl.ts` — Implement the mapping

Add private state (alongside `instances` map ~line 55):
```ts
private frontendToRuntimeInstance = new Map<string, InstanceId>();
```

Key serialization helper (private method):
```ts
private instanceRefKey(ref: InstanceRef): string {
  return `${ref.domainTypeId}:${ref.instanceId}`;
}
```

Implement the two methods:
```ts
registerFrontendInstanceMapping(frontendRef: InstanceRef, runtimeId: InstanceId): void {
  this.frontendToRuntimeInstance.set(this.instanceRefKey(frontendRef), runtimeId);
}

getRuntimeInstanceForFrontend(ref: InstanceRef): InstanceId | undefined {
  return this.frontendToRuntimeInstance.get(this.instanceRefKey(ref));
}
```

### 3. `src/compiler/backend/lower-blocks.ts` — Two changes in `lowerBlockInstance()`

**3a. Register mapping after transform block lowering (~line 565, after auto-propagation)**

After the auto-propagation block and before the instance rewriting block (~line 566), add:

```ts
// Register frontend→runtime instance mapping for transform blocks.
// [LAW:one-source-of-truth] The frontend uses instanceRef(domainType, blockId);
// the backend creates inst-N. This mapping connects them.
if ('instanceContext' in result && result.instanceContext !== undefined) {
  const cardMeta = blockDef.cardinality;
  if (cardMeta?.cardinalityMode === 'transform') {
    builder.registerFrontendInstanceMapping(
      instanceRef(cardMeta.domainType as string, block.id),
      result.instanceContext
    );
  }
}
```

Requires importing `instanceRef` from `../../core/canonical-types/instance-ref` and `getBlockCardinalityMetadata` (or using `blockDef.cardinality`). `blockDef` is already available as the `BlockDef` at this point.

**3b. Fallback instance inference from portTypes (~line 427, after `inferInstanceContext`)**

After the existing `inferInstanceContext` call, add the portTypes-based fallback:

```ts
// Fallback: if no incoming edges provide instance context, check if any
// output was solved to many by the frontend and map to runtime instance.
// [LAW:one-source-of-truth] Uses the explicit frontend→runtime mapping,
// never guesses by domain type alone.
if (inferredInstance === undefined && portTypes) {
  for (const portName of Object.keys(blockDef.outputs)) {
    const pt = portTypes.get(portKey(blockIndex, portName, 'out'));
    if (!pt) continue;
    const card = requireInst(pt.extent.cardinality, 'cardinality');
    if (card.kind !== 'many') continue;
    const runtime = builder.getRuntimeInstanceForFrontend(card.instance);
    if (runtime !== undefined) {
      inferredInstance = runtime;
      break;
    }
  }
}
```

**3c. Diagnostic for unmapped frontend instance refs**

If a port has `many` cardinality but no mapping exists, emit a compile error instead of silently leaving the mismatch:

```ts
if (inferredInstance === undefined && portTypes) {
  for (const portName of Object.keys(blockDef.outputs)) {
    const pt = portTypes.get(portKey(blockIndex, portName, 'out'));
    if (!pt) continue;
    const card = requireInst(pt.extent.cardinality, 'cardinality');
    if (card.kind !== 'many') continue;
    const runtime = builder.getRuntimeInstanceForFrontend(card.instance);
    if (runtime !== undefined) {
      inferredInstance = runtime;
      break;
    } else {
      errors.push({
        code: 'NotImplemented',
        message: `Backend instance mapping missing for ${block.type}#${block.id}: ` +
          `frontend instance ${card.instance.domainTypeId}:${card.instance.instanceId} ` +
          `has no corresponding runtime instance`,
        where: { blockId: block.id },
      });
    }
  }
}
```

### 4. Execution order concern

The fallback in 3b reads `portTypes` which carry **frontend** instance IDs (e.g., `circle:grid-elements`). It calls `getRuntimeInstanceForFrontend()` which requires the mapping to already be registered. This works because:
- Transform blocks (Array) are lowered **before** downstream preserve/source blocks in topological order (backend schedules by dependency graph)
- The Array block registers the mapping in 3a during its own lowering pass
- Downstream blocks (Const connected via Multiply) are lowered later and find the mapping

If topological order isn't guaranteed: the lowering loop in `pass6BlockLowering` iterates SCCs in dependency order, so transform blocks always precede their dependents. Source blocks with no edges are scheduled independently, but they only get promoted to `many` if connected to a transform's outputs — so the transform is always lowered first in the SCC ordering.

## Verification

1. Run `npx vitest run src/compiler/__tests__/compile.test.ts` — existing compile tests pass
2. Run `npx vitest run src/blocks/__tests__/` — block tests pass
3. Run `npx vitest run` — full test suite, check for reduced failure count
4. Specifically test the rect-mosaic demo (if it exists as an HCL or test fixture) to verify the Const→Multiply→Array chain works
5. Test a graph with two independent Arrays of the same domain type to confirm they don't cross-bind

## Files Modified

- `src/compiler/ir/OrchestratorIRBuilder.ts` — 2 new interface methods
- `src/compiler/ir/IRBuilderImpl.ts` — 1 private map, 1 private helper, 2 method implementations
- `src/compiler/backend/lower-blocks.ts` — mapping registration + fallback inference + diagnostic
