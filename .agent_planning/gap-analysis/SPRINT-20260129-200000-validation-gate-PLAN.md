# Sprint: validation-gate — Validation Gate Chain + Supporting P2 Work
Generated: 2026-01-29T20:00:00Z
Confidence: HIGH: 3, MEDIUM: 4, LOW: 0
Status: PARTIALLY READY

## Sprint Goal
Wire axis validation into the compile pipeline, handle deriveKind zero-cardinality, add structured diagnostics, and implement supporting unimplemented items (#21, #22).

## Scope
**Deliverables:**
- deriveKind handles zero-cardinality (#14)
- Axis validation wired into frontend pipeline (#15)
- Structured BindingMismatchError (#17)
- AxisInvalid diagnostic category (#20)
- Axis var escape check (#21)
- canonicalConst() constructor (#22)

## Work Items

### P0-1: deriveKind zero-cardinality handling (#14 / T03-C-1)
**Confidence**: HIGH
**Acceptance Criteria:**
- [ ] `DerivedKind` union includes `'const'` variant
- [ ] `deriveKind()` returns `'const'` for cardinality=zero
- [ ] All switch/if-else chains on DerivedKind handle `'const'` case
- [ ] Unit tests cover zero-cardinality input

**Technical Notes:**
- File: `src/core/canonical-types.ts:696-715`
- Currently zero falls through to `return 'signal'`
- Add check after discrete check: `if card.value.kind === 'zero' return 'const'`
- Must update all consumers of DerivedKind (search for `deriveKind(` and switch on result)

### P0-2: canonicalConst() constructor (#22 / T02-U-1)
**Confidence**: HIGH
**Acceptance Criteria:**
- [ ] `canonicalConst(payload: PayloadType, unit: UnitType): CanonicalType` exists
- [ ] Returns cardinality=zero, temporality=continuous, binding=unbound, perspective=default, branch=default
- [ ] Exported from `src/types/index.ts`
- [ ] Unit test covers basic usage

**Technical Notes:**
- Add to `src/core/canonical-types.ts` near other canonical constructors (~line 680)
- Follow same pattern as `canonicalSignal` but with `cardinalityValue('zero')`

### P0-3: Wire validateTypes into frontend pipeline (#15 / T04-C-1 + T01/T03/T04-C)
**Confidence**: MEDIUM
**Acceptance Criteria:**
- [ ] `validateTypes()` called after pass2TypeGraph in `compileFrontend()`
- [ ] All resolved CanonicalTypes from TypedPatch validated
- [ ] AxisViolation[] mapped to FrontendError[] with blockId/portId context
- [ ] `backendReady = false` if violations found
- [ ] Captured via `compilationInspector.capturePass()`
- [ ] Integration test: intentional violation produces compile error

**Technical Notes:**
- File: `src/compiler/frontend/index.ts:102-194`
- After Step 3 (Type Graph), add Step 3.5
- Collect types from TypedPatch port types
- Map violations using block/port provenance from TypedPatch

#### Unknowns to Resolve
- How exactly does TypedPatch expose resolved types? Need to read analyze-type-graph.ts output.
- What is the FrontendError format for axis violations?

#### Exit Criteria
- Read analyze-type-graph.ts output format → HIGH confidence

### P0-4: Axis var escape check (#21 / T03-U-2)
**Confidence**: MEDIUM
**Acceptance Criteria:**
- [ ] `validateNoVarAxes(types: CanonicalType[]): AxisViolation[]` added to axis-validate.ts
- [ ] Checks all 5 axes of each type for `kind: 'var'`
- [ ] Called as part of the validation gate (#15)
- [ ] Test: intentional var-axis leak is caught

**Technical Notes:**
- File: `src/compiler/frontend/axis-validate.ts`
- Use existing `isAxisVar()` helper from `src/core/canonical-types.ts:425-427`

### P0-5: Structured BindingMismatchError (#17 / Q9)
**Confidence**: MEDIUM
**Acceptance Criteria:**
- [ ] `BindingMismatchError` type defined: `{ left: BindingValue; right: BindingValue; location: ...; remedy: string }`
- [ ] Type solver catches binding mismatch throws and emits typed diagnostic entries
- [ ] Test: binding mismatch produces structured error with left/right values

**Technical Notes:**
- Per resolution Q9: replace generic throws with typed diagnostics
- Remedies: `'insert-state-op' | 'insert-continuity-op' | 'rewire'`

#### Unknowns to Resolve
- Where does the type solver currently throw on binding mismatch? Need to trace unifyAxis in type inference.

#### Exit Criteria
- Locate binding mismatch throw site → HIGH confidence

### P0-6: AxisInvalid diagnostic category (#20 / T04-C-3)
**Confidence**: MEDIUM
**Acceptance Criteria:**
- [ ] `AxisInvalid` diagnostic kind added to diagnostic system
- [ ] Includes source context: blockId, portId, expected CanonicalType, actual CanonicalType
- [ ] Axis violations from #15 produce AxisInvalid diagnostics
- [ ] Diagnostics reference CanonicalType only (no hidden types)

**Technical Notes:**
- Builds on #15 (validation gate wiring)
- Diagnostic system: `src/diagnostics/DiagnosticHub.ts`
- Per guardrail 15: diagnostics reference CanonicalType and existing IDs only

## Dependencies
- Depends on Sprint 1 (P1 fixes) — especially #9 (tryDeriveKind) and #12 (deriveKind asserts)
- Internal: #14 blocks #15; #15 blocks #17, #20, #21

## Risks
- Integration testing: wiring into pipeline may surface unexpected issues in type graph output format
- BindingMismatchError requires understanding current type solver error paths
