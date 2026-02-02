# Implementation Context: composite-dsl

## Key Files

### To Create
- `src/patch-dsl/composite-serialize.ts` — CompositeBlockDef → HCL
- `src/patch-dsl/composite-deserialize.ts` — HCL → CompositeBlockDef
- `src/patch-dsl/__tests__/composite-roundtrip.test.ts` — round-trip tests

### To Modify
- `src/patch-dsl/index.ts` — export new functions
- `src/stores/CompositeEditorStore.ts` — add toHCL()/fromHCL() methods

### Key References (Read-Only)
- `src/blocks/composite-types.ts` — CompositeBlockDef, InternalBlockId, ExposedInputPort, ExposedOutputPort
- `src/blocks/composites/builder.ts` — builder API (reference for what fields matter)
- `src/blocks/composites/library/*.ts` — 4 library composites to test round-trip
- `src/patch-dsl/serialize.ts` — existing patch serializer (reuse patterns: emitValue, emitKey, toIdentifier, buildBlockNameMap-style logic)
- `src/patch-dsl/patch-from-ast.ts` — existing patch deserializer (reuse patterns: resolveReference, convertHclValue, processBlock)
- `src/patch-dsl/ast.ts` — HclDocument, HclBlock, HclValue types
- `src/blocks/registry.ts` — getBlockDefinition() for validating internal block types

## Serializer Design

### Reuse from serialize.ts
- `emitValue()` — emit HCL literals (numbers, strings, bools, arrays, objects)
- `emitKey()` — quote keys that aren't valid identifiers
- `toIdentifier()` — convert display names to identifier-safe form
- `isValidIdentifier()` — check if string is valid HCL identifier

These should be extracted or imported. Currently they're module-private. Either:
1. Export the helpers from serialize.ts (preferred — no duplication)
2. Or duplicate them (not preferred)

### Serializer Structure
```typescript
export function serializeCompositeToHCL(def: CompositeBlockDef): string {
  // 1. Emit header: composite "TypeName" {
  // 2. Emit metadata: label, category, description, capability
  // 3. Emit internal blocks (sorted by ID):
  //    - For each block: block "Type" "id" { params... outputs {} }
  //    - Build edge map: fromBlockId → InternalEdge[]
  //    - Emit outputs {} inside source blocks
  // 4. Emit expose_input blocks (sorted by externalId)
  // 5. Emit expose_output blocks (sorted by externalId)
  // 6. Close header
}
```

### Internal edges as outputs
InternalEdge has `{ fromBlock, fromPort, toBlock, toPort }` — map directly:
```
outputs {
  fromPort = toBlock.toPort
}
```
Fan-out: group by (fromBlock, fromPort), emit list if >1 target.

## Deserializer Design

### Entry Point
```typescript
export interface CompositeDeserializeResult {
  readonly def: CompositeBlockDef | null;
  readonly errors: PatchDslError[];
  readonly warnings: PatchDslWarning[];
}
```

### Algorithm
1. Parse HCL text → HclDocument (reuse existing lexer/parser)
2. Find `composite` header block
3. Extract metadata from header attributes
4. Process children:
   - `block` → internal blocks (collect deferred edges from outputs/inputs)
   - `expose_input` → exposed input ports
   - `expose_output` → exposed output ports
5. Resolve deferred edges (same pattern as patch-from-ast.ts)
6. Build CompositeBlockDef

### InternalBlockId Mapping
Unlike patches (which generate random BlockIds), composites use the display name as the InternalBlockId. The HCL `block "Type" "name" {}` label[1] ("name") IS the InternalBlockId.

## Store Integration

### toHCL()
```typescript
toHCL(): string {
  const def = this.buildCompositeDef(); // existing method or build one
  return serializeCompositeToHCL(def);
}
```

### fromHCL()
```typescript
fromHCL(hcl: string): { errors: PatchDslError[] } {
  const result = deserializeCompositeFromHCL(hcl);
  if (result.errors.length > 0 || !result.def) {
    return { errors: result.errors };
  }
  // Load def into store state
  this.loadFromDef(result.def);
  return { errors: [] };
}
```

The store needs a `loadFromDef(def: CompositeBlockDef)` method (or inline the logic in fromHCL). Check if `openExisting()` does something similar.
