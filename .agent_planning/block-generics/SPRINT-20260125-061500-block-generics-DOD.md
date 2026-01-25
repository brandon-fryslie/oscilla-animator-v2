# Definition of Done: Block Generics Sprint

**Sprint**: block-generics - Payload and Cardinality Generic Blocks
**Generated**: 2026-01-25 06:15
**Target**: oscilla-animator-v2-tv3 (beads issue)

## Acceptance Criteria Checklist

### P0: Audit and Deduplication

- [ ] Grep confirms `Add` block exists and is cardinality-generic (cardinalityMode: 'preserve')
- [ ] Grep confirms `Multiply` block exists and is cardinality-generic
- [ ] `FieldAdd` block definition deleted from `src/blocks/field-operations-blocks.ts`
- [ ] `FieldMultiply` block definition deleted
- [ ] `FieldScale` block definition deleted
- [ ] All tests updated/removed for deleted blocks
- [ ] No compile errors after deletion
- [ ] Grep confirms no remaining references to `FieldAdd`, `FieldMultiply`, `FieldScale` in source code

### P1: Genericize Remaining 13 Blocks

**For each block**: FieldSin, FieldCos, FieldMod, FieldPolarToCartesian, FieldCartesianToPolar, FieldPulse, FieldGoldenAngle, FieldAngularOffset, FieldRadiusSqrt, FieldJitter2D, FieldHueFromPhase, FieldSetZ, FieldFromDomainId

- [ ] `cardinalityMode` changed from `'fieldOnly'` to `'preserve'` (13 blocks)
  - [ ] Exception: FieldFromDomainId, FieldGoldenAngle may remain 'fieldOnly' if field-only by design
- [ ] `payload.allowedPayloads` defined for each block
- [ ] `payload.semantics` category assigned (componentwise, reduction, transform, etc.)
- [ ] Lowering functions handle both Signal and Field cardinalities
- [ ] No hardcoded field-only assumptions in lowering code
- [ ] Signal kernel calls use appropriate target (SignalEvaluator or FieldKernels as needed)

### P2: Rename Blocks

- [ ] All 13 blocks renamed: `FieldXxx` → `Xxx` (type, label)
- [ ] Block categories updated (move cardinality-generic blocks to 'math' or 'layout')
- [ ] Block descriptions updated to indicate cardinality/payload genericity
- [ ] Registry exports updated if relevant
- [ ] No references to old `FieldXxx` names in code (except git history)

### P3: Update All References

- [ ] All test imports updated to new block names
- [ ] All field operation block tests pass
- [ ] All other block tests pass (no cross-test references broken)
- [ ] Demo files checked and updated if they used removed/renamed blocks
- [ ] UI components (BlockLibrary, InspectorPanel) show new names
- [ ] Type definitions updated if they reference old block names
- [ ] Grep confirms clean: `grep -r "FieldXxx" src/` returns only git history

### P4: Validation and Testing

- [ ] Full `npm run build` succeeds with no errors or warnings
- [ ] Full `npm run typecheck` succeeds
- [ ] `npm run test` all tests pass
- [ ] At least one test for each renamed block using Signal input
- [ ] At least one test for each renamed block using Field input
- [ ] Multi-payload blocks tested with {float, vec2, vec3} as appropriate
- [ ] Type checking in compiler correctly preserves cardinality (Signal→Signal, Field→Field)
- [ ] Existing demos still render without errors

## Integration Requirements

### Beads Integration
- [ ] Update oscilla-animator-v2-tv3 issue status to "completed"
- [ ] Summary: All 16 field blocks genericized, 3 redundant blocks removed, 13 renamed

### Roadmap Update
- [ ] If applicable, update `.agent_planning/ROADMAP.md` to reflect completion

## Definition of Done: Summary

**SUCCESS CRITERIA**:
1. All 3 redundant field-only blocks removed
2. All 13 remaining blocks made payload and/or cardinality generic
3. All blocks renamed to remove "Field" prefix
4. All references updated
5. Full build and tests pass
6. No `FieldXxx` references remain in source code

**FAILURE CRITERIA**:
- Any build or test failure
- Any `FieldXxx` reference remaining in source
- Existing demos broken
- Cardinality not preserved in tests

---

## Testing Checklist

### Unit Tests Per Block
- [ ] Sin: Signal(float→float), Field(float→float)
- [ ] Cos: Signal(float→float), Field(float→float)
- [ ] Mod: Signal(float→float), Field(float→float)
- [ ] PolarToCartesian: Signal(vec2→vec2), Field(vec2→vec2)
- [ ] CartesianToPolar: Signal(vec2→vec2), Field(vec2→vec2)
- [ ] Pulse: Signal(float→float), Field(float→float)
- [ ] AngularOffset: Signal(float→float), Field(float→float)
- [ ] RadiusSqrt: Signal(float→float), Field(float→float)
- [ ] Jitter2D: Signal(vec2→vec2), Field(vec2→vec2)
- [ ] HueFromPhase: Signal(float→float), Field(float→float)
- [ ] SetZ: Signal(vec3→vec3), Field(vec3→vec3)

### Integration Tests
- [ ] Graph compilation accepts genericized blocks in both Signal and Field positions
- [ ] Type checking produces correct errors for payload mismatches
- [ ] Full patch compilation and runtime execution works

### Regression Tests
- [ ] All existing block tests pass
- [ ] All compiler tests pass
- [ ] All runtime tests pass
- [ ] Demos load and render correctly
