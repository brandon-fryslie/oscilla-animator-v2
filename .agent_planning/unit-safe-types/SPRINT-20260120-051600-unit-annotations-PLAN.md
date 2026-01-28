# Sprint: unit-annotations - Unit Annotation System

**Generated**: 2026-01-20T05:16:00
**Confidence**: MEDIUM
**Status**: RESEARCH REQUIRED

## Sprint Goal

Add optional unit annotations to CanonicalType, enabling compile-time detection of unit mismatches (phase vs radians, ms vs seconds, etc.).

## Known Elements

- CanonicalType has `payload` and `extent` fields
- Adding `unit?: NumericUnit` is additive and non-breaking
- Spec already defines phase arithmetic rules (phase + float = phase)

## Unknowns to Resolve

1. **Unit Taxonomy**: What units do we need?
   - Research approach: Audit all kernels/blocks for implicit unit assumptions
   - Candidates: `phase`, `radians`, `degrees`, `ms`, `seconds`, `normalized01`, `scalar`

2. **Validation Scope**: Where should validation happen?
   - Research approach: Review compilation pipeline for optimal insertion point
   - Options: Pass 2 (typing), Pass 4 (wiring), or new dedicated pass

3. **Auto-Conversion**: Should compiler auto-insert conversions?
   - Research approach: Analyze similar systems (GLSL, shader languages)
   - Options: Explicit-only vs auto-insert with warning

4. **Kernel Signature Format**: How to declare kernel expectations?
   - Research approach: Design minimal schema, review for extensibility

## Tentative Deliverables

- [ ] `NumericUnit` type definition in `canonical-types.ts`
- [ ] Updated `CanonicalType` with optional `unit` field
- [ ] Kernel signature declarations for sin/cos/etc.
- [ ] Compiler pass or validation for unit compatibility
- [ ] `phaseToRadians` / `radiansToPhase` conversion kernels

## Research Tasks

- [ ] Audit all kernels for implicit unit expectations (list in doc)
- [ ] Review spec section 03 (time system) for unit rules
- [ ] Decide validation insertion point in compiler
- [ ] Design kernel signature schema
- [ ] Evaluate auto-conversion approach (explicit vs implicit)

## Exit Criteria (to reach HIGH confidence)

- [ ] Complete unit taxonomy defined
- [ ] Validation insertion point chosen with rationale
- [ ] Kernel signature format finalized
- [ ] Auto-conversion decision made
- [ ] No remaining design questions
