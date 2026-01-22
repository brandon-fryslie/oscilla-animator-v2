# Definition of Done: unit-system
Generated: 2026-01-22-120534
Confidence: HIGH
Plan: SPRINT-2026-01-22-120534-unit-system-PLAN.md

## Acceptance Criteria

### Unit Type System Foundation

#### Unit Discriminated Union
- [ ] Unit type is discriminated union with exactly 14 kinds from spec
- [ ] Each unit has form `{ readonly kind: 'unitName' }` with no extra fields
- [ ] Helper constructors exist: unitNone(), unitScalar(), unitNorm01(), unitPhase01(), unitRadians(), unitDegrees(), unitMs(), unitSeconds(), unitCount(), unitNdc2(), unitNdc3(), unitWorld2(), unitWorld3(), unitRgba01()
- [ ] Type exports from canonical-types.ts
- [ ] TypeScript compilation succeeds with strict mode

#### SignalType Unit Field
- [ ] SignalType has `readonly unit: Unit` (mandatory, not optional)
- [ ] signalType() constructor requires unit parameter
- [ ] All signalType*() helpers require unit parameter
- [ ] No optional chaining needed (`type.unit.kind` not `type.unit?.kind`)
- [ ] Breaking change applied consistently across codebase

#### Payload-Unit Validation
- [ ] Function isValidPayloadUnitCombination(payload, unit) exists
- [ ] Validates all 25 allowed combinations from spec §A4 table
- [ ] Rejects invalid combinations (e.g., float:rgba01, color:phase01)
- [ ] Called in signalType() and helper constructors
- [ ] Throws clear error: "Invalid combination: [payload]:[unit]. [payload] allows: [list]"
- [ ] Test coverage: 7 payload types × (2 valid + 2 invalid) = 28+ test cases

#### Migration Complete
- [ ] Zero references to PayloadType 'phase' remain (replaced with float:phase01)
- [ ] Zero references to PayloadType 'unit' remain (replaced with float:norm01)
- [ ] All time blocks use correct units: tMs (int:ms), phaseA/B (float:phase01), dt (float:ms)
- [ ] All oscillator blocks output float:phase01
- [ ] All trig blocks input float:phase01, output float:scalar
- [ ] All intrinsics use correct units: index (int:count), normalizedIndex (float:norm01), randomId (float:norm01)
- [ ] No compilation errors related to missing/wrong units

#### Helper Functions Updated
- [ ] signalTypeSignal(payload, unit) validates and constructs correctly
- [ ] signalTypeField(payload, instance, unit) validates and constructs correctly
- [ ] signalTypeStatic(payload, unit) validates and constructs correctly
- [ ] signalTypeTrigger(payload, unit) validates and constructs correctly
- [ ] signalTypePerLaneEvent(payload, instance, unit) validates and constructs correctly
- [ ] All helpers throw on invalid payload-unit combinations
- [ ] Examples in canonical-types.ts updated

#### Unit Comparison
- [ ] unitsEqual(a: Unit, b: Unit): boolean implemented
- [ ] Returns true when a.kind === b.kind
- [ ] Returns false otherwise
- [ ] Handles readonly types correctly
- [ ] Used in type compatibility logic
- [ ] Test coverage for same-kind and different-kind comparisons

#### Compiler Integration
- [ ] Compiler type checker calls unitsEqual() during edge validation
- [ ] Type mismatch errors include unit in message: "Cannot connect float:phase01 to float:radians"
- [ ] Connections with matching (payload, unit, extent) succeed
- [ ] Connections with mismatched units fail compilation
- [ ] Error location points to specific edge/port
- [ ] New test cases for unit mismatch scenarios

#### Documentation
- [ ] UNIT-MIGRATION-GUIDE.md updated with Unit discriminated union
- [ ] Table of 14 unit kinds with descriptions and use cases
- [ ] Payload-unit validation table (§A4) documented
- [ ] Before/after migration examples for: oscillators, time blocks, intrinsics
- [ ] Common errors section with solutions
- [ ] Link to spec document included

## Exit Criteria (to reach next confidence level)

N/A - This is a HIGH confidence sprint, ready for implementation.

## Verification Commands

```bash
# Type check entire codebase
npm run typecheck

# Run existing test suite
npm test

# Verify no 'phase' or 'unit' PayloadType references remain
grep -r "payload.*'phase'" src/blocks/ src/core/ src/compiler/
grep -r "payload.*'unit'" src/blocks/ src/core/ src/compiler/

# Verify Unit type usage
grep -r "unit:" src/core/canonical-types.ts

# Check helper function signatures
grep -A 2 "signalTypeSignal\|signalTypeField" src/core/canonical-types.ts
```

## Definition of Complete

This sprint is complete when:
1. All acceptance criteria checkboxes are checked
2. TypeScript compilation succeeds with zero errors
3. All existing tests pass (815+ tests)
4. Zero references to 'phase' or 'unit' as PayloadType exist
5. Verification commands pass
6. Code review confirms spec compliance with §A1-A5
