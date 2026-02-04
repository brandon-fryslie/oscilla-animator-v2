# Implementation Context: frontend-ui-wiring

Generated: 2026-02-03T23:00:00 (revised 2026-02-04T00:00:00)

## Key Files

### Compiler Frontend (read-only except WI-3 small change to compile.ts)
- `src/compiler/frontend/index.ts` — `compileFrontend()`, `FrontendResult`, `FrontendCompileResult`
- `src/compiler/frontend/analyze-type-constraints.ts` — `TypeResolvedPatch`, `PortKey`
- `src/compiler/frontend/normalize-default-sources.ts` — default source materialization
- `src/compiler/ir/patches.ts` — `TypedPatch`, `NormalizedPatch`
- `src/compiler/compile.ts` — `compile()`, `CompileOptions` (add `precomputedFrontend`)

### Canonical Address System
- `src/types/canonical-address.ts` — `CanonicalAddress`, `addressToString()`, `parseAddress()`
- `src/graph/addressing.ts` — `getBlockAddress()`, `getInputAddress()`, `getOutputAddress()`
- `src/graph/address-registry.ts` — `AddressRegistry` (reference pattern)

### Files to Create
- `src/stores/FrontendResultStore.ts` — new MobX store
- `src/stores/__tests__/FrontendResultStore.test.ts` — unit tests

### Files to Modify
- `src/stores/RootStore.ts` — add `FrontendResultStore`
- `src/services/CompileOrchestrator.ts` — add `compileFrontend()` call, pass precomputed
- `src/compiler/compile.ts` — add `precomputedFrontend` to `CompileOptions`
- `src/ui/reactFlowEditor/nodes.ts` — update `getEffectiveDefaultSource()`, port types
- `src/ui/reactFlowEditor/sync.ts` — thread `FrontendResultStore` through reconciliation

## Type Reference

### FrontendResult (from compiler/frontend/index.ts:67-78)
```typescript
interface FrontendResult {
  readonly typedPatch: TypedPatch;
  readonly cycleSummary: CycleSummary;
  readonly errors: readonly FrontendError[];
  readonly backendReady: boolean;
  readonly normalizedPatch: NormalizedPatch;
}
```

### FrontendCompileResult (from compiler/frontend/index.ts:91-93)
```typescript
type FrontendCompileResult =
  | { kind: 'ok'; result: FrontendResult }
  | FrontendFailure;  // { kind: 'error'; errors; normalizedPatch?; typedPatch? }
```

### TypedPatch (from compiler/ir/patches.ts:76-79)
```typescript
interface TypedPatch extends TypeResolvedPatch {
  readonly blockOutputTypes: ReadonlyMap<string, ReadonlyMap<string, CanonicalType | InstanceRef>>;
}
```

### PortKey format (from analyze-type-constraints.ts:24)
```typescript
type PortKey = `${number}:${string}:${'in' | 'out'}`;
// blockIndex:portName:direction — e.g., "0:pos:in", "3:out:out"
```

### CanonicalAddress format (from types/canonical-address.ts)
```typescript
// Block: "v1:blocks.{canonical_name}"
// Input: "v1:blocks.{canonical_name}.inputs.{port_id}"
// Output: "v1:blocks.{canonical_name}.outputs.{port_id}"
```

### Addressing helpers (from graph/addressing.ts)
```typescript
getBlockAddress(block: Block): BlockAddress
getInputAddress(block: Block, portId: PortId): InputAddress
getOutputAddress(block: Block, portId: PortId): OutputAddress
```

### NormalizedEdge role shapes (from normalize-default-sources.ts — TO VERIFY IN WI-6)
```typescript
// Default source edge
edge.role = { kind: 'default', meta: { defaultSourceBlockId: string } }

// User wire edge
edge.role = { kind: 'user' } // or undefined/null — TO VERIFY

// Adapter edge
edge.role = { kind: 'adapter', meta: { ... } } // shape TO VERIFY
```

### Derived block role shapes (TO VERIFY IN WI-6)
```typescript
block.role = { kind: 'derived', meta: { kind: 'defaultSource', target: { blockId, portId } } }
```

## Architecture Patterns

### MobX Store Pattern (follow existing stores)
```typescript
import { makeAutoObservable } from 'mobx';

export class FrontendResultStore {
  snapshot: FrontendSnapshot = EMPTY_SNAPSHOT;

  constructor() {
    makeAutoObservable(this);
  }
}
```

### Precomputed Frontend Pattern (WI-3 change to compile.ts)
```typescript
// In CompileOptions:
readonly precomputedFrontend?: {
  readonly normalizedPatch: NormalizedPatch;
  readonly typedPatch: TypedPatch;
};

// In compile():
let normalized: NormalizedPatch;
let typedPatch: TypedPatch;
let typeResolved: TypeResolvedPatch;

if (options?.precomputedFrontend) {
  // Reuse pre-computed frontend
  normalized = options.precomputedFrontend.normalizedPatch;
  typedPatch = options.precomputedFrontend.typedPatch;
  typeResolved = typedPatch; // TypedPatch extends TypeResolvedPatch
} else {
  // Run inline frontend (existing code)
  ...
}

// Continue with pass3 (time topology)...
```

### Canonical Address Index Pattern (WI-5)
```typescript
// Inside updateFromFrontendResult():
const resolvedPortTypes = new Map<string, CanonicalType>();
const blockIdToCanonical = new Map<string, string>();

for (let i = 0; i < normalizedPatch.blocks.length; i++) {
  const block = normalizedPatch.blocks[i];
  const blockAddr = getBlockAddress(block);
  blockIdToCanonical.set(block.id, blockAddr.canonicalName);
}

for (const [portKey, type] of typedPatch.portTypes) {
  const [blockIndexStr, portName, dir] = portKey.split(':');
  const block = normalizedPatch.blocks[parseInt(blockIndexStr)];
  const addr = dir === 'in'
    ? getInputAddress(block, portName as PortId)
    : getOutputAddress(block, portName as PortId);
  resolvedPortTypes.set(addressToString(addr), type);
}
```

## Important Constraints

1. **`compile()` backward compatible** — must still work without `precomputedFrontend`. All existing tests use standalone mode.
2. **No backend modifications** — passes 3-7, lower-blocks, schedule-program untouched.
3. **UI must handle null/none snapshot** — before first compile, all queries return undefined/false.
4. **Revision coherence** — snapshot carries `patchRevision`, UI should not display stale data.
5. **Canonical addresses as external API** — internal storage keyed by address strings, but convenience id-based queries available for incremental migration.

## ChatGPT Review Feedback (incorporated)

1. **Prevent drift**: Don't run two frontend implementations. Add `precomputedFrontend` to `compile()` instead of double-running.
2. **Stable UI contract**: Expose `FrontendSnapshot` (projection), not raw `FrontendResult` (compiler internal).
3. **General provenance**: Not just default sources — cover user edges, adapters, unresolved.
4. **Revision coherence**: Snapshot must carry `patchRevision` to prevent stale display.
5. **Explicit status**: `'none' | 'frontendOk' | 'frontendError'` — UI never guesses.
6. **Frontend produces address index**: Translation from PortKey → canonical address happens at snapshot construction time (not in UI queries).
