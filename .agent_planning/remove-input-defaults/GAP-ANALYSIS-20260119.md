# Gap Analysis: Complete Work to Remove inputDefaults

Generated: 2026-01-19
Purpose: Identify ALL work needed for a working patch after inputDefaults removal

## Key Finding

The correct DefaultSource architecture **already exists** in the codebase. Pass1 (`pass1-default-sources.ts`) correctly creates DefaultSource derived blocks. The problem is:

1. **inputDefaults creates a short-circuit** that bypasses the correct flow
2. **Registry defaults are incomplete** - not all block specs define `defaultSource`
3. **Demo patches are broken** - they use inputDefaults instead of params

## Architecture Analysis

### Current (Broken) Flow

```
                    ┌─ inputDefaults override (WRONG) ─┐
                    │                                  │
Block.params ───────┤                                  ├──> DefaultSource block
                    │                                  │
                    └─ registry default (correct) ─────┘
```

Pass1 checks `block.inputDefaults` FIRST, then falls back to registry. This means:
- User edits `block.params` via inspector
- Pass1 ignores params, uses inputDefaults
- User's edit is invisible

### Correct Flow (After Removal)

```
Block.params ──> Pass1 reads registry default ──> Const block ──> Edge to input
```

## Work Required

### PHASE 1: Remove inputDefaults System

**Scope:** ~50 lines of deletion across 4 files

| File | Changes |
|------|---------|
| `src/graph/Patch.ts` | Remove field from Block interface, options type, assignment |
| `src/graph/passes/pass1-default-sources.ts` | Remove override check, use only registry |
| `src/stores/PatchStore.ts` | Remove inputDefaults handling |
| `src/ui/reactFlowEditor/nodes.ts` | Remove inputDefaults display check |

### PHASE 2: Fix Demo Patches

**Scope:** 13 blocks in main.ts need rewriting

**For each inputDefaults block:**
- Option A: Remove and use registry defaults
- Option B: Move values to block.params
- Option C: Wire explicit Const blocks

### PHASE 3: Complete Registry Defaults

**Finding:** Some block specs lack `defaultSource` on their inputs.

**Blocks needing audit:**
- Signal blocks (Oscillator, Hash, Id01)
- Geometry blocks (PolarToCartesian, OffsetPosition, CircularLayout)
- Field blocks (FieldScale, FieldSin, FieldCos)
- Color blocks (ColorLFO)
- Render blocks (RenderCircle, RenderRect)

**Acceptance:** Every required input has `defaultSource` defined.

### PHASE 4: End-to-End Verification

Verify the correct flow works:
1. Block has unconnected input with registry default
2. Pass1 creates Const block from registry default
3. Const block connects to input via default edge
4. Inspector edit to block.params triggers recompile
5. Visual output reflects new param value

### PHASE 5: UI Visual Differentiation (Original Request)

The original ask was "render default sources differently" - a UI task.

- Detect edges with `role: 'default'`
- Render differently (color, style, badge)
- This is purely visual, no data model changes

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Demo patches fail | HIGH | Test immediately after Phase 1 |
| Missing registry defaults | MEDIUM | Audit in Phase 3 |
| Compiler issues | LOW | Grep verification |
| Tests fail | LOW | No tests use inputDefaults |

## Total Estimated Scope

- Phase 1: ~50 lines removal
- Phase 2: ~100 lines in main.ts
- Phase 3: ~50 lines adding defaultSource to specs
- Phase 4: Manual verification
- Phase 5: ~100 lines UI work

**Total: ~300 lines of changes**

## Conclusion

The architecture is sound. We're removing a broken shortcut, not implementing something new. The work is straightforward deletion and cleanup, plus completing the registry defaults that should have been there all along.
