# Implementation Context: Integration

## Goal
An agent with ONLY this file can implement the integration sprint (round-trip tests, error recovery tests, PatchPersistence integration, PatchStore integration).

## Module Structure
```
src/patch-dsl/__tests__/
  roundtrip.test.ts           # Round-trip tests (this sprint)
  error-recovery.test.ts      # Error recovery tests (this sprint)

src/services/
  PatchPersistence.ts         # Add HCL methods (this sprint)
  __tests__/
    PatchPersistence.test.ts  # Add HCL integration test (this sprint)

src/stores/
  PatchStore.ts               # Add HCL methods (this sprint)
```

---

## File 1: __tests__/roundtrip.test.ts

**Location**: `/Users/bmf/code/oscilla-animator-v2/src/patch-dsl/__tests__/roundtrip.test.ts`

**Imports:**
```typescript
import { describe, it, expect } from 'vitest';
import { serializePatchToHCL, deserializePatchFromHCL } from '../index';

// Import demo patch builders
import { buildDomainTestPatch } from '../../demo/domain-test';
import { buildErrorIsolationDemo } from '../../demo/error-isolation-demo';
import { buildFeedbackRotation } from '../../demo/feedback-rotation';
import { buildFeedbackSimple } from '../../demo/feedback-simple';
import { buildGoldenSpiral } from '../../demo/golden-spiral';
import { buildMouseSpiral } from '../../demo/mouse-spiral';
import { buildPathFieldDemo } from '../../demo/path-field-demo';
import { buildPerspectiveCamera } from '../../demo/perspective-camera';
import { buildRectMosaic } from '../../demo/rect-mosaic';
import { buildShapeKaleidoscope } from '../../demo/shape-kaleidoscope';
import { buildTileGrid } from '../../demo/tile-grid';
```

**Demo patch list:**
Each demo file exports a builder function. Check actual exports by reading files:
- `/Users/bmf/code/oscilla-animator-v2/src/demo/domain-test.ts`
- `/Users/bmf/code/oscilla-animator-v2/src/demo/error-isolation-demo.ts`
- etc.

**Test structure:**
```typescript
describe('round-trip', () => {
  const DEMO_PATCHES = [
    { name: 'domain-test', builder: buildDomainTestPatch },
    { name: 'error-isolation-demo', builder: buildErrorIsolationDemo },
    { name: 'feedback-rotation', builder: buildFeedbackRotation },
    { name: 'feedback-simple', builder: buildFeedbackSimple },
    { name: 'golden-spiral', builder: buildGoldenSpiral },
    { name: 'mouse-spiral', builder: buildMouseSpiral },
    { name: 'path-field-demo', builder: buildPathFieldDemo },
    { name: 'perspective-camera', builder: buildPerspectiveCamera },
    { name: 'rect-mosaic', builder: buildRectMosaic },
    { name: 'shape-kaleidoscope', builder: buildShapeKaleidoscope },
    { name: 'tile-grid', builder: buildTileGrid },
  ];

  for (const { name, builder } of DEMO_PATCHES) {
    it(`round-trips ${name}`, () => {
      // Build original patch
      const patch1 = builder();

      // Serialize to HCL
      const hcl = serializePatchToHCL(patch1, { name });

      // Deserialize back to Patch
      const result = deserializePatchFromHCL(hcl);

      // Verify no errors/warnings
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);

      // Verify structural equality
      // Strategy: Serialize again and compare HCL strings (deterministic)
      const hcl2 = serializePatchToHCL(result.patch, { name });
      expect(hcl2).toBe(hcl);
    });
  }
});
```

**Gotcha**: If serialization is NOT deterministic (e.g., Map iteration order varies), this test will fail. Solution: ensure Sprint 2 serializer sorts blocks/edges/params deterministically.

**Alternative approach** (if HCL string comparison fails):
```typescript
// Use patchesEqual (structural comparison ignoring IDs)
import { patchesEqual } from '../equality';

// In test:
expect(patchesEqual(patch1, result.patch)).toBe(true);
```

**Issue**: `patchesEqual` compares BlockIds, which will differ. Need to modify equality to compare structurally.

**Better solution**: Modify `patchesEqual()` in Sprint 2 to accept `{ ignoreIds: boolean }` option:
```typescript
export function patchesEqual(a: Patch, b: Patch, options?: { ignoreIds?: boolean }): boolean {
  const ignoreIds = options?.ignoreIds ?? false;

  // If ignoreIds, compare by displayName instead of BlockId
  if (ignoreIds) {
    return patchesEqualStructural(a, b);
  }

  // Otherwise, compare by ID
  return patchesEqualByIds(a, b);
}
```

For round-trip tests, use `patchesEqual(patch1, result.patch, { ignoreIds: true })`.

---

## File 2: __tests__/error-recovery.test.ts

**Location**: `/Users/bmf/code/oscilla-animator-v2/src/patch-dsl/__tests__/error-recovery.test.ts`

**Imports:**
```typescript
import { describe, it, expect } from 'vitest';
import { deserializePatchFromHCL } from '../index';
```

**Test structure:**
```typescript
describe('error recovery', () => {
  it('handles unresolvable block reference', () => {
    const hcl = `
      patch "Test" {
        block "Const" "a" {}
        connect {
          from = a.out
          to = nonexistent.in
        }
      }
    `;
    const result = deserializePatchFromHCL(hcl);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain('Unresolved');
    expect(result.patch.blocks.size).toBe(1);  // Block 'a' exists
    expect(result.patch.edges.length).toBe(0); // Edge skipped
  });

  it('renames duplicate block names', () => {
    const hcl = `
      patch "Test" {
        block "Const" "foo" {}
        block "Const" "foo" {}
      }
    `;
    const result = deserializePatchFromHCL(hcl);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0].message).toContain('Duplicate');
    expect(result.patch.blocks.size).toBe(2);

    // Check that one block has displayName "foo_2"
    const displayNames = Array.from(result.patch.blocks.values()).map(b => b.displayName);
    expect(displayNames).toContain('foo');
    expect(displayNames).toContain('foo_2');
  });

  it('preserves unknown block type', () => {
    const hcl = `
      patch "Test" {
        block "UnknownType" "foo" {}
      }
    `;
    const result = deserializePatchFromHCL(hcl);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0].message).toContain('Unknown');
    expect(result.patch.blocks.size).toBe(1);
    const block = Array.from(result.patch.blocks.values())[0];
    expect(block.type).toBe('UnknownType');  // Preserved
  });

  it('recovers from syntax error', () => {
    const hcl = `
      patch "Test" {
        block "Const" "a" { invalid syntax }
        block "Const" "b" {}
      }
    `;
    const result = deserializePatchFromHCL(hcl);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.patch.blocks.size).toBeGreaterThan(0);  // Partial parse
  });

  it('handles empty HCL', () => {
    const hcl = '';
    const result = deserializePatchFromHCL(hcl);
    expect(result.errors).toHaveLength(0);
    expect(result.patch.blocks.size).toBe(0);
    expect(result.patch.edges.length).toBe(0);
  });

  it('handles missing required block labels', () => {
    const hcl = `
      patch "Test" {
        block "Const" {}
      }
    `;
    const result = deserializePatchFromHCL(hcl);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain('displayName');
  });

  it('handles malformed connect block', () => {
    const hcl = `
      patch "Test" {
        connect {
          from = a.out
        }
      }
    `;
    const result = deserializePatchFromHCL(hcl);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain('to');
  });
});
```

**Expected error messages** (from Sprint 2 deserializer):
- Unresolvable reference: `"Unresolved from reference: ..."`
- Duplicate block name: `"Duplicate block name \"foo\", renamed to \"foo_2\""`
- Unknown block type: `"Unknown block type \"UnknownType\""`
- Missing label: `"Block must have type and displayName labels"`
- Missing attribute: `"connect block must have from and to attributes"`

Adjust test assertions to match actual error messages from implementation.

---

## File 3: PatchPersistence.ts (modifications)

**Location**: `/Users/bmf/code/oscilla-animator-v2/src/services/PatchPersistence.ts`

**Current structure** (existing code, do NOT modify):
- `serializePatch(patch: Patch): string` — JSON serialization
- `deserializePatch(json: string): Patch | null` — JSON deserialization
- localStorage integration

**Add these imports** (at top of file):
```typescript
import { serializePatchToHCL, deserializePatchFromHCL, type PatchDslError } from '../patch-dsl';
```

**Add these functions** (at end of file, before exports):
```typescript
/**
 * Export patch as HCL text.
 *
 * @param patch - The patch to serialize
 * @param name - Optional patch name (defaults to "Untitled")
 * @returns HCL text representation
 */
export function exportPatchAsHCL(patch: Patch, name?: string): string {
  return serializePatchToHCL(patch, { name });
}

/**
 * Import patch from HCL text.
 *
 * Returns null if total failure (no blocks and errors exist).
 * Returns partial patch + errors otherwise.
 *
 * @param hcl - HCL text to deserialize
 * @returns Patch and errors, or null if total failure
 */
export function importPatchFromHCL(hcl: string): { patch: Patch; errors: PatchDslError[] } | null {
  const result = deserializePatchFromHCL(hcl);

  // Total failure: no blocks and errors exist
  if (result.patch.blocks.size === 0 && result.errors.length > 0) {
    return null;
  }

  return { patch: result.patch, errors: result.errors };
}
```

**Do NOT modify** existing JSON serialization functions.

---

## File 4: PatchPersistence.test.ts (modifications)

**Location**: `/Users/bmf/code/oscilla-animator-v2/src/services/__tests__/PatchPersistence.test.ts`

**Add these imports:**
```typescript
import { exportPatchAsHCL, importPatchFromHCL } from '../PatchPersistence';
```

**Add this test suite** (at end of file):
```typescript
describe('HCL integration', () => {
  it('exports and imports patch via HCL', () => {
    const patch1 = new PatchBuilder()
      .addBlock('Ellipse', { rx: 0.02, ry: 0.02 }, { displayName: 'dot' })
      .addBlock('Const', { value: 1.0 }, { displayName: 'color' })
      .build();

    const hcl = exportPatchAsHCL(patch1, 'Test');
    expect(hcl).toContain('patch "Test"');
    expect(hcl).toContain('block "Ellipse" "dot"');

    const result = importPatchFromHCL(hcl);
    expect(result).not.toBeNull();
    expect(result!.errors).toHaveLength(0);
    expect(result!.patch.blocks.size).toBe(2);
  });

  it('handles total failure in HCL import', () => {
    const hcl = '{ invalid }';
    const result = importPatchFromHCL(hcl);
    expect(result).toBeNull();  // Total failure
  });

  it('handles partial failure in HCL import', () => {
    const hcl = `
      patch "Test" {
        block "Const" "a" {}
        connect { from = a.out, to = missing.in }
      }
    `;
    const result = importPatchFromHCL(hcl);
    expect(result).not.toBeNull();  // Partial success
    expect(result!.errors.length).toBeGreaterThan(0);
    expect(result!.patch.blocks.size).toBe(1);  // Block 'a' exists
  });
});
```

**Gotcha**: PatchBuilder import path may vary. Check existing tests for correct import.

---

## File 5: PatchStore.ts (modifications)

**Location**: `/Users/bmf/code/oscilla-animator-v2/src/stores/PatchStore.ts`

**Current structure** (existing code, do NOT modify):
- `patch: Patch` — Current patch state (MobX observable)
- `loadPatch(patch: Patch): void` — Load patch (MobX action)
- Other methods for graph manipulation

**Add these imports** (at top of file):
```typescript
import { exportPatchAsHCL, importPatchFromHCL } from '../services/PatchPersistence';
```

**Add these methods** (in PatchStore class):
```typescript
/**
 * Load patch from HCL text.
 * Updates current patch state.
 *
 * @param hcl - HCL text to deserialize
 * @throws Error if total parse failure
 */
@action
loadFromHCL(hcl: string): void {
  const result = importPatchFromHCL(hcl);
  if (!result) {
    throw new Error('Failed to import HCL: total parse failure');
  }

  if (result.errors.length > 0) {
    console.warn('HCL import had errors:', result.errors);
    // TODO: Optionally add errors to DiagnosticHub
    // this.diagnosticHub.addErrors(result.errors);
  }

  this.patch = result.patch;
  // Trigger recompilation if needed
  // this.recompile();  // Adjust based on actual store API
}

/**
 * Export current patch as HCL text.
 *
 * @param name - Optional patch name (defaults to "Untitled")
 * @returns HCL text representation
 */
exportToHCL(name?: string): string {
  return exportPatchAsHCL(this.patch, name);
}
```

**Note**: PatchStore is a MobX store. Methods use `@action` decorator. Check existing code for correct decorator usage.

**Gotcha**: PatchStore may have a recompilation trigger. Check if `loadFromHCL` should trigger recompilation after updating patch.

**Existing pattern** (from PatchStore):
```typescript
@action
loadPatch(patch: Patch): void {
  this.patch = patch;
  this.recompile();  // Or similar
}
```

Follow the same pattern for `loadFromHCL`.

---

## Demo Patch Builders (Reference)

**Location**: `/Users/bmf/code/oscilla-animator-v2/src/demo/`

**Expected exports** (check actual files for exact function names):
```typescript
// domain-test.ts
export function buildDomainTestPatch(): Patch { ... }

// error-isolation-demo.ts
export function buildErrorIsolationDemo(): Patch { ... }

// feedback-rotation.ts
export function buildFeedbackRotation(): Patch { ... }

// feedback-simple.ts
export function buildFeedbackSimple(): Patch { ... }

// golden-spiral.ts
export function buildGoldenSpiral(): Patch { ... }

// mouse-spiral.ts
export function buildMouseSpiral(): Patch { ... }

// path-field-demo.ts
export function buildPathFieldDemo(): Patch { ... }

// perspective-camera.ts
export function buildPerspectiveCamera(): Patch { ... }

// rect-mosaic.ts
export function buildRectMosaic(): Patch { ... }

// shape-kaleidoscope.ts
export function buildShapeKaleidoscope(): Patch { ... }

// tile-grid.ts
export function buildTileGrid(): Patch { ... }
```

**Gotcha**: Function names may vary. Read each demo file to get exact export name. Example:
```bash
grep -n "export function" /Users/bmf/code/oscilla-animator-v2/src/demo/golden-spiral.ts
```

---

## Execution Order

1. **Read demo files** to get exact builder function names (30 min)
   - `grep "export function" src/demo/*.ts`
   - Update DEMO_PATCHES array in roundtrip.test.ts

2. **Implement roundtrip.test.ts** (1.5 hours)
   - Import all demo builders
   - Write test loop
   - Run tests: `npx vitest run src/patch-dsl/__tests__/roundtrip.test.ts`
   - Debug failures (likely serialization determinism issues)

3. **Implement error-recovery.test.ts** (1 hour)
   - Write 5-7 error test cases
   - Run tests: `npx vitest run src/patch-dsl/__tests__/error-recovery.test.ts`
   - Verify error messages match

4. **Integrate PatchPersistence.ts** (30 min)
   - Add exportPatchAsHCL, importPatchFromHCL
   - Add integration test to PatchPersistence.test.ts
   - Run tests: `npx vitest run src/services/__tests__/PatchPersistence.test.ts`

5. **Integrate PatchStore.ts** (30 min)
   - Add loadFromHCL, exportToHCL
   - Manual test in dev server (browser console)

---

## Success Criteria

- [ ] All TypeScript files compile with no errors
- [ ] `npx vitest run src/patch-dsl/__tests__/roundtrip.test.ts` — all tests pass (11 demo patches)
- [ ] `npx vitest run src/patch-dsl/__tests__/error-recovery.test.ts` — all tests pass (5+ cases)
- [ ] `npx vitest run src/services/__tests__/PatchPersistence.test.ts` — HCL integration test passes
- [ ] Manual verification: `store.exportToHCL()` and `store.loadFromHCL(hcl)` work in browser console

---

## Gotchas

1. **Demo builder names**: Function names in demo files may not match expectations. Read files to get exact names.

2. **BlockId mismatch in round-trip**: Deserialization generates new IDs. Use HCL string comparison or modify `patchesEqual()` to ignore IDs.

3. **Serialization determinism**: If serialization is not deterministic (e.g., Map iteration order), HCL string comparison will fail. Ensure Sprint 2 serializer sorts blocks/edges/params.

4. **MobX action decorator**: PatchStore uses `@action` from MobX. Import and use correctly.

5. **Recompilation trigger**: PatchStore may need to trigger recompilation after loading new patch. Check existing `loadPatch()` pattern.

6. **Error message matching**: Error recovery tests assert on error messages. Adjust assertions to match actual messages from Sprint 2 implementation.

7. **Total failure vs partial failure**: `importPatchFromHCL` returns `null` for total failure (no blocks + errors), otherwise returns partial patch + errors. Test both cases.

---

## Manual Verification Steps

1. Start dev server: `npm run dev`
2. Open browser console
3. Get PatchStore instance:
   ```javascript
   // Find the store instance (may vary based on app structure)
   const store = window.__PATCH_STORE__;  // Or similar global
   ```
4. Export current patch:
   ```javascript
   const hcl = store.exportToHCL('Manual Test');
   console.log(hcl);
   ```
5. Load from HCL:
   ```javascript
   store.loadFromHCL(hcl);
   ```
6. Verify patch is unchanged (visual inspection or export again)

**Note**: Exact way to get PatchStore instance may vary. Check app initialization code or use React DevTools to find store.
