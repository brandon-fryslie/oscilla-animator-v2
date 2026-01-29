# Sprint: Value Representation Validation

Generated: 2026-01-25T16:56:28Z
Confidence: HIGH: 1, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION

## Sprint Goal

Add compile-time and authoring-time validation that Const block values match their resolved type representation.

## Scope

**Deliverable:**
- Validation rule in authoringValidators that checks Const block values match resolved type
- Error diagnostics shown in UI when validation fails

## Work Items

### P0: Add Value Representation Validator

**Location**: `src/diagnostics/validators/authoringValidators.ts`

**Requirements**:
1. Create validator function: `validateConstValueRepresentation(block: Block)`
2. Check: Does `block.params.value` match `block.params.payloadType`?
3. Validation rules by type:
   - **float**: Parseable as number, within reasonable range
   - **int**: Parseable as integer, no decimal component
   - **bool**: Must be `true` or `false` (or `0`/`1` with conversion)
   - **vec2**: Valid object with `{x: number, y: number}`
   - **color**: Valid RGB(A) with values 0-1 or 0-255 (or hex string)
   - **shape**: Valid shape descriptor object
   - **cameraProjection**: Valid projection object
4. On validation failure:
   - Generate diagnostic error with message like: "Const value '123' doesn't match expected type 'bool'"
   - Suggest fix if possible
5. Validation timing:
   - Run after payload resolution (pass0-payload-resolution.ts)
   - Also run on value edit (before serialization)

**Acceptance Criteria**:
- [ ] Validator added to authoringValidators
- [ ] All 7 payload types have validation rules
- [ ] Invalid float Const (e.g., "abc" for float) shows error
- [ ] Invalid int Const (e.g., "3.5" for int) shows error
- [ ] Invalid bool Const shows error
- [ ] Invalid vec2 Const (missing x or y) shows error
- [ ] Invalid color Const shows error
- [ ] Diagnostic displayed in graph editor (via existing error UI)
- [ ] No validation error for unresolved type (not yet compiled)
- [ ] Valid values pass validation silently

**Technical Notes**:
- Existing validation pattern in authoringValidators.ts shows how to create diagnostics
- Validator should be called from compiler pass after payload resolution
- UI error display happens automatically via diagnostic system
- Value format depends on how BlockInspector serializes it - check JSON format

**Integration Points**:
1. Register validator in authoring validator registry
2. Call after pass0-payload-resolution completes
3. Rerun when user edits value in BlockInspector

## Dependencies

- Sprint 1 (Editor Dispatch) should be completed first
- No other dependencies

## Risks

- **Type coercion ambiguity**: Should "3.0" for int type be accepted or rejected? Decision: Accept with automatic conversion.
- **Complex type validation**: shape and cameraProjection objects may have nested structures. Mitigation: Validate shape and sample cameraProjection values during implementation.

## Future Work

- Auto-fix suggestions (convert "3.0" to 3 for int type)
- Value clipping for out-of-range floats
