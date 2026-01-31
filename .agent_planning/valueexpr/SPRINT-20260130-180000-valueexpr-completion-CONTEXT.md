# Implementation Context: Sprint valueexpr-completion

## Current State (commit 7a1c189)

### What's done
- ValueExpr canonical table defined (`src/compiler/ir/value-expr.ts`, 9 kinds)
- instanceId removed from FieldExpr TYPE DEFINITIONS (types.ts)
- instanceId removed from IRBuilder INTERFACE signatures
- canonicalConst() uses cardinalityZero()
- DerivedKind/deriveKind annotated @deprecated
- ConstValue discriminated union exists and validates
- Legacy→ValueExpr mapping documented

### What's broken
- **IRBuilderImpl** still emits `instanceId` into expression objects (excess properties)
  - `instanceId` at line 30 is the factory function from Indices.ts
  - Used in object literals: `{ kind: 'placement', instanceId, ... }` — puts the function reference
  - TypeScript doesn't catch because excess properties on object literals assigned to broader types
- **Instance name mismatch**: type carries "default", instance map has "instance_0"
- **5 pre-existing failures** from Binding/cardinality changes in earlier sprint

### TypeScript: 0 errors
### Tests: 25 failures (20 new from instanceId/instance mismatch, 5 pre-existing)

## Key Files

| File | Role | Lines of interest |
|------|------|-------------------|
| `src/compiler/ir/IRBuilderImpl.ts` | Builder impl | Lines 30 (instanceId import), 334-353 (fieldPlacement), 391-393 (fieldMap), 405-407 (fieldZip), 419-426 (fieldZipSig), 470-516 (inferFieldInstance/inferZipInstance), 529-530 (fieldCombine), 887-888 (fieldStateRead) |
| `src/compiler/ir/types.ts` | FieldExpr defs | instanceId ALREADY removed from all 6 variants |
| `src/compiler/ir/IRBuilder.ts` | Interface | instanceId ALREADY removed from signatures |
| `src/core/canonical-types.ts` | deriveKind | Lines ~744 (@deprecated deriveKind), ~600 (isSignalType etc) |
| `src/compiler/frontend/axis-validate.ts` | deriveKind consumer | 2 call sites |
| `src/compiler/ir/lowerTypes.ts` | deriveKind consumer | assertKindAgreement |
| `src/compiler/backend/lower-blocks.ts` | deriveKind consumer | 1 call site |
| `src/blocks/field-operations-blocks.ts` | deriveKind consumer | 1 call site |
| `src/runtime/ScheduleExecutor.ts` | Step dispatch | Already uses requireManyInstance for materialize step |
| `src/runtime/Materializer.ts` | Field materialization | instanceId passed as parameter from ScheduleExecutor |

## Instance Name Flow
1. Block lowering creates InstanceRef with instanceId (often "default")
2. IRBuilderImpl.declareInstance() generates "instance_0", "instance_1" etc
3. The CanonicalType on field expressions carries the InstanceRef from block lowering
4. requireManyInstance(expr.type) extracts that InstanceRef
5. Materializer looks up instance by name in instances map
6. MISMATCH: type says "default", map has "instance_0"

## deriveKind Replacement Pattern
```typescript
// isSignalType, isFieldType, isEventType already exist in canonical-types.ts
// They check extent axes directly — no deriveKind dependency
// Zero-cardinality: isSignalType returns false, isFieldType returns false, isEventType returns false
// Callers must explicitly handle zero-cardinality OR treat it as signal-like
```
