# Sprint: composite-dsl — Composite HCL Serialization

Generated: 2026-02-01T17:01:00
Confidence: HIGH: 4, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION

## Sprint Goal
Add `composite` header support to the patch-dsl so CompositeBlockDef can be serialized/deserialized to HCL text with full fidelity.

## HCL Syntax Design

```hcl
composite "SmoothNoise" {
  label = "Smooth Noise"
  category = "composite"
  description = "Noise filtered through Lag"
  capability = "state"

  block "Noise" "noise" {}

  block "Lag" "lag" {
    smoothing = 0.9
    outputs {
      out = noise.x
    }
  }

  # Internal wiring uses same outputs {} syntax as patches
  # (already shown above inside blocks)

  expose_input "x" {
    block = "noise"
    port = "x"
    label = "X"
  }

  expose_input "smoothing" {
    block = "lag"
    port = "smoothing"
  }

  expose_output "out" {
    block = "lag"
    port = "out"
    label = "Output"
  }
}
```

### Syntax Rules
- Header is `composite "TypeName" {}` (vs `patch "Name" {}`)
- Top-level attributes: `label`, `category`, `description`, `capability` (all optional except label)
- Internal blocks use identical `block "Type" "name" {}` syntax with `outputs {}` / `inputs {}`
- `expose_input "externalId" { block = "internalBlockId"; port = "portId"; label = "Display" }`
- `expose_output "externalId" { block = "internalBlockId"; port = "portId"; label = "Display" }`
- The `label` attribute inside expose blocks is optional

## Scope

### P0: Composite Serializer
- New function: `serializeCompositeToHCL(def: CompositeBlockDef, options?): string`
- Emits `composite "Type" {}` header with metadata attributes
- Emits internal blocks with params (sorted deterministically)
- Emits internal edges as inline `outputs {}` (reuses existing edge→outputs logic)
- Emits `expose_input` / `expose_output` blocks (sorted by externalId)
- Lives in new file `src/patch-dsl/composite-serialize.ts`

**Acceptance Criteria:**
- [ ] Serializes SmoothNoise library composite to valid HCL
- [ ] All metadata fields round-trip (label, category, description, capability)
- [ ] Internal blocks with params serialize correctly
- [ ] Internal edges serialize as `outputs {}` inside source blocks
- [ ] Exposed input/output ports serialize with block, port, and optional label
- [ ] Output is deterministic (sorted blocks, ports, metadata)

### P0: Composite Deserializer
- New function: `deserializeCompositeFromHCL(hcl: string): CompositeDeserializeResult`
- Parses `composite "Type" {}` header
- Extracts metadata attributes (label, category, description, capability)
- Processes internal blocks → builds `InternalBlockId` map
- Processes inline edges from `outputs {}` / `inputs {}` → builds `InternalEdge[]`
- Processes `expose_input` / `expose_output` blocks → builds exposed port arrays
- Error recovery: collects errors, produces partial result
- Lives in new file `src/patch-dsl/composite-deserialize.ts`

**Acceptance Criteria:**
- [ ] Deserializes composite HCL to CompositeBlockDef
- [ ] Metadata fields extracted correctly
- [ ] Internal blocks created with correct types and params
- [ ] Internal edges created from outputs/inputs syntax
- [ ] Exposed ports mapped correctly (externalId, internalBlockId, internalPortId, label)
- [ ] Unresolvable references produce errors (not crashes)
- [ ] Missing required fields produce clear errors

### P0: Public API + Tests
- Export new functions from `src/patch-dsl/index.ts`
- Round-trip tests: CompositeBlockDef → HCL → CompositeBlockDef identity
- Test each library composite (SmoothNoise, ColorCycle, etc.) round-trips
- Error case tests (missing label, unknown block refs, etc.)

**Acceptance Criteria:**
- [ ] All 4 library composites round-trip through serialize→deserialize
- [ ] Round-trip produces structurally equivalent CompositeBlockDef
- [ ] Error cases tested (missing metadata, bad port refs, etc.)
- [ ] Exported from patch-dsl public API

### P0: Store Integration Helpers
- `CompositeEditorStore` method: `toHCL(): string` — serialize current editor state to HCL
- `CompositeEditorStore` method: `fromHCL(hcl: string): { errors }` — load HCL into editor state
- These bridge the store's mutable state ↔ immutable CompositeBlockDef ↔ HCL text

**Acceptance Criteria:**
- [ ] `toHCL()` produces valid HCL from current editor state
- [ ] `fromHCL()` replaces editor state with deserialized composite
- [ ] `fromHCL()` returns errors if HCL is invalid (editor state unchanged on error)

## Dependencies
- Existing patch-dsl lexer/parser (reused as-is — `composite` header already recognized)
- Existing `CompositeBlockDef` and `CompositeEditorStore`
- Existing block registry (for validating internal block types)

## Technical Notes
- The parser already handles `composite "Name" {}` as a header (line 58 of patch-from-ast.ts)
- `expose_input` and `expose_output` parse as regular HCL blocks with type="expose_input"/"expose_output"
- Internal blocks reuse the same `block "Type" "Name" {}` syntax — code can share helpers with patch serializer
- The key difference from patch serialization: CompositeBlockDef uses `InternalBlockId` (simple string IDs, not generated), `InternalEdge` (simpler than Edge), and adds exposed port mapping

## Risks
- **Parser edge cases**: `expose_input` has an underscore — verify the lexer handles this as a single identifier (it should, since underscore is valid in identifiers)
