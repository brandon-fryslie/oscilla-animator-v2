# Sprint: Conversion - Bidirectional Patch ↔ HCL
Generated: 2026-02-01-163100
Confidence: HIGH: 3, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION
Source: EVALUATION-20260201-162800.md

## Sprint Goal
Implement bidirectional conversion between Patch objects and HCL text: serializer (Patch → HCL), deserializer (HCL → Patch), and public API with deep equality testing.

## Scope
**Deliverables:**
- Serializer (patch-to-hcl.ts, serialize.ts + tests) — Patch → HCL string
- Deserializer (patch-from-ast.ts, deserialize.ts + tests) — HCL → Patch
- Public API (index.ts) — serializePatchToHCL, deserializePatchFromHCL
- Deep equality helper (patchesEqual) for round-trip testing

**Dependencies:**
- Sprint 1 (Foundation) — ast.ts, lexer.ts, parser.ts, errors.ts

**Non-Goals (Deferred):**
- Composite block deserialization (plan line 164)
- Editor metadata (positions, viewport) (plan line 233)
- Integration with PatchPersistence (Sprint 3)

## Work Items

### P0 (Critical): Patch → HCL Serializer (HIGH confidence)

**Dependencies**: Sprint 1 (ast.ts)
**Spec Reference**: Plan Phase 4 (lines 96-127) • **Status Reference**: EVALUATION-20260201-162800.md lines 228-231, 423-425

#### Description
Walk a Patch object and emit HCL text. This is the simpler direction (no reference resolution). Must handle all Patch features: blocks, edges, params, port overrides, varargs, lenses, roles, domains. Must produce deterministic output (sorted blocks, edges, params) for clean git diffs.

#### Acceptance Criteria
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

#### Technical Notes
**Block name resolution algorithm:**
1. Build `Map<BlockId, string>` from canonical displayNames
2. Detect collisions with `detectCanonicalNameCollisions()` from src/core/canonical-name.ts
3. For collisions, append `_2`, `_3` etc. until unique
4. Use this map for serializing edge references

**Deterministic ordering:**
- Sort blocks by canonical displayName (use `normalizeCanonicalName()`)
- Edges already sorted by sortKey in Patch
- Params: sort by Object.keys().sort()
- Ports: sort by port ID (natural order)

**Edge role filtering:**
- Only emit edges where `edge.role.kind === 'user'`
- Derived edges (e.g., from lens expansion) are normalization artifacts

**Pretty-printing:**
- Use simple indent counter: start at 0, increment on `{`, decrement on `}`
- Emit `\n` + `'  '.repeat(indent)` before each line
- Example: `block "A" {\n  foo = 42\n}`

---

### P0 (Critical): HCL → Patch Deserializer (HIGH confidence)

**Dependencies**: Sprint 1 (parser.ts, ast.ts), patch-to-hcl.ts (for patterns)
**Spec Reference**: Plan Phase 5 (lines 129-165) • **Status Reference**: EVALUATION-20260201-162800.md lines 234-239, 426-431

#### Description
Convert HCL AST to Patch object with error collection (not throwing). Two-phase: (1) parse HCL to AST, (2) resolve references and assemble Patch. Must handle malformed HCL gracefully: unresolvable references → skip edge + error, duplicate names → rename + warning, unknown block types → preserve as-is.

#### Acceptance Criteria
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

#### Technical Notes
**Two-phase algorithm:**

**Phase 1 (Parse):**
```typescript
const tokens = tokenize(hcl);
const parseResult = parse(tokens);
const errors: PatchDslError[] = [...parseResult.errors];
```

**Phase 2 (Resolve & Assemble):**
1. Find `patch` or `composite` header block (first block)
2. Build block map:
   ```typescript
   const blockMap = new Map<string, BlockId>();
   for (const hclBlock of document.blocks.filter(b => b.type === 'block')) {
     const type = hclBlock.labels[0];       // First label = block type
     const displayName = hclBlock.labels[1]; // Second label = display name
     const blockId = generateId();
     blockMap.set(normalizeCanonicalName(displayName), blockId);
   }
   ```
3. Process each `block` entry:
   - Extract params from attributes (exclude reserved: `role`, `domain`)
   - Extract port overrides from nested `port` blocks
   - Extract vararg connections from nested `vararg` blocks
   - Extract lenses from nested `lens` blocks
4. Process each `connect` entry:
   - Resolve `from` reference: split on `.` → [blockName, portName]
   - Look up blockId in blockMap, portId from portName
   - Same for `to` reference
   - If either unresolvable: push error, skip edge
   - Extract nested `lens` blocks and `adapter` attribute

**Reference resolution:**
```typescript
function resolveReference(ref: HclReferenceValue, blockMap: Map<string, BlockId>): Endpoint | null {
  if (ref.parts.length !== 2) {
    return null;  // Invalid reference
  }
  const [blockName, portName] = ref.parts;
  const blockId = blockMap.get(normalizeCanonicalName(blockName));
  if (!blockId) return null;
  return { kind: 'port', blockId, slotId: portName };
}
```

**Error collection pattern:**
- Never throw exceptions during deserialization
- Collect errors/warnings in arrays
- Continue processing after errors
- Return partial patch + error list

---

### P1 (High): Deep Equality Helper for Round-Trip Testing (HIGH confidence)

**Dependencies**: None (pure utility)
**Spec Reference**: Plan line 224 (round-trip) • **Status Reference**: EVALUATION-20260201-162800.md lines 511-550

#### Description
Implement `patchesEqual(a: Patch, b: Patch): boolean` for testing round-trip serialization. Must handle Patch structure correctly: Maps (order-insensitive), readonly arrays (order-sensitive for edges), nested objects. Required for Sprint 3 round-trip tests.

#### Acceptance Criteria
- [ ] `patchesEqual(a: Patch, b: Patch): boolean` implemented
- [ ] Compares block counts (Map.size)
- [ ] Compares blocks (order-insensitive): for each block in a, check corresponding block in b with `blocksEqual()`
- [ ] Compares edge counts (array.length)
- [ ] Compares edges (order-sensitive after sorting by sortKey)
- [ ] `blocksEqual(a: Block, b: Block): boolean` compares all fields: type, params, displayName, domainId, role, inputPorts, outputPorts
- [ ] `edgesEqual(a: Edge, b: Edge): boolean` compares all fields: from, to, enabled, sortKey, role
- [ ] Handles nested structures: params (deep equality), port overrides, varargs, lenses
- [ ] All tests pass (equality.test.ts): identical patches, reordered blocks, different edges, nested differences

#### Technical Notes
**Implementation pattern:**
```typescript
export function patchesEqual(a: Patch, b: Patch): boolean {
  // Compare block counts
  if (a.blocks.size !== b.blocks.size) return false;

  // Compare blocks (order-insensitive)
  for (const [id, blockA] of a.blocks) {
    const blockB = b.blocks.get(id);
    if (!blockB || !blocksEqual(blockA, blockB)) return false;
  }

  // Compare edges (order-sensitive after sorting)
  const edgesA = [...a.edges].sort((x, y) => x.sortKey - y.sortKey);
  const edgesB = [...b.edges].sort((x, y) => x.sortKey - y.sortKey);
  if (edgesA.length !== edgesB.length) return false;
  for (let i = 0; i < edgesA.length; i++) {
    if (!edgesEqual(edgesA[i], edgesB[i])) return false;
  }

  return true;
}

function blocksEqual(a: Block, b: Block): boolean {
  return a.id === b.id
    && a.type === b.type
    && a.displayName === b.displayName
    && a.domainId === b.domainId
    && deepEqual(a.params, b.params)
    && rolesEqual(a.role, b.role)
    && portsEqual(a.inputPorts, b.inputPorts)
    && portsEqual(a.outputPorts, b.outputPorts);
}

function edgesEqual(a: Edge, b: Edge): boolean {
  return a.id === b.id
    && endpointsEqual(a.from, b.from)
    && endpointsEqual(a.to, b.to)
    && a.enabled === b.enabled
    && a.sortKey === b.sortKey
    && rolesEqual(a.role, b.role);
}

// Helper: deep equality for params (JSON.stringify or custom)
function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
```

**Note**: This is a testing utility, not production code. Simple JSON.stringify is acceptable for params.

---

### P1 (High): Public API (HIGH confidence)

**Dependencies**: serialize.ts, deserialize.ts
**Spec Reference**: Plan Phase 6 (lines 167-174) • **Status Reference**: EVALUATION-20260201-162800.md lines 438-441

#### Description
Export the public API from src/patch-dsl/index.ts. Clean exports, no internal implementation details leaked.

#### Acceptance Criteria
- [ ] `index.ts` exports `serializePatchToHCL` from serialize.ts
- [ ] `index.ts` exports `deserializePatchFromHCL` from deserialize.ts
- [ ] `index.ts` exports types: `DeserializeResult`, `PatchDslError`, `PatchDslWarning` from errors.ts
- [ ] `index.ts` exports `patchesEqual` from equality.ts (testing utility)
- [ ] No internal implementation details exported (ast.ts, lexer.ts, parser.ts remain internal)
- [ ] File compiles with no errors

#### Technical Notes
```typescript
// src/patch-dsl/index.ts
export { serializePatchToHCL } from './serialize';
export { deserializePatchFromHCL, type DeserializeResult } from './deserialize';
export { PatchDslError, PatchDslWarning } from './errors';
export { patchesEqual } from './equality';  // Testing utility
```

---

## Dependencies
**External:**
- src/graph/Patch.ts (Patch, Block, Edge types)
- src/core/canonical-name.ts (normalizeCanonicalName, detectCanonicalNameCollisions)
- src/blocks/registry.ts (requireBlockDef for validation)
- src/types/index.ts (BlockId, PortId, BlockRole, EdgeRole, etc.)

**Internal (from Sprint 1):**
- ast.ts (HclDocument, HclBlock, HclValue)
- lexer.ts (tokenize)
- parser.ts (parse)
- errors.ts (PatchDslError, PatchDslWarning)

**Internal (within sprint):**
- serialize.ts exports serializePatchToHCL
- deserialize.ts exports deserializePatchFromHCL, DeserializeResult
- equality.ts exports patchesEqual
- index.ts re-exports all public APIs

## Risks
**Low** — Serialization is straightforward (walk Patch, emit HCL). Deserialization has reference resolution complexity, but algorithm is clear and error handling is well-defined.

**Medium risk item: Reference resolution edge cases**
- **Risk**: Block name collisions during deserialization (multiple blocks with same canonical name)
- **Mitigation**: Detect collisions, rename with suffix `_2`, emit warning
- **Risk**: Unresolvable references (block or port not found)
- **Mitigation**: Skip edge, collect error, continue (partial patch)

## Notes
- All items are HIGH confidence (Patch type is stable, algorithms are deterministic)
- Estimated effort: ~8 hours (serialize: 3h, deserialize: 4h, equality: 1h, tests: included)
- Serialization is deterministic (sorted output) for clean git diffs
- Deserialization is tolerant (partial patches + errors, no exceptions)
