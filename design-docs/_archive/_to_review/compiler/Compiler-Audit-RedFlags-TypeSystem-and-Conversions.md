# Compiler Audit — Type System & Conversion Red Flags

This file audits type representation, conversion, adapters, and transform-chain wiring. Items are ordered by severity.

## Critical

- **Two different TypeDesc definitions are in use**
  - **Location:** `src/editor/compiler/ir/types.ts` vs `src/editor/ir/types/TypeDesc.ts`
  - **Detail:** The compiler IR defines its own `TypeDesc` (world: signal|field|scalar|event|special), while the editor/type system defines `TypeDesc` (world: signal|field|scalar|event|config) with category/busEligible.
  - **Impact:** Type comparisons and conversions can silently diverge between compiler and editor, causing mismatched behavior across passes and runtime.

- **Type conversion paths are unimplemented in IR passes**
  - **Location:** `src/editor/compiler/passes/pass2-types.ts:240`
  - **Detail:** `computeConversionPath()` only accepts exact type equality and returns `null` otherwise.
  - **Impact:** Any implicit conversion (signal→field, scalar→signal, adapters) is rejected in IR type graph even if the type system considers it compatible.

## High

- **Type compatibility logic exists but is not used by Pass 2**
  - **Location:** `src/editor/ir/types/TypeDesc.ts:206` vs `src/editor/compiler/passes/pass2-types.ts:240`
  - **Detail:** `isCompatible()` allows promotions and special cases, but Pass 2 ignores it and enforces strict equality.
  - **Impact:** Valid connections accepted elsewhere in the system are flagged as errors in IR compilation.

- **Transform chains are declared but not evaluated for fields**
  - **Location:** `src/editor/runtime/field/Materializer.ts:1136`
  - **Detail:** `fillBufferTransform` throws `transform chain evaluation not implemented`.
  - **Impact:** Any field-level adapters/lenses in IR will crash at runtime.

- **Adapters and lenses are compiled in legacy path only**
  - **Location:** `src/editor/compiler/compileBusAware.ts:624` and `src/editor/compiler/passes/pass7-bus-lowering.ts:177`
  - **Detail:** Legacy compile applies adapter/lens stacks; IR bus lowering explicitly skips them.
  - **Impact:** IR values will be untransformed, leading to wrong runtime results.

## Medium

- **`TypeDesc` parsing uses different domain vocabularies**
  - **Location:** `src/editor/compiler/passes/pass2-types.ts:76` vs `src/editor/ir/types/typeConversion.ts:1`
  - **Detail:** Pass 2 uses a custom `normalizeDomain` and local parser while `typeConversion.ts` has a canonical mapping table.
  - **Impact:** SlotType → TypeDesc conversions can diverge depending on which path is used.

- **Config vs special world mismatch**
  - **Location:** `src/editor/ir/types/typeConversion.ts:53` and `src/editor/compiler/passes/pass2-types.ts:93`
  - **Detail:** `typeConversion.ts` emits `world: 'config'` for Domain/Scene/Spec types, while Pass 2 treats these as `world: 'special'`.
  - **Impact:** World/category mismatches can lead to inconsistent bus eligibility and type checks.

