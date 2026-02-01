# Definition of Done: Conversion
Generated: 2026-02-01-163100
Status: READY FOR IMPLEMENTATION
Plan: SPRINT-20260201-163100-conversion-PLAN.md

## Acceptance Criteria

### Patch → HCL Serializer
- [ ] `serializePatchToHCL(patch: Patch, options?: { name?: string }): string` implemented
- [ ] Emits `patch "Name" {}` header with all blocks and edges inside
- [ ] For each block: emits `block "Type" "displayName" { ... }` with params, role, domain, port overrides
- [ ] For each edge: emits `connect { from = blockName.port, to = blockName.port }` with enabled, adapter, lens nested blocks
- [ ] Skips derived edges (role.kind !== 'user') during serialization
- [ ] Block name collision resolution: append `_2`, `_3` etc. to displayName when canonical names collide
- [ ] Deterministic output: blocks sorted by canonical displayName, edges by sortKey, params by key name, ports by port ID
- [ ] Handles varargs: emits nested `vararg "portId" { connect { ... } }` blocks with sortKey ordering
- [ ] Handles lenses: emits nested `lens "lensType" { sourceAddress = "..." }` blocks with params if present
- [ ] Pretty-printed with 2-space indentation
- [ ] All tests pass (serialize.test.ts): simple patch, complex patch, varargs, lenses, name collisions, empty patch

### HCL → Patch Deserializer
- [ ] `deserializePatchFromHCL(hcl: string): DeserializeResult` implemented
- [ ] `DeserializeResult` interface: `{ patch: Patch, errors: PatchDslError[], warnings: PatchDslWarning[] }`
- [ ] Phase 1: Lex → parse → HclDocument (collect parse errors)
- [ ] Phase 2: Extract patch header, process block entries, build `Map<string, BlockId>` (name → ID)
- [ ] Phase 3: Process connect entries, resolve references using block map, assemble Patch
- [ ] Reference resolution: `blockName.portName` → Endpoint (blockId, slotId)
- [ ] Unresolvable references: collect error, skip that edge (partial patch)
- [ ] Duplicate block names: rename with suffix `_2`, add warning
- [ ] Unknown block types: preserve as-is (string type), add warning if not in registry
- [ ] Missing required attributes: use defaults from registry, add warning
- [ ] Empty HCL: return empty patch (no blocks, no edges, no errors)
- [ ] All tests pass (deserialize.test.ts): valid HCL, unresolvable refs, duplicate names, malformed input, empty HCL

### Deep Equality Helper
- [ ] `patchesEqual(a: Patch, b: Patch): boolean` implemented
- [ ] Compares block counts (Map.size)
- [ ] Compares blocks (order-insensitive): for each block in a, check corresponding block in b with `blocksEqual()`
- [ ] Compares edge counts (array.length)
- [ ] Compares edges (order-sensitive after sorting by sortKey)
- [ ] `blocksEqual(a: Block, b: Block): boolean` compares all fields: type, params, displayName, domainId, role, inputPorts, outputPorts
- [ ] `edgesEqual(a: Edge, b: Edge): boolean` compares all fields: from, to, enabled, sortKey, role
- [ ] Handles nested structures: params (deep equality), port overrides, varargs, lenses
- [ ] All tests pass (equality.test.ts): identical patches, reordered blocks, different edges, nested differences

### Public API
- [ ] `index.ts` exports `serializePatchToHCL` from serialize.ts
- [ ] `index.ts` exports `deserializePatchFromHCL` from deserialize.ts
- [ ] `index.ts` exports types: `DeserializeResult`, `PatchDslError`, `PatchDslWarning` from errors.ts
- [ ] `index.ts` exports `patchesEqual` from equality.ts (testing utility)
- [ ] No internal implementation details exported (ast.ts, lexer.ts, parser.ts remain internal)
- [ ] File compiles with no errors

## Overall Sprint Success Criteria
- [ ] All files compile without TypeScript errors
- [ ] All tests pass: `npx vitest run src/patch-dsl/__tests__/serialize.test.ts src/patch-dsl/__tests__/deserialize.test.ts src/patch-dsl/__tests__/equality.test.ts`
- [ ] Simple demo patch can be serialized to HCL
- [ ] HCL can be deserialized back to Patch
- [ ] Malformed HCL produces partial patch + error list (no exceptions)
- [ ] API exports clean and documented

## Verification Command
```bash
npx vitest run src/patch-dsl/__tests__/serialize.test.ts src/patch-dsl/__tests__/deserialize.test.ts src/patch-dsl/__tests__/equality.test.ts
```
