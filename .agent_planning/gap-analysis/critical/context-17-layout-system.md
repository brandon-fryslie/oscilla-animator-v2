---
topic: 17
name: Layout System
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md
category: critical
generated: 2026-01-23T12:00:00Z
purpose: implementer-context
self_sufficient: true
blocked_by: []
blocks: []
priority: P1
---

# Context: Topic 17 — Layout System (Critical)

## What the Spec Requires

1. normalizedIndex returns 0.5 for N=1 (not 0)
2. circleLayout phase in radians (or consistent with phase type decision)
3. circleLayout inputs clamped to valid range
4. Layout blocks are NOT cardinality-generic (lane-coupled)

## Current State (Topic-Level)

### How It Works Now
Layouts are field kernels in `src/runtime/FieldKernels.ts`. circleLayout takes normalizedIndex as field input and radius/phase as signal inputs. normalizedIndex is computed in `src/runtime/Materializer.ts` as `i / (N-1)` for N>1, else 0.

### Patterns to Follow
- Field kernels defined in FieldKernels.ts
- Intrinsics computed in Materializer.ts
- Tests in runtime/__tests__/field-kernel-contracts.test.ts

## Work Items

### WI-5: normalizedIndex N=1 fix

**Category**: CRITICAL
**Priority**: P1 — bug, single-line fix
**Spec requirement**: normalizedIndex returns 0.5 for single-element arrays

**Files involved**:
| File | Role | Lines |
|------|------|-------|
| src/runtime/Materializer.ts | normalizedIndex computation | L408 |

**Current state**: `arr[i] = N > 1 ? i / (N - 1) : 0;`
**Required state**: `arr[i] = N > 1 ? i / (N - 1) : 0.5;`
**Suggested approach**: Change `0` to `0.5`. Update any tests that assert `0` for N=1.

**Depends on**: none
**Blocks**: nothing

---

### WI-6: circleLayout phase semantics

**Category**: CRITICAL
**Priority**: P2 — depends on phase representation decision (R-5)
**Spec requirement**: circleLayout phase should be in radians for full rotation

**Files involved**:
| File | Role | Lines |
|------|------|-------|
| src/runtime/FieldKernels.ts | circleLayout kernel | L453-470 |

**Current state**: Phase treated as [0,1] for full rotation (multiplied by 2π internally)
**Required state**: Either keep as-is (if phase stays as phase01) or accept radians directly
**Suggested approach**: Wait for R-5 decision. If phase01 stays, this is correct and spec needs updating. If radians, remove internal 2π multiplication.

**Depends on**: R-5 decision
**Blocks**: nothing
