# Core Type System - Unimplemented Features

These are spec requirements that are not yet implemented but are explicitly deferred to v1+.

## 1. Perspective axis - world/view/screen values

**Spec requirement**:
```typescript
type PerspectiveValue =
  | { kind: 'default' }
  | { kind: 'world' }
  | { kind: 'view'; viewId: ViewId }
  | { kind: 'screen'; screenId: ScreenId };
```

**Current state**:
- src/core/canonical-types.ts:653-655
```typescript
export type PerspectiveValue =
  | { readonly kind: 'default' }
  | { readonly kind: 'specific'; readonly instance: InstanceRef };
```

**Classification rationale**: The spec explicitly states this is v0 vs v1+ difference. v0 only has `default`, v1+ adds world/view/screen. The implementation uses a generic `specific` variant with InstanceRef, which is a different pattern but also deferred.

Per design-docs/canonical-types/_output/CANONICAL-canonical-types-20260129-235000/axes/t2_perspective.md:
> "Only the default perspective exists in v0. All spatial values share one implicit coordinate frame."
> "These are included in the canonical spec to establish the axis's intended domain, even though v0 only uses default."

**Impact**: None for v0. This is future work.

**Recommendation**: Document that v0 uses simplified perspective axis. v1+ will implement full world/view/screen semantics per spec.

---

## 2. Branch axis - main/preview/checkpoint/undo values

**Spec requirement**:
```typescript
type BranchValue =
  | { kind: 'default' }
  | { kind: 'main' }
  | { kind: 'preview'; previewId: PreviewId }
  | { kind: 'checkpoint'; checkpointId: CheckpointId }
  | { kind: 'undo'; undoId: UndoId }
  | { kind: 'prediction'; predictionId: PredictionId }
  | { kind: 'speculative'; speculativeId: SpeculativeId }
  | { kind: 'replay'; replayId: ReplayId };
```

**Current state**:
- src/core/canonical-types.ts:664-666
```typescript
export type BranchValue =
  | { readonly kind: 'default' }
  | { readonly kind: 'specific'; readonly instance: InstanceRef };
```

**Classification rationale**: Same as perspective - spec explicitly defers this to v1+.

Per design-docs/canonical-types/_output/CANONICAL-canonical-types-20260129-235000/axes/t2_branch.md:
> "Only the default branch exists in v0. All values share one timeline."

**Impact**: None for v0. This is future work.

**Recommendation**: Document that v0 uses simplified branch axis. v1+ will implement full main/preview/undo/etc semantics per spec.

---

## Summary

Both unimplemented features (full perspective and branch axes) are explicitly scoped as v1+ work. The v0 implementation correctly uses simplified default-only versions. This is intentional deferral, not a gap.
