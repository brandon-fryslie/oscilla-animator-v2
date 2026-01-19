# INTRINSIC VALUES INTEGRATION - EVALUATION

**Generated**: 2026-01-19
**Verdict**: CONTINUE (no blockers, clear path forward)

## Executive Summary

The intrinsic values system is **partially implemented with type safety gaps** that currently require unsafe casts (`as any`) to function. The architecture conflates two distinct concepts:

1. **Old domain-based model** (FieldExprSource with `domain` + `sourceId`)
2. **New instance-based model** (FieldExprSource with `instanceId` + `intrinsic`)

This coexistence creates a type mismatch that breaks compile-time safety. A recent bug (positions showing [-10, 11] instead of [0, 1]) was caused by this: `fieldIntrinsic()` stored 'normalizedIndex' in `expr.intrinsic` but the materializer read `expr.sourceId` (hardcoded to 'index').

---

## 1. WHAT EXISTS: Current Implementation

### 1.1 IRBuilder Interface (Spec-Aligned)
**File**: `src/compiler/ir/IRBuilder.ts:66`

```typescript
fieldIntrinsic(instanceId: InstanceId, intrinsic: string, type: SignalType): FieldExprId;
```

- Clean, documented interface
- Properly typed with `InstanceId` and explicit `intrinsic` string parameter

### 1.2 IRBuilderImpl Implementation (Hacky)
**File**: `src/compiler/ir/IRBuilderImpl.ts:199-212`

```typescript
fieldIntrinsic(instanceId: InstanceId, intrinsic: string, type: SignalType): FieldExprId {
  const id = fieldExprId(this.fieldExprs.length);
  this.fieldExprs.push({
    kind: 'source',
    domain: domainId('deprecated'),    // PLACEHOLDER - misleading
    sourceId: 'index',                 // PLACEHOLDER - hardcoded BUG SOURCE
    instanceId: instanceId as any,     // UNSAFE CAST
    intrinsic: intrinsic as any,       // UNSAFE CAST
    type,
  } as any);                           // FORCE CAST THE ENTIRE OBJECT
  return id;
}
```

**Problems**:
- Reuses `FieldExprSource` variant instead of creating a new type
- Sets placeholder values for old-model fields (`domain='deprecated'`, `sourceId='index'`)
- Uses three levels of `as any` casts to bypass TypeScript
- The hardcoded `sourceId: 'index'` caused the bug we just fixed

### 1.3 FieldExprSource Type Definition
**File**: `src/compiler/ir/types.ts:148-156`

```typescript
export interface FieldExprSource {
  readonly kind: 'source';
  readonly domain: DomainId;
  readonly sourceId: 'pos0' | 'idRand' | 'index' | 'normalizedIndex';
  readonly type: SignalType;
  // NEW: Instance-based model (Sprint 2)
  readonly instanceId?: string; // InstanceId
  readonly intrinsic?: string;  // Intrinsic property name
}
```

**Problems**:
- Adds optional fields for new model to old model union type
- No mutual exclusivity enforcement
- Comments suggest this is temporary ("Sprint 2")

### 1.4 Materializer Runtime Workaround
**File**: `src/runtime/Materializer.ts:143`

```typescript
case 'source': {
  // Use intrinsic property if available (new-style), otherwise fall back to sourceId
  const sourceKey = (expr as any).intrinsic ?? expr.sourceId;
  fillBufferSource(sourceKey, buffer, instance);
  break;
}
```

This workaround fixes the bug but relies on runtime detection rather than compile-time safety.

### 1.5 Users of fieldIntrinsic
- `src/blocks/array-blocks.ts:78-79` - Uses for `index` and `normalizedIndex`
- `src/blocks/instance-blocks.ts:194-197` - Uses for `position`, `radius`, `index`, `normalizedIndex`
- `src/blocks/identity-blocks.ts:42-43, 81-82` - Uses for `randomId`, `normalizedIndex`, `index`
- `src/blocks/geometry-blocks.ts:99` - Uses for `normalizedIndex`
- `src/blocks/field-operations-blocks.ts:38` - Uses for `normalizedIndex`

---

## 2. WHAT'S BROKEN/HACKY

| Issue | Severity | Location | Impact |
|-------|----------|----------|--------|
| `as any` cast in `fieldIntrinsic()` | CRITICAL | IRBuilderImpl:210 | Bypasses type checking; hides errors |
| `as any` cast in Materializer | CRITICAL | Materializer:143 | Runtime behavior depends on untyped field access |
| Optional fields in `FieldExprSource` | HIGH | types.ts:154-155 | No mutual exclusivity enforcement |
| `sourceId: 'index'` hardcoded | HIGH | IRBuilderImpl:206 | Caused the bug we just fixed |
| Missing intrinsic implementations | MEDIUM | Materializer | `randomId`, `position`, `radius` not implemented |

---

## 3. WHAT NEEDS CHANGES

### 3.1 Type System Refactoring

Create two distinct types instead of mixing in one:

```typescript
// OLD model - domain-based (keep for legacy)
export interface FieldExprSourceLegacy {
  readonly kind: 'source';
  readonly domain: DomainId;
  readonly sourceId: 'pos0' | 'idRand' | 'index' | 'normalizedIndex';
  readonly type: SignalType;
}

// NEW model - instance-based intrinsics
export interface FieldExprIntrinsic {
  readonly kind: 'intrinsic';
  readonly instanceId: InstanceId;
  readonly intrinsic: IntrinsicPropertyName;
  readonly type: SignalType;
}

// Closed set of valid intrinsics (enables bounds checking)
export type IntrinsicPropertyName =
  | 'index'
  | 'normalizedIndex'
  | 'randomId'
  | 'position'
  | 'radius';

// Update the union
export type FieldExpr =
  | FieldExprConst
  | FieldExprSourceLegacy
  | FieldExprIntrinsic     // NEW
  | FieldExprBroadcast
  // ... rest
```

### 3.2 IRBuilder Implementation

```typescript
fieldIntrinsic(instanceId: InstanceId, intrinsic: IntrinsicPropertyName, type: SignalType): FieldExprId {
  const id = fieldExprId(this.fieldExprs.length);
  this.fieldExprs.push({
    kind: 'intrinsic',  // NEW KIND - no ambiguity
    instanceId,
    intrinsic,
    type,
  });
  return id;
}
```

### 3.3 Materializer Updates

```typescript
case 'intrinsic': {
  // Type-safe: expr is narrowed to FieldExprIntrinsic
  fillBufferIntrinsic(expr.intrinsic, buffer, instance);
  break;
}
```

With exhaustive switch on intrinsic names (bounds checking).

### 3.4 Documentation

Add `.claude/rules/compiler/intrinsics.md` documenting:
- What intrinsics are
- How to add new ones
- Type safety requirements

---

## 4. DEPENDENCIES AND RISKS

| File | Changes | Risk |
|------|---------|------|
| `src/compiler/ir/types.ts` | Add FieldExprIntrinsic type | MEDIUM |
| `src/compiler/ir/IRBuilderImpl.ts` | Implement properly | LOW |
| `src/runtime/Materializer.ts` | Add intrinsic case, implement handlers | MEDIUM |
| Block files | Update intrinsic parameter types | LOW |

---

## 5. AMBIGUITIES (RESOLVED)

### 5.1 Should intrinsic names be open or closed?
**Decision**: Closed enum (`IntrinsicPropertyName`). This enables:
- Compile-time bounds checking
- Exhaustive switch statements
- Clear documentation of what's supported

### 5.2 What about `position` and `radius`?
**Decision**: Keep as intrinsics for now. They're computed from instance layout during materialization.

---

## 6. VERIFICATION STORY

**Compilation checks**:
1. TypeScript compiles with no `as any` casts in intrinsic-related code
2. Invalid intrinsic names cause compile errors
3. Exhaustive switch in Materializer catches missing cases

**Runtime checks**:
1. Array block produces correct index/normalizedIndex values
2. All intrinsics materialize correctly
3. Console shows no errors

**Test coverage**:
1. Unit test for each intrinsic type
2. Type test for exhaustive intrinsic handling
