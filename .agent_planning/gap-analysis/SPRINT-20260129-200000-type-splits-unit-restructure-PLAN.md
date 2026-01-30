# Sprint: type-splits-unit-restructure — InferencePayloadType Split + UnitType Restructure
Generated: 2026-01-29T20:00:00Z
Confidence: HIGH: 1, MEDIUM: 2, LOW: 0
Status: PARTIALLY READY

## Sprint Goal
Split inference types from canonical types (PayloadType/CanonicalType) and restructure UnitType from 15 flat kinds to 8 structured kinds.

## Scope
**Deliverables:**
- InferencePayloadType / InferenceCanonicalType split (#16)
- UnitType restructured to 8 structured kinds (#18)
- deg/degrees duplication resolved (#19)

## Work Items

### P0-1: Split InferencePayloadType from PayloadType (#16 / Q2)
**Confidence**: MEDIUM
**Acceptance Criteria:**
- [ ] `InferencePayloadType` defined (includes `{ kind: 'var'; var: PayloadVarId }`)
- [ ] `PayloadType` is concrete-only (no var variant)
- [ ] `InferenceCanonicalType` defined: `{ payload: InferencePayloadType; unit: InferenceUnitType; extent: Extent }`
- [ ] Frontend/type solver uses inference forms
- [ ] Backend IR and stored types use `CanonicalType` only
- [ ] Compile-time error if `CanonicalType` contains payload var

**Technical Notes:**
- Per resolution Q2
- Depends on #6 (stride removal) and #7 (shape removal) being done first to avoid rework
- File: `src/core/canonical-types.ts` + new inference types module

#### Unknowns to Resolve
- Where do payload vars currently appear? Need to audit type solver for PayloadVarId usage.
- Should inference types live in `canonical-types.ts` or a separate `inference-types.ts`?

#### Exit Criteria
- Audit payload var usage in solver → HIGH confidence
- Decide file location → HIGH confidence

### P0-2: Restructure UnitType to 8 structured kinds (#18 / T05a-C-1)
**Confidence**: MEDIUM
**Acceptance Criteria:**
- [ ] UnitType has 8 structured kinds: `none | scalar | norm01 | count | angle{radians|degrees|phase01} | time{ms|seconds} | space{ndc|world|view,dims:2|3} | color{rgba01}`
- [ ] Constructors return structured objects (e.g., `unitRadians()` → `{ kind: 'angle', unit: 'radians' }`)
- [ ] `unitsEqual()` performs deep structural comparison
- [ ] `ALLOWED_UNITS` updated for structured kinds
- [ ] Adapter rules updated for structured unit matching
- [ ] All 57+ consumer files updated
- [ ] Full test suite passes (gap-analysis-scoped tests)

**Technical Notes:**
- File: `src/core/canonical-types.ts:44-76` (definition), `:91-148` (constructors/helpers)
- Consumer files: `src/graph/adapters.ts`, `src/ui/reactFlowEditor/typeValidation.ts`, `src/compiler/frontend/analyze-type-constraints.ts`, ~54 more
- This is a big-bang change — no incremental migration path
- Current: 15 flat kinds with simple `kind` equality
- Target: 8 structured kinds with nested sub-parameters

#### Unknowns to Resolve
- Full list of 57+ consumer files (need grep for UnitType, `.kind === '...'` on unit objects)
- Which adapter rules need structural matching changes?

#### Exit Criteria
- Complete grep audit of unit kind checks → HIGH confidence

### P0-3: Collapse deg/degrees (#19 / T05a-C-2)
**Confidence**: HIGH
**Acceptance Criteria:**
- [ ] No `'deg'` variant — only `'degrees'` (under angle group: `{ kind: 'angle', unit: 'degrees' }`)
- [ ] All `'deg'` usages migrated to `'degrees'`
- [ ] `grep -r "'deg'" src/` returns 0 results (for unit context)

**Technical Notes:**
- Part of #18 — resolve during UnitType restructure
- File: `src/core/canonical-types.ts:49-51`

## Dependencies
- Depends on Sprint 1: #6 (stride removal) and #7 (shape removal) must be done before #16
- #18 can be done in parallel with Sprint 2 (validation gate) but should come after Sprint 1
- Internal: #19 is part of #18

## Risks
- #18 (UnitType restructure) is the largest single item: 57+ files, big-bang change
- No incremental migration path — must update all consumers at once
- May require multiple compilation passes to chase down all type errors
