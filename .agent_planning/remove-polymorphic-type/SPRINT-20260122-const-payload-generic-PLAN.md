# Sprint: const-payload-generic - Migrate Const to PayloadGeneric

Generated: 2026-01-22T11:25:00Z
Confidence: **HIGH**
Status: READY FOR IMPLEMENTATION

## Sprint Goal

Migrate Const block from `???` polymorphic type to the new PayloadGeneric metadata system.

## Scope

**Deliverables:**
1. Add payload metadata to Const block
2. Const uses concrete output type (not `???`)
3. Type inference still works via payload metadata

## Work Items

### P0: Add payload metadata to Const block

**Acceptance Criteria:**
- [ ] Const block has `payload` field with `allowedPayloads` for out port
- [ ] Allowed payloads: float, int, bool, phase, unit (scalar types only)
- [ ] Semantics: 'typeSpecific' (not componentwise - single value)
- [ ] Tests verify payload metadata is present

**Technical Notes:**
- Use `STANDARD_SCALAR_PAYLOADS` from registry.ts
- Const can't support vec2/color (require different value structure)

### P1: Update Const output type

**Acceptance Criteria:**
- [ ] Const output no longer uses `canonicalType('???')`
- [ ] Output type uses `canonicalType('float')` as default (most common)
- [ ] Type resolution uses payload metadata for validation
- [ ] Existing tests pass

**Technical Notes:**
- Default to 'float' - the type gets resolved by payloadType param at runtime
- The payloadType param drives actual lowering behavior

### P2: Clean up Const-specific ??? handling

**Acceptance Criteria:**
- [ ] Const block tests verify new payload-generic behavior
- [ ] Type validation respects Const's payload constraints
- [ ] No regression in existing patch compilation

## Dependencies

- PayloadGeneric block system (already implemented in previous sprint)

## Risks

- **Minimal**: Const already has type resolution via payloadType param
- The change is additive (metadata) not breaking (behavior)
