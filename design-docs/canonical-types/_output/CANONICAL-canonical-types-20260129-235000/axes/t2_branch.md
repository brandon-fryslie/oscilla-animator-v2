---
parent: ../INDEX.md
topic: axes
tier: 2
---

# Axes: Branch (Structural)

> **Tier 2**: Can change, but it's work. Affects many other things.

**Foundational Prerequisites**: [Axis Invariants](./t1_axis-invariants.md)

---

## Overview

Branch describes which history line / worldline a value belongs to. It makes preview, undo, prediction, and speculative execution safe by scoping state and caches.

## BranchValue (G1 Resolved)

### v0 (Current)

```typescript
type BranchValue = { kind: 'default' };
```

Only the default branch exists in v0. All values share one timeline.

### v1+ (Future — included in spec for completeness)

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

## Purpose

Branch isolation ensures:
- Preview changes don't corrupt main state
- Undo operates on its own timeline
- Predictions can be discarded without side effects
- Speculative execution is sandboxed

## Invariant I4 Connection

Per invariant I4, runtime storage is keyed by branch + instance lane identity. A value in `preview(A)` cannot read state from `main` unless an explicit branch-crossing operation is used.

---

## See Also

- [Perspective](./t2_perspective.md) - The other "deferred until v1+" axis
- [Axis Invariants](./t1_axis-invariants.md) - I4 (state scoping)
