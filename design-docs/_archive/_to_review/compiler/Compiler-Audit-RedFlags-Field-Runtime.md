# Compiler Audit — Field Runtime Red Flags

This file audits the field runtime (FieldExpr, FieldHandle, Materializer) and its integration with the IR compiler. Items are ordered by severity.

## Critical

- **Field transform chains are defined but not implemented**
  - **Location:** `src/editor/runtime/field/Materializer.ts:1136`
  - **Detail:** `fillBufferTransform` throws `transform chain evaluation not implemented`.
  - **Impact:** Any field-level adapter/lens/transform in IR will crash at runtime.

- **Field expression input slots are not implemented**
  - **Location:** `src/editor/runtime/field/types.ts` includes `inputSlot` nodes; `FieldHandle.eval` does not handle `inputSlot`.
  - **Impact:** Field nodes that depend on slot inputs cannot be evaluated, blocking graph wiring that expects input slot resolution.

- **Field broadcast depends on signal evaluation fallback**
  - **Location:** `src/editor/runtime/field/Materializer.ts:90`
  - **Detail:** If `irEnv` is missing, `evalSig` falls back to `SignalBridge` or returns 0.
  - **Impact:** Field broadcast can silently produce 0s if signal evaluation is missing or not wired, masking failures.

## High

- **Field combine supports only numeric domains at runtime**
  - **Location:** `src/editor/runtime/field/Materializer.ts:1202`
  - **Detail:** `fillBufferCombine` throws unless `handle.type.kind === 'number'`.
  - **Impact:** Field buses for color/vec2/etc. cannot be materialized, even if compiler allows them.

- **Field reduce in compiler is still a placeholder**
  - **Location:** `src/editor/compiler/ir/IRBuilderImpl.ts:535`
  - **Detail:** `reduceFieldToSig` emits a map node with `src: 0` placeholder, ignoring the field input.
  - **Impact:** Reduce operations are disconnected from their input in IR mode.

- **Path field evaluation is const-only (unless extended)**
  - **Location:** `src/editor/runtime/executor/steps/executeMaterializePath.ts` (const/busCombine only)
  - **Detail:** Path field evaluation does not use materializer and rejects non-const field expressions (map/zip/transform).
  - **Impact:** Dynamic path fields cannot be materialized via IR runtime.

## Medium

- **FieldHandle cache uses `frameId` stamp but lacks eviction for deleted nodes**
  - **Location:** `src/editor/runtime/field/FieldHandle.ts:90`
  - **Detail:** Handles are cached by fieldId without invalidation beyond frameId; no explicit handling of changed field tables.
  - **Impact:** Potential stale handles after hot-swap if field IDs reorder.

- **Domain element IDs are optional and inconsistently propagated**
  - **Location:** `src/editor/runtime/field/Materializer.ts:282` and schedule initial slot values
  - **Detail:** `domainElements` is optional and derived from Domain handle, but not all domain creation paths provide IDs.
  - **Impact:** Domain-identity ops like `hash01ById` may fall back to index-based IDs, breaking stability.

