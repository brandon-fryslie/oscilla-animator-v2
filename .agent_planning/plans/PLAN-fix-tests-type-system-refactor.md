# Plan: Fix Failing Tests After Type System Refactor

**Sprint alignment**: `SPRINT-20260129-200000-valueexpr-adapter-deferred`
**Branch**: `bmf_type_system_refactor`
**Status**: READY

## Problem Statement

The uncommitted changes to `canonical-types.ts`, `adapter-blocks.ts`, and `camera-block.ts` restructured the type system (UnitType to structured kinds, InstanceRef field renaming, BindingValue changes, removed exports). 63 tests across 41 files now fail. The changes align with sprint items #18/#19 (structured units) and other type system cleanup.

## Root Cause Analysis

There are **7 distinct failure categories**, all cascading from the `canonical-types.ts` refactor:

### Category 1: Missing `eventTypeScalar` / `eventTypePerInstance` / `eventType` / `canonicalEventOne`
**Files affected**: `IRBuilderImpl.ts` (production), `canonical-types.test.ts`, `hash-consing.test.ts`, many integration tests
**Root cause**: These functions were removed from `canonical-types.ts` but never re-added. They need to be implemented using the new type system (`canonicalEvent()` exists but is `one+discrete+bool+none` only; need scalar/per-instance variants).
**Fix**: Add `eventTypeScalar()` (alias for `canonicalEvent()`), `eventTypePerInstance(ref)`, `eventType(card)`, and `canonicalEventOne()` (alias for `canonicalEvent()`) back to `canonical-types.ts`.

### Category 2: Missing `unifyAxis` / `unifyExtent` / `AxisUnificationError`
**Files affected**: `canonical-types.test.ts`
**Root cause**: Axis unification functions were removed. Tests import them.
**Fix**: Add `unifyAxis`, `unifyExtent`, and `AxisUnificationError` back. These are legitimate helpers for the type system. `unifyAxis` takes two `Axis<T,V>` and returns the unified result or throws `AxisUnificationError`.

### Category 3: `DEFAULTS_V0` and `FRAME_V0` structure changes
**Files affected**: `canonical-types.test.ts`, integration tests
**Root cause**:
- `DEFAULTS_V0` is now an `Extent` (axes wrapped in `Axis<T,V>`), but tests expect flat values (e.g., `DEFAULTS_V0.cardinality.kind === 'one'` but actual is `'inst'`).
- `FRAME_V0` was removed entirely.
- `BindingValue.kind` changed from `'unbound'` to `'default'`.
**Fix**: Update tests to use the new wrapped structure (`DEFAULTS_V0.cardinality` is `Axis<CardinalityValue,_>` with `kind:'inst'`, `value.kind:'one'`). Remove or rewrite `FRAME_V0` tests. Update binding expectations from `'unbound'` to `'default'`.

### Category 4: `InstanceRef` field name change (`domainTypeId` → `domainType`)
**Files affected**: Tests that create/check `InstanceRef` objects
**Root cause**: Old `InstanceRef` had `{ instanceId, domainTypeId }`. New has `{ instanceId, domainType }`. Old `instanceRef(instanceId, domainTypeId)` now takes `(domainTypeStr, instanceIdStr)` (string args, reversed order).
**Fix**: Update all test call sites to use new `instanceRef(domainType, instanceId)` signature and check `.domainType` instead of `.domainTypeId`.

### Category 5: Structured UnitType changes (unit display, adapter matching)
**Files affected**: `connection-validation.test.ts`, `ValueRenderer.test.ts`, `bridges.test.ts`, adapter tests
**Root cause**: Units like `phase01`, `radians`, `degrees` changed from `{ kind: 'phase01' }` to `{ kind: 'angle', unit: 'phase01' }`. Code that formats types for display, matches units, or bridges to IR needs updating.
**Fix**: Update `formatTypeForDisplay` to handle structured units. Update adapter matching to compare structured units. Update bridge functions and tests.

### Category 6: `SHAPE` payload removed → `FLOAT` alias
**Files affected**: `shape-payload.test.ts`, `ValueRenderer.test.ts`, `bridges.test.ts`
**Root cause**: `SHAPE` is now aliased to `FLOAT` per Q6 resolution. Tests that expected `shape2d` format or `{ kind: 'shape' }` descriptors will fail.
**Fix**: Update shape tests to expect float behavior. Remove tests that assert shape-specific payload properties since shapes are now resources, not payloads.

### Category 7: ConstValue wrapping / expression block changes
**Files affected**: `expression-blocks.test.ts`, `io-blocks.test.ts`, integration tests
**Root cause**: Constants are now `ConstValue` objects (`{ kind: 'float', value: 0.5 }`) instead of raw numbers. Tests expecting raw number returns fail.
**Fix**: Update tests to expect `ConstValue` objects or update production code to unwrap correctly at boundaries.

## Implementation Plan

### Step 1: Add missing canonical-types exports
Add back to `canonical-types.ts`:
- `eventTypeScalar()` → returns `canonicalEvent()` (bool, none, one+discrete)
- `eventTypePerInstance(ref: InstanceRef)` → returns event with many(ref)+discrete
- `eventType(card: Cardinality)` → returns event with custom cardinality+discrete
- `canonicalEventOne()` → alias for `canonicalEvent()`
- `unifyAxis(name, a, b)` → unify two axes, throw `AxisUnificationError` on mismatch
- `AxisUnificationError` class
- `CardinalityAxis` type alias (= `Cardinality`)
- `FRAME_V0` export (if still needed, or remove tests)

### Step 2: Fix `canonical-types.test.ts`
- Update `DEFAULTS_V0` tests to use `Axis<T,V>` structure (check `.kind === 'inst'` then `.value.kind`)
- Update binding from `'unbound'` to `'default'`
- Fix `FRAME_V0` tests or remove if export no longer exists
- Fix `instanceRef` call signatures (reversed param order)
- Remove `{ kind: 'zero' }` reference in unifyAxis test (zero cardinality removed)

### Step 3: Fix `IRBuilderImpl.ts` event methods
The production code calls `eventTypeScalar()` which was removed. After Step 1 re-adds it, this should resolve automatically.

### Step 4: Fix structured unit display & matching
- Update `formatTypeForDisplay()` in connection-validation to handle structured units
- Update adapter matching to compare structured unit types
- Update bridge functions for structured extents/units

### Step 5: Fix shape payload tests
- Update `shape-payload.test.ts` expectations for FLOAT alias
- Update `ValueRenderer.test.ts` shape category tests
- Update `bridges.test.ts` shape descriptor expectations

### Step 6: Fix ConstValue expectations in expression/IO tests
- Update expression block tests for ConstValue wrapping
- Update IO block tests for new constant representation

### Step 7: Fix integration tests
These should mostly cascade-fix from Steps 1-6. Run full suite and address remaining failures individually.

## Verification

- `npm run test` passes with 0 failures
- `npm run typecheck` passes
- No new `any` casts introduced
- Changes align with sprint constraints (no inference vars in canonical types, no stored kind tags)

## Confidence: HIGH
All failures trace to known structural changes in the type system refactor. No architectural uncertainty.
