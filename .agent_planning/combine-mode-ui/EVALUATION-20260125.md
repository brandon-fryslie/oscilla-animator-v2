# Evaluation: Combine Mode UI

**Generated:** 2026-01-25
**Topic:** UI control for combine mode editing, persistence, and graph visualization
**Verdict:** PAUSE - Architectural decision needed

## Problem Statement

Users need to:
1. View and change combine mode for input ports in the Port Inspector
2. Have combine mode changes persisted in the patch
3. See visual indication in the graph editor when combine mode affects edge contribution

## Current State Analysis

### What Exists

1. **Type System** (`src/types/index.ts:150-182`):
   - `CombineMode` type defined: `'last' | 'first' | 'sum' | 'average' | 'max' | 'min' | 'mul' | 'layer' | 'or' | 'and'`
   - `COMBINE_MODE_CATEGORY` mapping for validation

2. **Validation** (`src/compiler/passes-v2/combine-utils.ts`):
   - `validateCombineMode()` function validates mode against world/payload
   - Domain-specific rules (color only allows last/first/layer, etc.)

3. **Port Inspector** (`src/ui/components/BlockInspector.tsx`):
   - `PortInspectorStandalone` shows port details
   - Editable default source already exists
   - NO combine mode display or editing

4. **Patch Model** (`src/graph/Patch.ts:60-65`):
   - `InputPort` interface has only `id` and `defaultSource`
   - **NO `combineMode` field** - this is the critical gap

5. **Spec References**:
   - `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/02-block-system.md:560-581`: Defines combine modes
   - `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/15-graph-editor-ui.md:136-140`: Specifies dimming for non-contributing inputs

### What's Missing

1. **Data Model Gap**: `InputPort` in Patch.ts doesn't have `combineMode`
2. **Store Method**: `PatchStore` needs `updateInputPort` to handle combineMode changes
3. **UI Control**: Port inspector needs combine mode dropdown
4. **Graph Visualization**: ReactFlow edges need dimming based on combine contribution

## Architectural Decision Required

### Question: Where should combineMode be stored?

**Option A: Per-InputPort in Patch (Recommended)**

Add `combineMode?: CombineMode` to `InputPort` interface in Patch.ts.

| Pros | Cons |
|------|------|
| Matches spec (per-port override) | Increases patch serialization size |
| Clean undo/redo via patch mutation | Need to handle undefined → default fallback |
| Consistent with `defaultSource` pattern | |

**Option B: Per-Edge**

Store combineMode on the Edge, allowing different edges to the same port to have different combine semantics.

| Pros | Cons |
|------|------|
| More granular control | Complicates combine logic significantly |
| | Spec says combine is per-port, not per-edge |
| | Confusing UX |

**Option C: Block-level params**

Store in block.params like other configuration.

| Pros | Cons |
|------|------|
| Simple, no type changes | Doesn't match port-specific nature |
| | Can't differ between ports of same block |

**Recommendation:** Option A - Per-InputPort, matching the existing `defaultSource` pattern.

## Scope Assessment

### Sprint 1: Data Model + Port Inspector (HIGH confidence)
- Add `combineMode` to InputPort type
- Add `updateInputPort` method to handle combineMode
- Add combine mode dropdown to PortInspectorStandalone
- Validation using existing `validateCombineMode()`

### Sprint 2: Graph Editor Visualization (MEDIUM confidence)
- Determine which edges are "non-contributing" based on combine mode
- Apply dimming/styling to ReactFlow edges
- Research: How to detect non-contributing edges at runtime?

## Dependencies

- Existing `validateCombineMode()` function
- Existing port inspector UI patterns
- PatchStore already has `updateInputPort()` method

## Risks

| Risk | Mitigation |
|------|------------|
| Combine mode affects compilation | Compiler already handles combineMode; just needs to read from port |
| Edge dimming computation complex | Start with simple cases (last mode = all but last dimmed) |
| Migration of existing patches | Default to undefined = 'last' (current behavior) |

## Verdict: PAUSE

Need user decision on Option A vs B vs C for combineMode storage before proceeding.
