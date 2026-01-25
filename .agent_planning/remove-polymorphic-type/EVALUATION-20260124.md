# Evaluation: Complete Polymorphic-to-Generic Migration

Generated: 2026-01-24
Verdict: **CONTINUE**

## Current State Assessment

### What Has Been Completed ✅

1. **`???` removed from PayloadType union** (`src/core/canonical-types.ts:150-158`)
   - PayloadType now only contains concrete types: float, int, vec2, vec3, color, bool, shape, cameraProjection
   - No polymorphic placeholder exists in the type system

2. **BlockPayloadMetadata infrastructure complete** (`src/blocks/registry.ts:170-177`)
   - `allowedPayloads: Record<string, readonly PayloadType[]>`
   - `combinations?: readonly PayloadCombination[]`
   - `semantics: PayloadSemantics` ('componentwise' | 'typeSpecific')
   - Query functions: `isPayloadGeneric()`, `isPayloadAllowed()`, `findPayloadCombination()`

3. **All payload-generic blocks migrated**:
   - `Const` (signal-blocks.ts) - uses `ALL_CONCRETE_PAYLOADS`
   - `FieldBroadcast` (field-blocks.ts) - uses `ALL_CONCRETE_PAYLOADS`
   - `Expression` (expression-blocks.ts) - uses `ALL_CONCRETE_PAYLOADS`
   - `Array` (array-blocks.ts) - uses `ALL_CONCRETE_PAYLOADS`
   - `GridLayout`, `LinearLayout`, `CircleLayout`, `PhyllotaxisLayout` (instance-blocks.ts) - use `ALL_CONCRETE_PAYLOADS`
   - `Add`, `Subtract`, `Multiply`, `Divide`, `Modulo` (math-blocks.ts) - use payload metadata

4. **Diagnostic codes implemented**:
   - `E_PAYLOAD_NOT_ALLOWED` - for invalid payload on port
   - `E_PAYLOAD_COMBINATION_NOT_ALLOWED` - for invalid input combinations
   - Tests exist: `src/diagnostics/__tests__/payload-diagnostics.test.ts`

5. **pass0-polymorphic-types refactored**:
   - No longer searches for `???` literal
   - Uses `isPayloadGeneric()` to identify blocks needing resolution
   - Uses `blockDef.payload.allowedPayloads` for validation
   - Stores resolved type in `block.params.payloadType`

### What Remains ⏳

1. **Rename pass0-polymorphic-types.ts**
   - File name still says "polymorphic" but implementation is payload-generic
   - Should be renamed to `pass0-payload-resolution.ts` or similar
   - Update all imports and comments

2. **Update comments/documentation**
   - Several files still reference "polymorphic" terminology:
     - `src/blocks/signal-blocks.ts:20` - "resolved by pass0-polymorphic-types"
     - `src/blocks/field-blocks.ts:19` - "resolved by pass0-polymorphic-types"
     - `src/graph/passes/index.ts:5` - "Pass 0: Polymorphic type resolution"

3. **Clean up dead code checks** (if any)
   - Verify no code paths still check for `???` literal

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Breaking existing patches | LOW | `???` already removed; no user-facing change |
| Terminology confusion | LOW | Renaming is documentation, not behavior |
| Missing edge cases | LOW | Comprehensive test coverage exists |

## Confidence Assessment

| Work Item | Confidence | Rationale |
|-----------|------------|-----------|
| File rename | HIGH | Simple refactor, no logic change |
| Comment updates | HIGH | Documentation only |
| Verification | HIGH | Run existing tests |

## Verdict: CONTINUE

**The migration is 95% complete.** The remaining work is:
1. Rename `pass0-polymorphic-types.ts` → `pass0-payload-resolution.ts`
2. Update all references and comments
3. Verify with test suite

This is a cleanup sprint, not a feature sprint.
