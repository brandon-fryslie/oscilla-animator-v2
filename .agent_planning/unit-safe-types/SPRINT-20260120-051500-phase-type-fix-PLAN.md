# Sprint: phase-type-fix - Consistent Phase Type Usage

**Generated**: 2026-01-20T05:15:00
**Confidence**: HIGH
**Status**: READY FOR IMPLEMENTATION

## Sprint Goal

Fix all blocks and kernels to consistently use `phase` PayloadType where values are in [0,1) range, enabling future compile-time validation.

## Scope

**Deliverables:**
1. Fix TimeRoot outputs to use `canonicalType('phase')` instead of `canonicalType('float')`
2. Fix Oscillator input to expect `canonicalType('phase')`
3. Fix field block phase inputs to use correct type
4. Ensure kernel behavior matches declared types

## Work Items

### P0: Fix TimeRoot Block Type Declarations

**Files**: `src/blocks/time-blocks.ts`

**Acceptance Criteria:**
- [ ] `phaseA` output declared with `canonicalType('phase')`
- [ ] `phaseB` output declared with `canonicalType('phase')`
- [ ] `tMs` output remains `canonicalType('float')` (milliseconds, not phase)
- [ ] Tests pass after change

**Technical Notes:**
- This is the source of truth for phase signals
- Change is purely type annotation, no runtime behavior change

### P1: Fix Oscillator Block Type Declaration

**Files**: `src/blocks/signal-blocks.ts`

**Acceptance Criteria:**
- [ ] Oscillator `phase` input declared with `canonicalType('phase')`
- [ ] Block still compiles and executes correctly
- [ ] Waveform kernels (sin, cos, triangle, etc.) document expected input type in comments

**Technical Notes:**
- The SignalEvaluator already handles phase→radians conversion for sin/cos
- This change makes the expectation explicit in the type system

### P2: Fix Field Block Phase Inputs

**Files**: `src/blocks/field-operations-blocks.ts`, `src/blocks/field-blocks.ts`

**Acceptance Criteria:**
- [ ] All field blocks with `phase` inputs use `canonicalType('phase')`
- [ ] Blocks: FieldAngularOffset, FieldHueFromPhase, FieldPulse (and any others)
- [ ] Comments document expected ranges

**Technical Notes:**
- Search for `'phase'` in block input labels and fix corresponding types

### P3: Audit OpcodeInterpreter sin/cos

**Files**: `src/runtime/OpcodeInterpreter.ts`

**Acceptance Criteria:**
- [ ] Document that opcode-level `sin`/`cos` expect RADIANS (not phase)
- [ ] Add comment explaining the difference from SignalEvaluator kernels
- [ ] Consider renaming to `sinRad`/`cosRad` or adding `sinPhase`/`cosPhase` variants

**Technical Notes:**
- OpcodeInterpreter is used for field-level math where angles may already be in radians
- SignalEvaluator kernels expect phase (0-1) for oscillator use case
- Both are valid, but they serve different purposes

## Dependencies

- None

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Existing wiring breaks | Low | Low | Type change is annotation-only, no runtime effect |
| Tests depend on wrong types | Low | Low | Fix tests to match correct types |
