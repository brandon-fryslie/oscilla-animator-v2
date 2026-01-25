# Sprint: block-generics - Payload and Cardinality Generic Blocks

**Generated**: 2026-01-25 06:15
**Confidence**: HIGH: 8, MEDIUM: 3, LOW: 0
**Status**: READY FOR IMPLEMENTATION

## Sprint Goal

Remove "Field" prefix from 16 field operation blocks, genericize them as Payload and/or Cardinality generics, and remove redundant field-only definitions.

## Scope

**Deliverables**:
1. Identify and remove redundant Field* blocks that duplicate cardinality-generic signal blocks
2. Genericize remaining blocks with appropriate Payload and Cardinality metadata
3. Rename all blocks to remove "Field" prefix
4. Update all references (tests, imports, UI labels, docs)
5. Verify compiler picks correct specializations

## Work Items

### P0: Audit and Deduplication (HIGH confidence)

**Current state**:
- 16 Field operation blocks in `src/blocks/field-operations-blocks.ts`
- Existing cardinality-generic Add block in `src/blocks/math-blocks.ts`
- Field kernels in `src/runtime/FieldKernels.ts` support multiple operations

**Action**: Identify which Field* blocks duplicate existing signal-based blocks

**Candidates for Removal** (have signal-based cardinality-generic equivalent):
- ❌ **FieldAdd** → Already have cardinality-generic `Add` block
- ❌ **FieldMultiply** → Already have cardinality-generic `Multiply` block
- ❌ **FieldScale** → Equivalent to Multiply (scale = multiply by constant)

**Action**: Verify via grepping signal-based equivalents, then delete redundant blocks

**Acceptance Criteria**:
- [ ] Confirm Add, Multiply blocks exist and are cardinality-generic (preserve mode)
- [ ] Remove FieldAdd, FieldMultiply, FieldScale block definitions
- [ ] Update any tests that import or use removed blocks
- [ ] No compile errors after deletion

**Risks**:
- Removing might break demos/patches that use FieldAdd
- Need to migrate usage to Add block if found

### P1: Genericize Remaining Blocks (HIGH confidence)

**Remaining candidates** (13 blocks after deduplication):
1. FieldFromDomainId → Keep as **FromDomainId** (field-only, no rename needed)
2. FieldSin → **Sin** (cardinality-generic, payload: {float})
3. FieldCos → **Cos** (cardinality-generic, payload: {float})
4. FieldMod → **Mod** (cardinality-generic, payload: {float, int})
5. FieldPolarToCartesian → **PolarToCartesian** (cardinality-generic, payload: {vec2})
6. FieldCartesianToPolar → **CartesianToPolar** (cardinality-generic, payload: {vec2})
7. FieldPulse → **Pulse** (cardinality-generic, payload: {float})
8. FieldGoldenAngle → **GoldenAngle** (field-only, intrinsic-based)
9. FieldAngularOffset → **AngularOffset** (cardinality-generic, payload: {float})
10. FieldRadiusSqrt → **RadiusSqrt** (cardinality-generic, payload: {float})
11. FieldJitter2D → **Jitter2D** (cardinality-generic, payload: {vec2})
12. FieldHueFromPhase → **HueFromPhase** (cardinality-generic, payload: {float})
13. FieldSetZ → **SetZ** (cardinality-generic, payload: {vec3})

**Action for each block**:
1. Change `cardinalityMode` from `'fieldOnly'` to `'preserve'`
2. Add `payload` metadata with `allowedPayloads` and `semantics`
3. Update lowering to dispatch on payload type if needed
4. Update label/category if needed

**Acceptance Criteria**:
- [ ] All 13 remaining blocks have `cardinality: { cardinalityMode: 'preserve' }`
- [ ] All blocks with multiple payload support have `payload.allowedPayloads` defined
- [ ] All blocks have `payload.semantics` category (e.g., 'componentwise', 'reduction', 'transform')
- [ ] Lowering functions handle both Signal and Field cardinalities
- [ ] Tests pass for both Signal and Field inputs
- [ ] Type checking allows blocks to be used with Signal inputs

**Technical Notes**:
- Use `STANDARD_NUMERIC_PAYLOADS` for {float, int, vec2, vec3} blocks
- Use `{ float: true }` for float-only blocks
- Refer to `Add` block in `src/blocks/math-blocks.ts` as example pattern

### P2: Rename Blocks (HIGH confidence)

Remove "Field" prefix and update category as needed.

**Changes**:
- Type name: `FieldXxx` → `Xxx`
- Label: `Field Xxx` → `Xxx`
- Category: most stay `'field'` but may move to `'math'` or `'layout'` if cardinality-generic
- Update block description to indicate genericization

**Acceptance Criteria**:
- [ ] All 13 blocks renamed in definition (type, label)
- [ ] Categories updated (field-specific → 'field', generic → 'math'/'layout')
- [ ] Block descriptions mention cardinality and payload genericity
- [ ] No references to old "FieldXxx" names in code (except git history)

**Technical Notes**:
- Use `registerBlock()` with new type names
- Update any hardcoded block ID references

### P3: Update All References (HIGH confidence)

Find and update imports, tests, demos, and documentation.

**Files to check**:
- `src/blocks/registry.ts` - block list exports
- `src/blocks/*.test.ts` - all block tests
- `src/compiler/**/*.ts` - any hardcoded references
- Demo files (if they use field blocks)
- UI components that display block names
- Type definitions that reference block names

**Acceptance Criteria**:
- [ ] All test imports updated to new names
- [ ] All tests pass
- [ ] Demo blocks updated (if used)
- [ ] No `FieldXxx` references in source code (grep clean)
- [ ] UI labels match new names (check BlockLibrary, InspectorPanel)

### P4: Validation and Testing (HIGH confidence)

Ensure compiler specializes correctly and blocks work as generics.

**Test strategy**:
1. Unit tests per block for both Signal and Field
2. Type checking tests: verify `preserve` mode cardinality preservation
3. Payload specialization: Add signal-based test for each block
4. Integration: Run full build, verify no type errors

**Acceptance Criteria**:
- [ ] Each renamed block has test coverage for Signal + Field
- [ ] Each multi-payload block tested with {float, vec2, vec3}
- [ ] Type checking produces no errors
- [ ] Full build succeeds
- [ ] Existing demos still render correctly

**Test Files to Update**:
- `src/blocks/field-operations-blocks.test.ts`
- Consider: Unit tests for new cardinality-generic behavior

## Architecture Notes

### Pattern to Follow

Use `Add` block as reference:
```typescript
registerBlock({
  type: 'Sin',
  // ...
  cardinality: {
    cardinalityMode: 'preserve',  // Signal or Field, preserve cardinality
    laneCoupling: 'laneLocal',    // Per-lane semantics
    broadcastPolicy: 'allowZipSig', // Can mix with signals
  },
  payload: {
    allowedPayloads: {
      input: { float: true },
      out: { float: true },
    },
    semantics: 'componentwise',  // float → float is componentwise
  },
  // ...
});
```

### Migration Path

No backward compatibility needed — blocks are internal implementation detail. Users interact via UI block library, which will pick up new names automatically.

## Dependencies

- ✅ Cardinality-Generic system (fully implemented)
- ✅ Payload-Generic metadata pattern (Add block exists as example)
- ✅ Field kernels (already support all operations)
- ⚠️ Tests may need Signal evaluation kernels if adding multi-signal paths

## Risks

1. **Duplication risk** (MEDIUM, mitigated)
   - FieldAdd, FieldMultiply already have Add, Multiply signal equivalents
   - Action: Delete redundant blocks immediately
   - Mitigation: Grep for usage before deletion

2. **Kernel availability** (LOW, unlikely)
   - Field kernels already implemented for all operations
   - No new kernels needed
   - Action: Verify kernel names match lowering calls

3. **Existing patch usage** (MEDIUM, investigate)
   - Patches may encode block IDs that reference old Field* names
   - Action: Check if block IDs embedded in patches
   - Mitigation: Patch migration if needed

4. **Signal evaluation gaps** (LOW, investigate)
   - Some field-only blocks may lack signal equivalents
   - Action: Check SignalEvaluator for float-only ops
   - Mitigation: Add missing signal kernels if needed

## Confidence Justification

- **P0 (Deduplication)**: HIGH - Straightforward audit and deletion
- **P1 (Genericization)**: HIGH - Pattern established by Add block, mechanical changes
- **P2 (Renaming)**: HIGH - Simple find/replace, localized changes
- **P3 (References)**: HIGH - Grep-able, comprehensive but straightforward
- **P4 (Validation)**: HIGH - Standard test/build validation

No MEDIUM/LOW items remain after deduplication.

## Timeline Notes

- No time estimates provided
- Work is mechanical and straightforward
- Main time investment: testing and validation
