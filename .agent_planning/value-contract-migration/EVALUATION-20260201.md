# Evaluation: ValueContract Migration
Generated: 2026-02-01

## Verdict: CONTINUE (with PAUSE on design questions)

## Summary

Migrate range guarantees out of `UnitType` and into a new `ValueContract` axis on `CanonicalType`. This separates *what a value measures* (unit: scalar, angle, time, space, color) from *what range guarantee it provides* (contract: clamp01, wrap01, clamp11).

### Current State
- `UnitType` has `norm01` (range [0,1]) — this is a range guarantee, not a unit
- `UnitType` has angle `phase01` — mixes unit (angle in turns) with range guarantee (wraps at 1.0)
- Sprint 1 of normalized-units just corrected 18 port annotations to use these
- ChatGPT recommended adding `ValueContract` as a separate concept

### Target State
- `norm01` removed from UnitType → replaced by `unit: scalar` + `contract: clamp01`
- `phase01` renamed to `turns` in angle unit → contract: `wrap01` added separately
- New `ValueContract` type with 4 initial kinds: `none`, `clamp01`, `wrap01`, `clamp11`
- `CanonicalType` gains optional `contract?: ValueContract` field

### Scope (from exploration)
- **Core types**: 3 files (units.ts, canonical-type.ts, equality.ts)
- **Payload validation**: 1 file (payloads.ts)
- **Inference types**: 1 file (inference-types.ts)
- **Adapter blocks**: 6 files (all adapters referencing norm01/phase01)
- **Block definitions**: ~30 files using unitNorm01()/unitPhase01()
- **UI components**: ~6 files with switch/case on norm01/phase01
- **Tests**: ~12 files
- **Adapter-spec**: type pattern matching needs contract-awareness

### Design Questions (PAUSE items)
1. Should `contract` be on `CanonicalType` directly or on ports only?
2. Should adapter auto-insertion match on contract (e.g., auto-insert Clamp01 when contract mismatch)?
3. Should type inference propagate contracts through edges?
4. What's the compatibility rule? (strong→weak OK, weak→strong needs adapter?)

### Prior Art in Codebase
- `CanonicalType = { payload, unit, extent }` — adding `contract` is a 4th axis
- `typesEqual()` already does deep structural comparison — needs contract case
- Adapter-spec TypePattern already matches on payload/unit/extent — needs contract field
- Object spreads `{ ...type }` in `withInstance()` etc. will preserve `contract` automatically

## Risk Assessment
- **High risk**: Adapter pattern matching must handle contract correctly or type mismatches silently pass
- **Medium risk**: Many mechanical changes across ~50 files — risk of missing a reference
- **Low risk**: Core type change is additive (optional field) — existing code compiles unchanged
