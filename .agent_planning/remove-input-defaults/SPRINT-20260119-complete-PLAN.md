# Sprint: Complete inputDefaults Removal (Working Patch)

Generated: 2026-01-19
Confidence: **HIGH**
Status: READY FOR IMPLEMENTATION

---

## Sprint Goal

**Remove the `inputDefaults` system AND ensure all block specs have registry defaults so the patch works correctly after removal.**

This replaces the previous plan which only addressed removal without ensuring completeness of the default source system.

---

## Key Finding

The correct DefaultSource architecture **already exists and works**. Pass1 creates DefaultSource derived blocks. The problems are:

1. `inputDefaults` creates a short-circuit that bypasses the correct flow
2. Some block specs are missing `defaultSource` definitions on their inputs
3. Demo patches use `inputDefaults` instead of proper architecture

---

## Deliverables

### P0: Complete Registry Defaults (MUST DO FIRST)

Before removing `inputDefaults`, ensure all inputs have registry defaults.

**Blocks missing `defaultSource`:**

| Block | Input | Current | Required |
|-------|-------|---------|----------|
| HsvToRgb | sat | NO defaultSource | `defaultSourceConstant(1.0)` |
| HsvToRgb | val | NO defaultSource | `defaultSourceConstant(1.0)` |
| FieldRadiusSqrt | radius | NO defaultSource | `defaultSourceConstant(0.35)` |
| RenderInstances2D | size | NO defaultSource | `defaultSourceConstant(5)` |
| RenderCircle | size | NO defaultSource | `defaultSourceConstant(5)` |
| RenderRect | width | NO defaultSource | `defaultSourceConstant(10)` |
| RenderRect | height | NO defaultSource | `defaultSourceConstant(10)` |

**Files to modify:**
- `src/blocks/color-blocks.ts` - HsvToRgb
- `src/blocks/field-operations-blocks.ts` - FieldRadiusSqrt
- `src/blocks/render-blocks.ts` - RenderInstances2D, RenderCircle, RenderRect

**Acceptance Criteria:**
- [ ] Every input used in demo patches has a `defaultSource` defined
- [ ] Defaults are sensible values (match what inputDefaults was providing)
- [ ] TypeScript compiles with no errors

### P1: Remove inputDefaults from Type System

**Files to modify:**

| File | Change |
|------|--------|
| `src/graph/Patch.ts:31` | Remove `inputDefaults` from Block interface |
| `src/graph/Patch.ts:103` | Remove `inputDefaults` from PatchBuilder options |
| `src/graph/Patch.ts:116` | Remove `inputDefaults` assignment |

**Acceptance Criteria:**
- [ ] `inputDefaults` field does not exist on Block type
- [ ] `inputDefaults` option does not exist on PatchBuilder.addBlock
- [ ] TypeScript compiles (will show errors in other files - expected)

### P2: Remove inputDefaults Logic

**Files to modify:**

| File | Change |
|------|--------|
| `src/graph/passes/pass1-default-sources.ts` | Remove `inputDefaults` override check |
| `src/stores/PatchStore.ts` | Remove `inputDefaults` handling |
| `src/ui/reactFlowEditor/nodes.ts` | Remove `inputDefaults` display check |

**Specific changes in pass1-default-sources.ts:**
```typescript
// DELETE: const instanceOverride = block.inputDefaults?.[input.id];
// DELETE: if (instanceOverride) { ... }
// KEEP: Use only registry default: const ds = input.defaultSource;
```

**Acceptance Criteria:**
- [ ] Pass1 does NOT check for any per-block override
- [ ] Pass1 only uses registry defaults (input.defaultSource)
- [ ] Store does not handle inputDefaults
- [ ] UI does not check inputDefaults

### P3: Fix Demo Patches

**Files to modify:** `src/main.ts`

**13 blocks need updating.** For each:

**Option A (Preferred): Remove inputDefaults entirely**
```typescript
// BEFORE
const angularOffset = b.addBlock('FieldAngularOffset', {}, {
  inputDefaults: { spin: constant(2.0) },
});

// AFTER - Use registry default (spin defaults to 1.0)
const angularOffset = b.addBlock('FieldAngularOffset', {});
```

**Option B: Wire explicit Const blocks (if non-default value needed)**
```typescript
// AFTER - Explicit wiring for non-default value
const spinConst = b.addBlock('Const', { value: 2.0 });
const angularOffset = b.addBlock('FieldAngularOffset', {});
b.connect(spinConst.id, 'value', angularOffset.id, 'spin');
```

**Blocks to fix:**
1. patchOriginal: FieldAngularOffset (spin), FieldRadiusSqrt (radius), HsvToRgb (sat, val), RenderInstances2D (size)
2. patchPhyllotaxis: FieldRadiusSqrt (radius), HsvToRgb (sat, val), RenderInstances2D (size)
3. patchSpiral: FieldAngularOffset (spin), FieldRadiusSqrt (radius), HsvToRgb (sat, val), RenderInstances2D (size)
4. patchModular: FieldRadiusSqrt (radius), HsvToRgb (sat, val), RenderInstances2D (size)

**Acceptance Criteria:**
- [ ] ZERO occurrences of `inputDefaults` in main.ts
- [ ] Demo patches compile without errors
- [ ] All wiring is explicit or uses registry defaults

### P4: Codebase Verification

**Commands:**
```bash
grep -r "inputDefaults" src/      # Should return 0 results
npm run typecheck                  # Should pass
npm run test                       # Should pass
npm run build                      # Should succeed
```

**Acceptance Criteria:**
- [ ] Grep for `inputDefaults` returns ZERO results in src/
- [ ] TypeScript compiles with no errors
- [ ] All tests pass
- [ ] Build succeeds

### P5: End-to-End Verification

**Manual test:**
1. Load app
2. Verify animation displays correctly
3. Select a block with an unconnected input
4. Edit the param in inspector
5. Verify visual output changes (proves correct architecture working)

**Acceptance Criteria:**
- [ ] Demo patches run and display animation
- [ ] Inspector param edits affect visual output
- [ ] DefaultSource blocks are created during normalization (visible in debug output)

### P6: UI Visual Differentiation (Original Request - DEFERRED)

This was the **original request** that led to the incorrect inputDefaults implementation.

**Scope:**
- Detect edges with `role: 'default'`
- Render them differently (color, style, badge)

**Recommendation:** Defer to a separate sprint. It's UI-only work that doesn't affect correctness.

---

## Execution Order

```
P0 (Registry defaults) → P1 (Type removal) → P2 (Logic removal) → P3 (Demo patches) → P4 (Verification) → P5 (E2E test)
```

**Why P0 first?** If we remove inputDefaults before registry defaults exist, the patch will fail to compile because Pass1 won't have any defaults to use.

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Missing registry defaults | MEDIUM | P0 audits all inputs |
| Demo patches fail | LOW | P3 addresses all 13 blocks |
| Tests fail | LOW | No tests use inputDefaults |
| Compiler issues | LOW | Grep verification in P4 |

---

## Files Summary

| File | Phase | Changes |
|------|-------|---------|
| `src/blocks/color-blocks.ts` | P0 | Add defaultSource to HsvToRgb inputs |
| `src/blocks/field-operations-blocks.ts` | P0 | Add defaultSource to FieldRadiusSqrt |
| `src/blocks/render-blocks.ts` | P0 | Add defaultSource to render block inputs |
| `src/graph/Patch.ts` | P1 | Remove inputDefaults from types |
| `src/graph/passes/pass1-default-sources.ts` | P2 | Remove override check |
| `src/stores/PatchStore.ts` | P2 | Remove inputDefaults handling |
| `src/ui/reactFlowEditor/nodes.ts` | P2 | Remove inputDefaults check |
| `src/main.ts` | P3 | Remove inputDefaults from all demo patches |

---

## Supersedes

This plan supersedes:
- `SPRINT-20260119-inputdefaults-removal-PLAN.md` (incomplete - didn't include P0)
