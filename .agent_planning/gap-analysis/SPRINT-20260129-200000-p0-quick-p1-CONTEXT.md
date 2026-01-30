# Implementation Context: p0-quick-p1
Generated: 2026-01-29-200000
Source: EVALUATION-20260129-200000.md
Confidence: HIGH

## P0: Fix unitVar Crash

### Files to Modify

**src/blocks/signal-blocks.ts:68**
```typescript
// CURRENT:
out: { label: 'Output', type: canonicalType(payloadVar('const_payload'), unitVar('const_out')) },
// REPLACE WITH:
out: { label: 'Output', type: canonicalType(payloadVar('const_payload'), unitScalar()) },
```
- Import `unitScalar` from `../../core/canonical-types` (already imported: check existing imports)

**src/blocks/field-blocks.ts:57**
```typescript
// CURRENT:
signal: { label: 'Signal', type: canonicalType(payloadVar('broadcast_payload'), unitVar('broadcast_in')) },
// REPLACE WITH:
signal: { label: 'Signal', type: canonicalType(payloadVar('broadcast_payload'), unitScalar()) },
```

**src/blocks/field-blocks.ts:60**
```typescript
// CURRENT:
field: { label: 'Field', type: canonicalField(payloadVar('broadcast_payload'), unitVar('broadcast_in'), { ... }) },
// REPLACE WITH:
field: { label: 'Field', type: canonicalField(payloadVar('broadcast_payload'), unitScalar(), { ... }) },
```

**src/blocks/field-blocks.ts:141**
```typescript
// CURRENT:
type: canonicalField(payloadVar('reduce_payload'), unitVar('reduce_in'), { ... })
// REPLACE WITH:
type: canonicalField(payloadVar('reduce_payload'), unitScalar(), { ... })
```

**src/blocks/field-blocks.ts:147**
```typescript
// CURRENT:
type: canonicalType(payloadVar('reduce_payload'), unitVar('reduce_in'))
// REPLACE WITH:
type: canonicalType(payloadVar('reduce_payload'), unitScalar())
```

### Why unitScalar() is safe
The constraint solver (pass1-type-constraints.ts) uses `block.polymorphicPayload` metadata to resolve types. For polymorphic blocks, the solver overwrites the port type entirely from the resolved constraint. The `type` on the port definition serves as a template/default for non-polymorphic blocks. Since these are all polymorphic blocks (they have `polymorphicPayload` defined), the placeholder unit will be overwritten.

### Verification
```bash
npx vitest run src/blocks/__tests__/ 2>&1 | head -50
# Should no longer show "unitVar() removed per D5"
```

---

## P1 #1: Fix Broken Canonical Type Tests

### File to Modify

**src/core/__tests__/canonical-types.test.ts**

Lines with `'instantiated'` that need to become `'inst'`:
- Line 382: `expect(type.extent.temporality.kind).toBe('instantiated');` -> `'inst'`
- Line 388: `expect(type.extent.cardinality.kind).toBe('instantiated');` -> `'inst'`
- Line 404: `expect(type.extent.temporality.kind).toBe('instantiated');` -> `'inst'`

Search for ALL occurrences: `grep -n "'instantiated'" src/core/__tests__/canonical-types.test.ts`

### Pattern to Follow
The Axis discriminated union uses `kind: 'inst' | 'var'`. See `src/core/canonical-types.ts` Axis type definition.

### Verification
```bash
npx vitest run src/core/__tests__/canonical-types.test.ts
```

---

## P1 #5: Delete AxisTag Alias

### File to Modify

**src/compiler/ir/bridges.ts:36**
```typescript
// DELETE THIS LINE:
type AxisTag<T> = Axis<T, never>;
```

Also delete the backward-compat comment on line 32 if it references AxisTag:
```typescript
// DELETE:
// Type aliases for backward compat
type Cardinality = CardinalityValue;  // keep if used
type Temporality = TemporalityValue;  // keep if used
type Binding = BindingValue;          // keep if used
type AxisTag<T> = Axis<T, never>;     // DELETE
```

### Check usages first
```bash
grep -rn 'AxisTag' src/
```
If AxisTag is used elsewhere in bridges.ts, replace inline with `Axis<T, never>`.

### Verification
```bash
grep -rn 'AxisTag' src/  # should return 0 results
npx tsc --noEmit
```

---

## P1 #8: cameraProjection Closed Enum

### File to Modify

**src/core/canonical-types.ts:369-371**

```typescript
// ADD before cameraProjectionConst:
export type CameraProjection = 'orthographic' | 'perspective';

// CHANGE:
export function cameraProjectionConst(value: string): ConstValue {
  return { kind: 'cameraProjection', value };
}
// TO:
export function cameraProjectionConst(value: CameraProjection): ConstValue {
  return { kind: 'cameraProjection', value };
}
```

Also update the ConstValue type. Find the ConstValue union (search for `type ConstValue`) and change the cameraProjection variant:
```typescript
// FROM:
| { readonly kind: 'cameraProjection'; readonly value: string }
// TO:
| { readonly kind: 'cameraProjection'; readonly value: CameraProjection }
```

### Verification
```bash
npx tsc --noEmit  # check no callers pass invalid strings
npx vitest run src/core/__tests__/
```

---

## P1 #9: Add tryDeriveKind

### File to Modify

**src/core/canonical-types.ts** -- add after `deriveKind()` (after line 716)

```typescript
/**
 * Safe variant of deriveKind that returns null instead of throwing
 * when axes are uninstantiated (var).
 */
export function tryDeriveKind(t: CanonicalType): DerivedKind | null {
  const card = t.extent.cardinality;
  const tempo = t.extent.temporality;

  if (tempo.kind !== 'inst') return null;
  if (tempo.value.kind === 'discrete') return 'event';

  // continuous:
  if (card.kind !== 'inst') return null;
  if (card.value.kind === 'many') return 'field';
  return 'signal';
}
```

### Test File

**src/core/__tests__/canonical-types.test.ts** -- add test cases:
```typescript
describe('tryDeriveKind', () => {
  it('returns kind for fully instantiated type', () => {
    const sig = canonicalSignal({ kind: 'float', stride: 1 }, unitScalar());
    expect(tryDeriveKind(sig)).toBe('signal');
  });
  it('returns null for type with var axes', () => {
    // construct a type with var temporality axis
    // use axisVar() if available
  });
});
```

### Verification
```bash
npx vitest run src/core/__tests__/canonical-types.test.ts
```

---

## P1 #11: Rename AxisViolation Fields

### File to Modify

**src/compiler/frontend/axis-validate.ts:26-30**

```typescript
// FROM:
export interface AxisViolation {
  readonly typeIndex: number;
  readonly kind: string;
  readonly message: string;
}
// TO:
export interface AxisViolation {
  readonly nodeIndex: number;
  readonly nodeKind: string;
  readonly message: string;
}
```

Update the producer at line 45-49:
```typescript
// FROM:
out.push({
  typeIndex: i,
  kind: deriveKind(t),
  message: err instanceof Error ? err.message : String(err),
});
// TO:
out.push({
  nodeIndex: i,
  nodeKind: deriveKind(t),
  message: err instanceof Error ? err.message : String(err),
});
```

### Check consumers
```bash
grep -rn 'typeIndex\|AxisViolation' src/
```

### Verification
```bash
npx tsc --noEmit
npx vitest run src/compiler/frontend/
```

---

## P1 #12: deriveKind Agreement Asserts

### Files to Modify

Identify lowering boundary. Look at block lowering pass:
```bash
grep -rn "kind.*signal\|kind.*field\|kind.*event" src/compiler/passes-v2/pass6-block-lowering.ts | head -20
```

At each point where a SigExpr or FieldExpr is created with both a `kind` tag and a `type: CanonicalType`, add:
```typescript
if (process.env.NODE_ENV !== 'production') {
  const expected = deriveKind(type);
  const actual = /* the kind tag */;
  console.assert(expected === actual, `deriveKind mismatch: tag=${actual}, derived=${expected}`);
}
```

### Pattern to Follow
Look at existing assert patterns in the codebase:
```bash
grep -rn 'console.assert\|invariant(' src/compiler/ | head -10
```

### Verification
Write a unit test that constructs a mismatched expr and verifies the assert fires.

---

## P1 #13: CI Forbidden-Pattern Test

### File to Create

**src/core/__tests__/forbidden-patterns.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

const SRC_DIR = path.resolve(__dirname, '../../..');

const FORBIDDEN_PATTERNS = [
  {
    name: 'AxisTag alias',
    pattern: /AxisTag</,
    dirs: ['src/'],
    excludeDirs: ['__tests__', 'node_modules'],
  },
  {
    name: 'Legacy SignalType',
    pattern: /\bSignalType\b/,
    dirs: ['src/compiler/', 'src/runtime/'],
    excludeDirs: ['__tests__'],
  },
  {
    name: 'Legacy ResolvedPortType',
    pattern: /\bResolvedPortType\b/,
    dirs: ['src/compiler/', 'src/runtime/'],
    excludeDirs: ['__tests__'],
  },
];

describe('forbidden patterns', () => {
  for (const fp of FORBIDDEN_PATTERNS) {
    it(`should not contain ${fp.name}`, () => {
      // scan files, assert pattern not found
    });
  }
});
```

### Pattern to Follow
Look for existing glob/fs-based tests:
```bash
grep -rn "readFileSync\|readdirSync" src/**/__tests__/ | head -5
```

### Verification
```bash
npx vitest run src/core/__tests__/forbidden-patterns.test.ts
```
