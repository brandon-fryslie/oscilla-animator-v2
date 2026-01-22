# Evaluation: Payload-Generic Block System
Generated: 2026-01-22
Verdict: **CONTINUE**

## Topic
Implement Payload-Generic blocks per spec at `.agent_planning/_future/0-PayloadGeneriic-Block-Type-Spec.md`

## Current State

### What Exists

1. **Payload Type Definitions** ✅
   - `PayloadType = 'float' | 'int' | 'vec2' | 'color' | 'phase' | 'bool' | 'unit' | 'shape' | '???'`
   - Located in `src/core/canonical-types.ts`
   - Polymorphic placeholder `'???'` exists for type inference

2. **Block Port Type System** ✅
   - `InputDef` and `OutputDef` with `type: SignalType`
   - `SignalType = { payload: PayloadType, extent, unit? }`
   - All ports use unified type system

3. **Type Unification** ⚠️ PARTIAL
   - `unifyAxis()` and `unifyExtent()` for cardinality/temporal axes
   - No payload-specific unification (only exact match)
   - Pass0 propagates `'???'` to concrete types

4. **Diagnostics** ✅ BASIC
   - `E_TYPE_MISMATCH` code exists
   - Pass2 validates type compatibility
   - No payload-specific constraint errors

5. **Cardinality Metadata** ✅ (from previous work)
   - `BlockCardinalityMetadata` with cardinalityMode, laneCoupling, broadcastPolicy
   - All blocks annotated

### What's Missing (per spec)

| Spec Section | Status | Gap |
|--------------|--------|-----|
| §1 Closed admissible payload set | ❌ | No `allowedPayloads` per port |
| §1 Per-payload specialization | ❌ | Single `lower()` function, no dispatch |
| §1 No implicit coercions | ✅ | Already enforced (no auto-cast) |
| §2 Payload unification | ⚠️ | Exists for `'???'` but not validated against constraints |
| §2 Unit constraints | ❌ | Units exist but not validated per-block |
| §4 Emit specialized IR | ⚠️ | OpCodes exist but not selected by payload |
| §4 Slot formatting by payload | ⚠️ | Stride calculation exists but not enforced |
| §7 Diagnostics | ❌ | Missing: PAYLOAD_NOT_ALLOWED, PAYLOAD_COMBINATION_NOT_ALLOWED, UNIT_MISMATCH |
| §8 Registry metadata | ❌ | No payload support table, combination rules, semantics category |

## Dependencies
- Cardinality-generic system ✅ COMPLETED (tql epic)
- Block registry infrastructure ✅ EXISTS
- Type checking pass ✅ EXISTS (pass2-types.ts)

## Risks
1. **Breaking changes** - Adding payload constraints could break existing blocks that rely on `'???'`
2. **Performance** - Must maintain compile-time resolution, no runtime dispatch
3. **Complexity** - Multi-input combination tables could be verbose

## Architecture Alignment

The payload-generic system follows the same pattern as cardinality-generic:
1. Add metadata to `BlockDef` (payload constraints)
2. Add query functions to registry
3. Add validation in type checking pass
4. Add diagnostic codes
5. Annotate existing blocks

This is **orthogonal** to cardinality-generic as stated in the spec.

## Confidence Assessment

| Work Area | Confidence | Rationale |
|-----------|------------|-----------|
| Registry metadata types | HIGH | Pattern established by cardinality-generic |
| Diagnostic codes | HIGH | Same pattern as cardinality diagnostics |
| Block annotation | HIGH | Follow established pattern |
| Type validation | HIGH | Extend pass2-types.ts |
| Combination tables | MEDIUM | Schema design needed |

## Verdict: CONTINUE

All work is HIGH confidence. Proceed with sprint planning.
