# Audit Report: Deprecated Code, Dual Paths, Unfinished Migrations, Legacy Fallbacks

**Date**: 2026-01-19
**Scope**: Full codebase scan for technical debt patterns
**Focus**: Deprecated code, dual code paths, unfinished migrations, legacy compatibility layers

---

## Executive Summary

| Category | Count | P0 | P1 | P2 | P3 |
|----------|-------|----|----|----|----|
| Deprecated APIs | 12 | 0 | 3 | 6 | 3 |
| Dual Code Paths | 3 | 0 | 2 | 1 | 0 |
| Unfinished Migrations | 5 | 0 | 2 | 3 | 0 |
| Legacy Fallbacks | 4 | 0 | 1 | 2 | 1 |
| Stub Test Files | 5 | 0 | 1 | 4 | 0 |
| **Total** | **29** | **0** | **9** | **16** | **4** |

**Overall Health**: ⚠️ Needs Attention
**Primary Risk**: Domain→Instance migration is incomplete, creating maintenance burden with parallel code paths

---

## Finding 1: Domain System → Instance System Migration (P1)

### Summary
The codebase is migrating from an old "Domain" system to a new "Instance" system. This migration is incomplete, leaving dual code paths.

### Evidence

**Deprecated types still in use:**
- `src/compiler/ir/Indices.ts:59-61` - `DomainId` type marked for Sprint 8 removal
- `src/compiler/ir/Indices.ts:133-136` - `domainId()` factory function deprecated

**Dual code paths in IRBuilder:**
```typescript
// src/compiler/ir/IRBuilderImpl.ts:188-199
/** @deprecated Use fieldIntrinsic() instead for instance-based fields. */
fieldSource(domain: DomainId, sourceId: ..., type: SignalType): FieldExprId

// vs.

// src/compiler/ir/IRBuilderImpl.ts:206-215
fieldIntrinsic(instanceId: InstanceId, intrinsic: IntrinsicPropertyName, type: SignalType): FieldExprId
```

**Legacy materializer path:**
```typescript
// src/runtime/Materializer.ts:141-144
case 'source': {
  // Fill from instance source (old system - kept for backward compatibility)
  fillBufferSource(expr.sourceId, buffer, instance);
}
```

**Tests using deprecated API:**
- `src/compiler/__tests__/instance-unification.test.ts` - 18 uses of deprecated `domainId()` and `fieldSource()`

### Impact
- **Maintenance burden**: Two parallel systems to understand and maintain
- **Confusion**: Developers may use wrong API
- **Test brittleness**: Tests depend on deprecated API

### Recommendation
Complete the domain→instance migration (Sprint 8 as noted in comments):
1. Migrate `instance-unification.test.ts` to use `fieldIntrinsic()`
2. Remove `fieldSource()`, `fieldIndex()`, `domainId()` after test migration
3. Remove `fillBufferSource()` from Materializer after verifying no IR uses it

---

## Finding 2: Legacy IR Types (P1)

### Summary
`src/compiler/ir/types.ts` is marked as legacy, with authoritative types in `program.ts`. The file is still widely imported.

### Evidence
```typescript
// src/compiler/ir/types.ts:11-13
/** @deprecated This file contains legacy IR types.
 * The authoritative IR schema is in ./program.ts (CompiledProgramIR).
 * This file will be removed once runtime migration is complete.
 */

// src/compiler/ir/types.ts:476-477
/** @deprecated Use CompiledProgramIR from ./program.ts instead.
 * This type will be removed once runtime migration is complete.
 */
export interface IRProgram { ... }
```

**Still actively used by:**
- `src/runtime/Materializer.ts` - imports `FieldExpr`, `SigExpr`, etc.
- `src/compiler/ir/IRBuilderImpl.ts` - imports types
- Multiple compiler passes

### Impact
- Two type hierarchies exist (`IRProgram` vs `CompiledProgramIR`)
- Unclear which to use for new code
- Runtime migration incomplete

### Recommendation
1. Create migration tracking issue
2. Determine if runtime is actually using legacy types
3. Complete migration to `CompiledProgramIR` or document why both exist

---

## Finding 3: DiagnosticsStore Legacy API (P2)

### Summary
`DiagnosticsStore` maintains dual API: new DiagnosticHub integration and legacy `addError`/`addWarning` methods.

### Evidence
```typescript
// src/stores/DiagnosticsStore.ts:11-13
// Migration Note:
// - Old API (addError, addWarning, log) is preserved for backwards compatibility
// - New API (getActive, getByRevision, filter) uses DiagnosticHub

// src/stores/DiagnosticsStore.ts:72-74
private _legacyErrors: LegacyDiagnostic[] = [];
private _legacyWarnings: LegacyDiagnostic[] = [];
```

**Key observation**: The legacy APIs (`addError`, `addWarning`) are **NOT used anywhere** in application code:
- No uses in `src/ui/`
- No uses in `src/compiler/`
- Only the definition and exports exist

### Impact
- Dead code adding maintenance burden
- False impression that legacy API is still needed

### Recommendation
Delete the unused legacy API since nothing calls it:
- Remove `LegacyDiagnostic` interface
- Remove `_legacyErrors`, `_legacyWarnings` arrays
- Remove `addError()`, `addWarning()`, `legacyErrors`, `legacyWarnings`
- Remove `clearDiagnostics()` (only clears legacy state)

---

## Finding 4: CompileError Legacy Fields (P2)

### Summary
`CompileError` interface maintains backward compatibility fields that duplicate newer fields.

### Evidence
```typescript
// src/compiler/types.ts:52-58
// Legacy fields for backward compatibility
/** @deprecated Use 'code' instead */
readonly kind?: string;
/** @deprecated Use 'where' instead */
readonly location?: CompileErrorWhere;
/** @deprecated No longer used */
readonly severity?: 'error' | 'warning' | 'info';
```

Also in factory function:
```typescript
// src/compiler/types.ts:70
return { code, message, where, details, kind: code };  // Sets both code AND kind
```

### Impact
- Type bloat
- Confusion about which field to use
- Extra assignment in factory function

### Recommendation
1. Search for any usage of `kind`, `location`, `severity` fields
2. If none found, remove deprecated fields
3. Update factory function to not set `kind`

---

## Finding 5: Stub E2E Test Files (P2)

### Summary
5 E2E test files exist containing only `test.skip()` stubs with TODO comments. All 32 tests are skipped placeholders.

### Evidence
| File | Skipped Tests |
|------|---------------|
| `tests/e2e/editor/editor-connection-operations.test.ts` | 6 |
| `tests/e2e/editor/editor-undo-redo.test.ts` | 8 |
| `tests/e2e/editor/editor-navigation.test.ts` | 6 |
| `tests/e2e/editor/editor-integration.test.ts` | 6 |
| `tests/e2e/editor/editor-block-operations.test.ts` | 6 (approx) |

Example stub:
```typescript
test.skip('D1.2: Signal<float> → Signal<float> connection accepted', async () => {
  // TODO: Implement E2E test for socket type validation
  expect(true).toBe(true); // Placeholder
});
```

### Impact
- False sense of test coverage
- CI runs empty tests
- TODOs not tracked in backlog

### Recommendation
Either:
1. **Delete files** - If tests aren't planned soon, remove placeholders
2. **Implement tests** - Convert to real E2E tests with Playwright
3. **Track in backlog** - Create bead issues for each test area

---

## Finding 6: Incomplete Feature Implementations (P2)

### Summary
Multiple TODO comments indicate incomplete implementations across the codebase.

### Evidence

**Runtime/Continuity (Sprint 3):**
```typescript
// src/runtime/ScheduleExecutor.ts:237
// TODO (Sprint 3): Implement domain change detection and mapping

// src/runtime/ScheduleExecutor.ts:244
// TODO (Sprint 3): Implement gauge/slew application

// src/runtime/ContinuityApply.ts:312
// TODO: Implement crossfade for unmappable cases (spec §3.7)
```

**Materializer incomplete layouts:**
```typescript
// src/runtime/Materializer.ts:466
// TODO: Implement other layouts (circular, linear, etc.)
```

**State management stubs:**
```typescript
// src/compiler/ir/IRBuilderImpl.ts:654
// TODO: Implement timepoint markers

// src/compiler/ir/IRBuilderImpl.ts:666-676
// TODO: Implement state declaration
// TODO: Implement state reading
// TODO: Implement state writing
```

**Diagnostic validators (commented out):**
```typescript
// src/diagnostics/validators/authoringValidators.ts:143
//   // TODO: Implement disconnected block detection

// src/diagnostics/validators/authoringValidators.ts:152
//   // TODO: Implement unused output detection
```

### Impact
- Features referenced in spec not implemented
- Continuity system partially functional
- State management incomplete

### Recommendation
1. Prioritize Sprint 3 items (continuity) if that sprint is active
2. Track incomplete features in beads/backlog
3. Consider removing commented-out code if not planned

---

## Finding 7: PortRef Legacy Alias (P3)

### Summary
`Patch.ts` exports a legacy type alias with comment indicating preference for newer type.

### Evidence
```typescript
// src/graph/Patch.ts:62
/**
 * Legacy PortRef - for backwards compatibility.
 */
```

```typescript
// src/graph/Patch.ts:18
/** Optional label for display (legacy - prefer displayName) */
```

### Impact
- Minor code clarity issue
- Type alias may mask the canonical type

### Recommendation
Low priority - check for usages and migrate if few exist.

---

## Finding 8: Diagnostic Config Migration Note (P3)

### Summary
Small TODO noting future migration.

### Evidence
```typescript
// src/diagnostics/config.ts:5
* TODO: Migrate to app-wide settings panel when available.
```

### Impact
Minimal - planning note.

### Recommendation
Track if settings panel work is planned; otherwise ignore.

---

## Prioritized Action Plan

### High Priority (P1) - Complete within next sprint

1. **Domain→Instance Migration**
   - [ ] Migrate `instance-unification.test.ts` to new API
   - [ ] Remove `fieldSource()`, `fieldIndex()`, `domainId()`
   - [ ] Remove `fillBufferSource()` from Materializer
   - [ ] Update any remaining imports

2. **Legacy IR Types Clarification**
   - [ ] Document relationship between `types.ts` and `program.ts`
   - [ ] Create migration plan or mark as intentional dual-type system

### Medium Priority (P2) - Plan for backlog

3. **Remove unused DiagnosticsStore legacy API**
   - [ ] Delete `LegacyDiagnostic` and related code

4. **Clean up CompileError**
   - [ ] Remove deprecated `kind`, `location`, `severity` fields

5. **E2E Test Decision**
   - [ ] Decide: implement, delete, or track stub tests

6. **Track incomplete features**
   - [ ] Create beads for Sprint 3 continuity items
   - [ ] Track state management TODOs

### Low Priority (P3) - Opportunistic cleanup

7. **Minor legacy aliases**
   - Clean up when touching related code

---

## Metrics Summary

```
═══════════════════════════════════════════════════════════════════
Code Quality Audit: Deprecated/Legacy/Migration
═══════════════════════════════════════════════════════════════════

Findings by Priority:
  P0 (Critical):  0
  P1 (High):      9  ← Primary focus
  P2 (Medium):   16
  P3 (Low):       4

Deprecated Markers Found: 12
  - @deprecated JSDoc annotations
  - "will be removed" comments
  - "kept for backward compatibility" notes

Dual Code Paths: 3 active systems
  - Domain vs Instance (IR builder)
  - IRProgram vs CompiledProgramIR (types)
  - Legacy vs New Diagnostics API (unused)

Stub/Placeholder Tests: 32 skipped tests in 5 files

Incomplete Implementations: ~15 TODO markers
  - Sprint 3 continuity items
  - State management
  - Layout implementations
═══════════════════════════════════════════════════════════════════
```
