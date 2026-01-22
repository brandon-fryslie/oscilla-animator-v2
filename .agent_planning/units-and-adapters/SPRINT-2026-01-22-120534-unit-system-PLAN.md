# Sprint: unit-system - Unit Type System Foundation
Generated: 2026-01-22-120534
Confidence: HIGH
Status: READY FOR IMPLEMENTATION
Source: EVALUATION-2026-01-22.md (from _future/_now directory) + Spec: 0-Units-and-Adapters.md

## Sprint Goal
Implement the Unit type system as a closed discriminated union alongside payload and extent in SignalType, replacing the current optional NumericUnit annotation with the spec-compliant Unit system.

## Scope

**Deliverables:**
- Replace NumericUnit with Unit discriminated union in canonical-types.ts
- Update SignalType to use Unit (not optional)
- Add unit validation rules per payload (A4 allowed combinations table)
- Update all helper functions to accept Unit parameters
- Migrate existing phase/unit payloads to float:phase01 and float:norm01

**Out of Scope:**
- Adapter registry and materialization (Sprint 2)
- Editor UI for adapters (Sprint 3)
- Auto-insertion logic (Sprint 3)

## Work Items

### P0: Define Unit Discriminated Union

**Dependencies**: None
**Spec Reference**: 0-Units-and-Adapters.md §A3 • **Status Reference**: Current codebase has NumericUnit as string union

#### Description
Replace the current string-based NumericUnit type with a proper discriminated union following the spec's closed set. This is the foundation for the entire unit system and must be implemented exactly as specified.

#### Acceptance Criteria
- [ ] Unit type defined as discriminated union with 14 variants (none, scalar, norm01, phase01, radians, degrees, ms, seconds, count, ndc2, ndc3, world2, world3, rgba01)
- [ ] Each Unit variant has `kind` discriminator and no additional fields (simple form)
- [ ] Helper constructors exported (unitNone(), unitScalar(), unitPhase01(), etc.)
- [ ] Type compiles with no errors
- [ ] All 14 unit kinds are representable

#### Technical Notes
The spec requires a closed union to prevent ad-hoc string additions. Unlike NumericUnit which was optional, Unit is ALWAYS present. Use the pattern: `{ readonly kind: 'phase01' }` for simple units without parameters.

---

### P0: Update SignalType to Require Unit

**Dependencies**: Define Unit Discriminated Union
**Spec Reference**: 0-Units-and-Adapters.md §A1 • **Status Reference**: canonical-types.ts line 352 (unit?: NumericUnit)

#### Description
Modify SignalType to have a mandatory `unit` field instead of the optional `unit?: NumericUnit`. Every SignalType must declare its unit - there is no implicit default.

#### Acceptance Criteria
- [ ] SignalType interface has `readonly unit: Unit` (not optional)
- [ ] signalType() helper requires unit parameter (no default)
- [ ] All derived helpers (signalTypeSignal, signalTypeField, etc.) require unit parameter
- [ ] TypeScript enforces unit presence at compile time
- [ ] No optional chaining needed to access .unit field

#### Technical Notes
This is a breaking change - every SignalType constructor call will need updating. The migration should happen in this sprint to avoid partial states. For types where unit is truly N/A (bool, shape), use unitNone().

---

### P0: Implement Payload-Unit Validation Table

**Dependencies**: Define Unit Discriminated Union
**Spec Reference**: 0-Units-and-Adapters.md §A4 • **Status Reference**: No current validation exists

#### Description
Create a validation function that enforces the allowed (payload, unit) combinations per the spec's table. This prevents invalid combinations like `float:rgba01` or `color:phase01`.

#### Acceptance Criteria
- [ ] Function `isValidPayloadUnitCombination(payload: PayloadType, unit: Unit): boolean` implemented
- [ ] Returns true for all 25 valid combinations in spec §A4
- [ ] Returns false for invalid combinations (e.g., float:ndc2, int:phase01)
- [ ] Test coverage for all payload types and at least 2 valid + 2 invalid units each
- [ ] Used by SignalType constructors to validate at creation time

#### Technical Notes
The validation table from spec:
- float: scalar, norm01, phase01, radians, degrees, ms, seconds
- int: count, ms
- vec2: ndc2, world2
- vec3: ndc3, world3
- color: rgba01
- bool: none
- shape: none

Throw descriptive error on invalid combination with suggestion for correct unit.

---

### P1: Migrate Existing Unit Usages

**Dependencies**: Update SignalType to Require Unit
**Spec Reference**: 0-Units-and-Adapters.md §A2 notes • **Status Reference**: UNIT-MIGRATION-GUIDE.md, canonical-types.ts

#### Description
Update all existing code that uses the old NumericUnit string annotations to use the new Unit discriminated union. Replace phase/unit payloads with float:phase01 and float:norm01.

#### Acceptance Criteria
- [ ] All PayloadType references to 'phase' replaced with 'float' + unitPhase01()
- [ ] All PayloadType references to 'unit' replaced with 'float' + unitNorm01()
- [ ] All block definitions updated to specify unit for numeric ports
- [ ] Time blocks updated (tMs uses unitMs(), phaseA/B use unitPhase01())
- [ ] Intrinsic properties updated (index uses unitCount(), normalizedIndex uses unitNorm01())
- [ ] No compilation errors after migration
- [ ] Existing tests pass (allow unit validation warnings for now)

#### Technical Notes
Key blocks to migrate:
- TimeRoot: tMs (int:ms), phaseA/B (float:phase01), dt (float:ms)
- Oscillator blocks: phase output (float:phase01)
- Trig blocks: input (float:phase01), output (float:scalar)
- Intrinsics: index (int:count), normalizedIndex (float:norm01), randomId (float:norm01)

This is a large surface area change but purely mechanical.

---

### P1: Update Helper Functions

**Dependencies**: Update SignalType to Require Unit
**Spec Reference**: 0-Units-and-Adapters.md §A1 • **Status Reference**: canonical-types.ts lines 571-628

#### Description
Update all SignalType construction helpers (signalTypeSignal, signalTypeField, etc.) to accept and pass through Unit parameters. Ensure type safety and ergonomics.

#### Acceptance Criteria
- [ ] signalTypeSignal(payload: PayloadType, unit: Unit): SignalType implemented
- [ ] signalTypeField(payload: PayloadType, instance: InstanceRef | string, unit: Unit): SignalType implemented
- [ ] signalTypeStatic(payload: PayloadType, unit: Unit): SignalType implemented
- [ ] signalTypeTrigger(payload: PayloadType, unit: Unit): SignalType implemented
- [ ] All helpers validate payload-unit combination via validation table
- [ ] Clear error messages when invalid combinations provided
- [ ] Helper usage documented with examples

#### Technical Notes
Ergonomics matter here - these helpers are used hundreds of times. Consider:
```typescript
signalTypeSignal('float', unitPhase01())
signalTypeField('vec2', instanceId, unitWorld2())
signalTypeStatic('bool', unitNone())
```

Validation should happen eagerly to catch errors at definition time.

---

### P2: Update Unit Comparison Logic

**Dependencies**: Define Unit Discriminated Union
**Spec Reference**: 0-Units-and-Adapters.md §A5 • **Status Reference**: No current unit comparison exists

#### Description
Implement deep equality comparison for Unit types to support type compatibility checking. Two ports are compatible only if their units are deep-equal (not just same kind).

#### Acceptance Criteria
- [ ] Function `unitsEqual(a: Unit, b: Unit): boolean` implemented
- [ ] Returns true for identical unit kinds (phase01 === phase01)
- [ ] Returns false for different kinds (phase01 !== radians)
- [ ] Used in type compatibility checks during compilation
- [ ] Test coverage for all unit kind combinations
- [ ] Handles readonly/const correctly

#### Technical Notes
Since all v2.5 units are simple (no parameters), deep equality is just kind comparison. Future units with parameters (e.g., { kind: 'custom', name: string }) would need structural comparison.

Integrate with existing unifyAxis() logic for extent unification.

---

### P2: Update Compiler Type Checking

**Dependencies**: Update SignalType to Require Unit, Update Unit Comparison Logic
**Spec Reference**: 0-Units-and-Adapters.md §A5 • **Status Reference**: Current compiler uses payload-only type checking

#### Description
Update compiler type compatibility checks to include unit validation. Connections are only valid if payload AND unit AND extent all match (or are adaptable).

#### Acceptance Criteria
- [ ] Compiler type checker validates unit equality on connections
- [ ] Mismatched units produce type error (not warning) when no adapter exists
- [ ] Error messages include both payload and unit in type descriptions (e.g., "float:phase01" not "float")
- [ ] Existing phase/unit tests updated to expect new error messages
- [ ] New tests for unit mismatch scenarios
- [ ] Compilation fails early on unit mismatches (no silent bugs)

#### Technical Notes
The compiler's type checking pass needs to call unitsEqual() in addition to payload and extent checks. This enforces "it won't run if it's wrong" - the goal of the unit system.

Current location: compiler/passes-v2/pass2-types.ts or similar.

---

### P3: Update Documentation and Migration Guide

**Dependencies**: All P0 and P1 items complete
**Spec Reference**: 0-Units-and-Adapters.md entire document • **Status Reference**: UNIT-MIGRATION-GUIDE.md

#### Description
Update UNIT-MIGRATION-GUIDE.md to reflect the new Unit discriminated union system and provide clear migration examples for the breaking changes.

#### Acceptance Criteria
- [ ] Migration guide updated with Unit discriminated union examples
- [ ] Examples show before/after for common patterns (oscillator, time, intrinsics)
- [ ] Table of all 14 unit kinds with descriptions and use cases
- [ ] Payload-unit validation table documented
- [ ] Common errors section with fixes (e.g., "Cannot use phase01 with vec2")
- [ ] Link to spec document for full details

#### Technical Notes
This is developer-facing documentation. Focus on practical migration patterns and clear explanations of why the change improves type safety.

---

## Dependencies

```
P0: Define Unit Discriminated Union
  └─> P0: Update SignalType to Require Unit
      └─> P1: Migrate Existing Unit Usages
      └─> P1: Update Helper Functions
  └─> P0: Implement Payload-Unit Validation Table
  └─> P2: Update Unit Comparison Logic
      └─> P2: Update Compiler Type Checking

P3: Update Documentation (depends on all P0-P2)
```

## Risks

1. **Large Surface Area Migration**: Touching every block definition is risky
   - Mitigation: Use TypeScript compiler to find all breakages systematically
   - Mitigation: Run tests after each block category migration (signal, field, time, etc.)

2. **Breaking Existing Patches**: User patches with old phase/unit payloads
   - Mitigation: This sprint doesn't touch serialization - that's a separate concern
   - Mitigation: Document breaking changes clearly

3. **Adapter Dependency**: Some connections will break without adapters
   - Mitigation: This is expected and intentional - Sprint 2 adds adapters
   - Mitigation: Clear error messages guide users to wait for adapter sprint

## Success Criteria

- [ ] All types use Unit discriminated union (no NumericUnit strings)
- [ ] SignalType.unit is mandatory and validated
- [ ] Payload-unit validation enforced at SignalType creation
- [ ] Compiler rejects unit-mismatched connections
- [ ] Tests pass (815+ tests, allowing for new unit validation)
- [ ] No phase/unit PayloadTypes remain in codebase
- [ ] Migration guide updated and accurate
