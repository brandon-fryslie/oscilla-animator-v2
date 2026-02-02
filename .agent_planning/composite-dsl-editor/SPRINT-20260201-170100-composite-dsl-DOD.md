# Definition of Done: composite-dsl

## Acceptance Criteria

### Serializer
- [ ] `serializeCompositeToHCL()` produces valid HCL with `composite "Type" {}` header
- [ ] Metadata: label, category, description, capability all emitted when present
- [ ] Internal blocks emitted with type, displayName, params (sorted)
- [ ] Internal edges emitted as `outputs {}` inside source blocks
- [ ] `expose_input` / `expose_output` blocks emitted with block, port, optional label
- [ ] Output is deterministic (identical input → identical output)

### Deserializer
- [ ] `deserializeCompositeFromHCL()` parses `composite` header and extracts type name
- [ ] Metadata attributes parsed (label, category, description, capability)
- [ ] Internal blocks parsed with correct InternalBlockId, type, params
- [ ] Internal edges parsed from `outputs {}` / `inputs {}` syntax
- [ ] `expose_input` / `expose_output` parsed to ExposedInputPort / ExposedOutputPort
- [ ] Errors collected (not thrown): bad refs, missing fields, parse errors
- [ ] Rejects `patch` header (wrong document type)

### Round-Trip
- [ ] All 4 library composites (SmoothNoise, ColorCycle, DelayedTrigger, PingPong) round-trip
- [ ] serialize → deserialize → serialize produces identical output
- [ ] Edge cases: empty params, no description, minimal composite (1 block, 1 output)

### Store Integration
- [ ] `CompositeEditorStore.toHCL()` returns valid HCL from current state
- [ ] `CompositeEditorStore.fromHCL(hcl)` loads valid HCL into editor state
- [ ] `fromHCL()` returns errors array; on error, editor state is unchanged

### API
- [ ] New functions exported from `src/patch-dsl/index.ts`
- [ ] TypeScript types exported for result types

### Tests
- [ ] Unit tests for serializer (each feature)
- [ ] Unit tests for deserializer (each feature + error cases)
- [ ] Round-trip tests for library composites
- [ ] Store integration tests (toHCL/fromHCL)

### Verification
- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes (all existing + new tests)
