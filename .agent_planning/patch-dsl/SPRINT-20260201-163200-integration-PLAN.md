# Sprint: Integration - Round-Trip Testing & Integration
Generated: 2026-02-01-163200
Confidence: HIGH: 3, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION
Source: EVALUATION-20260201-162800.md

## Sprint Goal
Verify the Patch DSL implementation with comprehensive round-trip testing against all demo patches, deliberate error recovery tests, and integrate HCL import/export into PatchPersistence and PatchStore.

## Scope
**Deliverables:**
- Round-trip tests (roundtrip.test.ts) — Serialize → deserialize all 13 demo patches, assert equality
- Error recovery tests — Deliberately broken HCL → partial patch + errors
- Integration into PatchPersistence.ts — exportPatchAsHCL, importPatchFromHCL
- Integration into PatchStore.ts — loadFromHCL, exportToHCL methods

**Dependencies:**
- Sprint 1 (Foundation) — lexer, parser, ast, errors
- Sprint 2 (Conversion) — serialize, deserialize, patchesEqual

**Non-Goals (Deferred):**
- UI integration (file picker, editor pane) — out of scope
- Composite block deserialization — deferred per plan
- Editor metadata (positions, viewport) — deferred per plan
- Syntax highlighting / TextMate grammar — deferred per plan

## Work Items

### P0 (Critical): Round-Trip Tests (HIGH confidence)

**Dependencies**: Sprint 2 (serialize, deserialize, patchesEqual)
**Spec Reference**: Plan Phase 7 (lines 207-227) • **Status Reference**: EVALUATION-20260201-162800.md lines 356-376, 433-437

#### Description
Verify bidirectional conversion correctness by round-tripping all 13 demo patches: build patch with PatchBuilder, serialize to HCL, deserialize back to Patch, assert structural equality using `patchesEqual()`. This is the primary verification that the DSL implementation is complete and correct.

#### Acceptance Criteria
- [ ] `roundtrip.test.ts` implemented with test for each demo patch
- [ ] All 13 demo patches round-trip successfully with no errors
- [ ] Structural equality verified: same blocks (type, displayName, params), same edges (from, to, enabled), same port overrides
- [ ] Order-insensitive comparison for blocks (Map), order-sensitive for edges (sorted by sortKey)
- [ ] Test fails if serialization loses information (e.g., missing param, missing edge)
- [ ] Test fails if deserialization introduces errors (e.g., unresolved reference)

#### Technical Notes
**Demo patch list** (from `/Users/bmf/code/oscilla-animator-v2/src/demo/`):
1. domain-test.ts — Domain binding test
2. error-isolation-demo.ts — Error handling demo
3. feedback-rotation.ts — Feedback loop with rotation
4. feedback-simple.ts — Simple feedback loop
5. golden-spiral.ts — Golden ratio spiral (8 blocks, simple)
6. mouse-spiral.ts — Mouse-driven spiral
7. path-field-demo.ts — Path field operations
8. perspective-camera.ts — 3D perspective camera
9. rect-mosaic.ts — Rectangle mosaic pattern
10. shape-kaleidoscope.ts — Shape kaleidoscope (complex)
11. tile-grid.ts — Tiled grid layout
12. index.ts — Demo registry (skip this, not a patch)
13. types.ts — Type definitions (skip this, not a patch)

**Actual demo patches: 11** (excluding index.ts and types.ts)

**Test structure:**
```typescript
import { describe, it, expect } from 'vitest';
import { serializePatchToHCL, deserializePatchFromHCL, patchesEqual } from '../index';
import { buildGoldenSpiral } from '../../demo/golden-spiral';
import { buildFeedbackRotation } from '../../demo/feedback-rotation';
// ... import all demo builders

const DEMO_PATCHES = [
  { name: 'golden-spiral', builder: buildGoldenSpiral },
  { name: 'feedback-rotation', builder: buildFeedbackRotation },
  // ... all demos
];

describe('round-trip', () => {
  for (const { name, builder } of DEMO_PATCHES) {
    it(`round-trips ${name}`, () => {
      const patch1 = builder();
      const hcl = serializePatchToHCL(patch1, { name });
      const result = deserializePatchFromHCL(hcl);

      // Verify no errors
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);

      // Verify structural equality
      // NOTE: BlockIds will differ, so we need structural comparison
      // Option 1: Modify patchesEqual to ignore IDs
      // Option 2: Compare serialized HCL strings (deterministic output)
      const hcl2 = serializePatchToHCL(result.patch, { name });
      expect(hcl2).toBe(hcl);  // Deterministic serialization
    });
  }
});
```

**Gotcha**: BlockIds are generated during deserialization, so they won't match original IDs. Solution: compare serialized HCL strings instead (requires deterministic serialization).

**Alternative**: Modify `patchesEqual()` to compare structurally (type, displayName, params) ignoring IDs. This is more robust.

---

### P0 (Critical): Error Recovery Tests (HIGH confidence)

**Dependencies**: Sprint 2 (deserialize)
**Spec Reference**: Plan Phase 7 (line 223) • **Status Reference**: EVALUATION-20260201-162800.md lines 377-382

#### Description
Verify error recovery and partial patch handling by deliberately feeding malformed HCL to the deserializer. Must verify that errors are collected (not thrown) and partial patches are returned.

#### Acceptance Criteria
- [ ] Error recovery test suite implemented in `roundtrip.test.ts` or separate `error-recovery.test.ts`
- [ ] Malformed HCL produces partial patch + error list (no exceptions thrown)
- [ ] Unresolvable block reference → error collected, edge skipped
- [ ] Duplicate block names → warning collected, block renamed with suffix
- [ ] Unknown block type → warning collected, block preserved as-is (string type)
- [ ] Syntax error in HCL → parse error collected, partial AST produced
- [ ] Empty HCL → empty patch, no errors
- [ ] All tests pass

#### Technical Notes
**Test cases:**

1. **Unresolvable reference:**
```typescript
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
```

2. **Duplicate block names:**
```typescript
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
});
```

3. **Unknown block type:**
```typescript
it('preserves unknown block type', () => {
  const hcl = `
    patch "Test" {
      block "UnknownType" "foo" {}
    }
  `;
  const result = deserializePatchFromHCL(hcl);
  expect(result.warnings.length).toBeGreaterThan(0);
  expect(result.patch.blocks.size).toBe(1);
  const block = Array.from(result.patch.blocks.values())[0];
  expect(block.type).toBe('UnknownType');  // Preserved
});
```

4. **Syntax error:**
```typescript
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
```

5. **Empty HCL:**
```typescript
it('handles empty HCL', () => {
  const hcl = '';
  const result = deserializePatchFromHCL(hcl);
  expect(result.errors).toHaveLength(0);
  expect(result.patch.blocks.size).toBe(0);
  expect(result.patch.edges.length).toBe(0);
});
```

---

### P1 (High): Integration with PatchPersistence (HIGH confidence)

**Dependencies**: Sprint 2 (public API)
**Spec Reference**: Plan Phase 6 (lines 175-194) • **Status Reference**: EVALUATION-20260201-162800.md lines 438-441

#### Description
Add HCL import/export methods to `src/services/PatchPersistence.ts` alongside existing JSON serialization. These methods delegate to the Patch DSL public API.

#### Acceptance Criteria
- [ ] `exportPatchAsHCL(patch: Patch, name?: string): string` added to PatchPersistence.ts
- [ ] `importPatchFromHCL(hcl: string): { patch: Patch; errors: PatchDslError[] } | null` added
- [ ] `importPatchFromHCL` returns `null` if total failure (no blocks + errors), otherwise returns partial patch + errors
- [ ] Existing JSON serialization unchanged (no breaking changes)
- [ ] All tests pass (add integration test to PatchPersistence.test.ts)

#### Technical Notes
**File location**: `/Users/bmf/code/oscilla-animator-v2/src/services/PatchPersistence.ts`

**Add these functions:**
```typescript
import { serializePatchToHCL, deserializePatchFromHCL, type PatchDslError } from '../patch-dsl';

/**
 * Export patch as HCL text.
 */
export function exportPatchAsHCL(patch: Patch, name?: string): string {
  return serializePatchToHCL(patch, { name });
}

/**
 * Import patch from HCL text.
 * Returns null if total failure (no blocks and errors exist).
 * Returns partial patch + errors otherwise.
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

**Integration test** (add to `src/services/__tests__/PatchPersistence.test.ts`):
```typescript
import { exportPatchAsHCL, importPatchFromHCL } from '../PatchPersistence';
import { PatchBuilder } from '../../graph/PatchBuilder';

describe('HCL integration', () => {
  it('exports and imports patch via HCL', () => {
    const patch1 = new PatchBuilder()
      .addBlock('Ellipse', { rx: 0.02, ry: 0.02 }, { displayName: 'dot' })
      .build();

    const hcl = exportPatchAsHCL(patch1, 'Test');
    const result = importPatchFromHCL(hcl);

    expect(result).not.toBeNull();
    expect(result!.errors).toHaveLength(0);
    expect(result!.patch.blocks.size).toBe(1);
  });
});
```

---

### P2 (Medium): Integration with PatchStore (HIGH confidence)

**Dependencies**: PatchPersistence integration
**Spec Reference**: Plan Phase 6 (lines 195-199) • **Status Reference**: EVALUATION-20260201-162800.md lines 438-441

#### Description
Add `loadFromHCL` and `exportToHCL` methods to `src/stores/PatchStore.ts` that delegate to PatchPersistence. These are MobX actions that update store state.

#### Acceptance Criteria
- [ ] `loadFromHCL(hcl: string): void` added to PatchStore
- [ ] `exportToHCL(name?: string): string` added to PatchStore
- [ ] `loadFromHCL` updates the current patch state (via MobX action)
- [ ] `loadFromHCL` handles errors gracefully (e.g., shows diagnostic or throws)
- [ ] `exportToHCL` returns HCL string for current patch
- [ ] Existing store methods unchanged (no breaking changes)

#### Technical Notes
**File location**: `/Users/bmf/code/oscilla-animator-v2/src/stores/PatchStore.ts`

**Add these methods:**
```typescript
import { exportPatchAsHCL, importPatchFromHCL } from '../services/PatchPersistence';
import { action } from 'mobx';

export class PatchStore {
  // ... existing fields/methods

  /**
   * Load patch from HCL text.
   * Updates current patch state.
   */
  @action
  loadFromHCL(hcl: string): void {
    const result = importPatchFromHCL(hcl);
    if (!result) {
      throw new Error('Failed to import HCL: total parse failure');
    }

    if (result.errors.length > 0) {
      console.warn('HCL import had errors:', result.errors);
      // Optionally: add errors to DiagnosticHub
    }

    this.patch = result.patch;
    // Trigger recompilation if needed
  }

  /**
   * Export current patch as HCL text.
   */
  exportToHCL(name?: string): string {
    return exportPatchAsHCL(this.patch, name);
  }
}
```

**Note**: PatchStore is a MobX store. The `@action` decorator ensures reactive updates.

---

## Dependencies
**External:**
- src/demo/*.ts (demo patch builders for round-trip tests)
- src/services/PatchPersistence.ts (integration target)
- src/stores/PatchStore.ts (integration target)

**Internal (from Sprint 1 & 2):**
- serialize.ts (serializePatchToHCL)
- deserialize.ts (deserializePatchFromHCL)
- equality.ts (patchesEqual)
- errors.ts (PatchDslError, PatchDslWarning)

## Risks
**Low** — All items are straightforward integration or testing. No algorithmic complexity.

**Medium risk item: Round-trip ID mismatch**
- **Risk**: BlockIds generated during deserialization won't match original IDs
- **Mitigation 1**: Compare serialized HCL strings (requires deterministic serialization)
- **Mitigation 2**: Modify `patchesEqual()` to ignore IDs, compare structurally

**Low risk item: Demo patch builders may have issues**
- **Risk**: Demo patches may not build correctly or may have edge cases
- **Mitigation**: Run each demo individually first, verify they build without errors

## Notes
- All items are HIGH confidence (patterns exist, integration points clear)
- Estimated effort: ~4 hours (round-trip tests: 2h, error tests: 1h, integration: 1h)
- Round-trip tests are the primary verification strategy
- Error recovery tests ensure robustness
- Integration is thin wrappers (no complex logic)
