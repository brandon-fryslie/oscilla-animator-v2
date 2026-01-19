# Sprint: Remove inputDefaults System and Implement Correct Default Source Architecture

Generated: 2026-01-19
Confidence: **HIGH**
Status: READY FOR IMPLEMENTATION

---

## CRITICAL: READ THIS ENTIRE DOCUMENT BEFORE WRITING ANY CODE

This document exists because someone previously implemented the **completely wrong architecture**. The original request was "render default sources differently on the patch UI". What was built instead was a parallel value system (`inputDefaults`) that **bypasses the entire block params system**.

**DO NOT:**
- Create any new fields on Block that store values
- Create any system that bypasses block params
- Create hardcoded constants that ignore user edits
- "Optimize" by skipping the normalization step

**THE CORRECT ARCHITECTURE IS ALREADY DEFINED IN THE SPEC. FOLLOW IT.**

---

## The Correct Architecture (From Spec)

### How Default Sources Work (Spec: 02-block-system.md, 04-compilation.md)

```
USER EDITS PARAMS          NORMALIZATION              COMPILATION
      │                         │                          │
      ▼                         ▼                          │
┌─────────────┐          ┌─────────────┐                   │
│ Block       │          │ Block       │                   │
│ ├─ params   │───────▶  │ (unchanged) │                   │
│ │  ├─ foo   │          └─────────────┘                   │
│ │  └─ bar   │                 │                          │
│ └─ inputs[] │                 │                          │
│    (unconnected)              │                          │
└─────────────┘                 ▼                          │
                         ┌─────────────┐                   │
                         │ DefaultSource│ (DERIVED BLOCK)  │
                         │ Block        │                  │
                         │ ├─ outputs   │───────▶  IR      │
                         │ │  └─ value  │────┐             │
                         │ └─ reads from│    │             │
                         │    block.params   │             │
                         └─────────────┘    │             │
                                │           │             │
                                ▼           ▼             ▼
                         ┌─────────────┐  Edge to   CompiledProgramIR
                         │ Default Edge │  input    (slot-addressed)
                         │ role: default│
                         └─────────────┘
```

### Key Points

1. **Block.params** is the SINGLE SOURCE OF TRUTH for editable values
2. **GraphNormalization** creates DefaultSource derived blocks for unconnected inputs
3. **DefaultSource blocks read from block.params** - they don't have their own values
4. **Inspector edits block.params** → normalization recreates DefaultSource → compilation uses new value
5. **The UI shows a badge/indicator** on ports using default sources (this is what was originally requested)

### The Invariants (MUST NOT BE VIOLATED)

- **I26**: Every input has a source (DefaultSource always connected during normalization)
- **I6**: Compiler never mutates the graph
- **Everything is a block**: DefaultSources are derived blocks, not magic values

---

## What The `inputDefaults` System Does Wrong

The current broken system:

```typescript
// WRONG - This bypasses block.params entirely
const block = b.addBlock('RenderInstances2D', {}, {
  inputDefaults: {
    size: constant(3),  // This is NOT connected to any param!
  },
});
```

When user edits "size" in inspector:
1. Inspector updates `block.params.size` ✅
2. Recompile happens ✅
3. **BUT** Pass1 sees `inputDefaults.size` and uses THAT instead ❌
4. User's edit is ignored ❌

This is fundamentally broken.

---

## Sprint Goal

**Remove the `inputDefaults` system entirely and ensure default sources work through the correct architecture: block params → normalization → derived DefaultSource blocks → compilation.**

---

## Deliverables

### P0: Remove inputDefaults from Codebase

**Files to modify:**

| File | Change |
|------|--------|
| `src/graph/Patch.ts` | Remove `inputDefaults` field from Block interface and PatchBuilder options |
| `src/graph/passes/pass1-default-sources.ts` | Remove the `inputDefaults` override check |
| `src/stores/PatchStore.ts` | Remove `inputDefaults` handling in updateBlockDefaultSource |
| `src/ui/reactFlowEditor/nodes.ts` | Remove `inputDefaults` check for port display |

**Acceptance Criteria:**
- [ ] `inputDefaults` field does not exist on Block type
- [ ] `inputDefaults` option does not exist on PatchBuilder.addBlock
- [ ] Pass1 does NOT check for any per-block override - it only uses registry defaults
- [ ] TypeScript compiles with no errors
- [ ] Grep for `inputDefaults` returns zero results in src/

### P1: Fix Demo Patches in main.ts

The demo patches currently use `inputDefaults` everywhere. They need to be rewritten to use the correct architecture.

**Option A (Preferred): Use registry defaults**
- Remove all `inputDefaults` from addBlock calls
- Let the BlockSpec registry defaults apply
- Normalization will create DefaultSource blocks automatically

**Option B (If specific values needed): Wire explicit blocks**
- Create actual Const blocks
- Wire them to inputs
- These are real user-authored blocks, not derived

**Acceptance Criteria:**
- [ ] No `inputDefaults` in any addBlock call
- [ ] Demo patches compile and run
- [ ] Params edited in inspector affect visual output

### P2: Verify Default Source Architecture Works

After removal, verify the correct flow:

1. Block has unconnected input
2. Input has `defaultSource` in BlockSpec (registry)
3. Normalization creates DefaultSource derived block
4. DefaultSource block's output connects to input via default edge
5. **Value comes from block.params** (editable!)

**Acceptance Criteria:**
- [ ] Unconnected inputs get DefaultSource blocks during normalization
- [ ] Editing a block's param in inspector changes the compiled output
- [ ] The correct architecture diagram above matches the actual code flow

### P3: UI Visual Differentiation (THE ORIGINAL REQUEST)

This was the **actual original request**: show default sources differently in the UI.

**What this means:**
- Ports using default sources should have a visual indicator (badge, different color, icon)
- This is a **UI-only** change - no changes to the data model
- The UI reads from the normalized graph to see which edges are `role: 'default'`

**Acceptance Criteria:**
- [ ] Ports with default source connections are visually distinct from explicitly wired ports
- [ ] The visual indicator is clear but not distracting
- [ ] Clicking the indicator could open inspector to edit the default value (future enhancement)

---

## Files Involved

```
src/graph/Patch.ts                        # Block type, PatchBuilder
src/graph/passes/pass1-default-sources.ts # Normalization pass
src/stores/PatchStore.ts                  # Store methods
src/ui/reactFlowEditor/nodes.ts           # Node rendering
src/main.ts                               # Demo patches
```

---

## What NOT To Do

### DO NOT create a new field on Block to store default values
The block's `params` already stores editable values. DefaultSource blocks read from params.

### DO NOT bypass normalization
Normalization is where DefaultSource blocks get created. The compiler consumes normalized graphs.

### DO NOT create "convenience" shortcuts that skip the architecture
The architecture exists for a reason. Every shortcut creates a maintenance nightmare.

### DO NOT hardcode values in addBlock calls
If you need a specific value, either:
1. Set it in the block's params (editable)
2. Create an explicit Const block and wire it (visible in graph)

### DO NOT confuse "default source" with "hardcoded constant"
- **Default source**: A derived block that provides a fallback value, reading from block params
- **Hardcoded constant**: A fixed value that ignores user input (WRONG)

---

## Testing Strategy

1. **Type check**: `npm run typecheck` passes
2. **Unit tests**: All existing tests pass (may need updates if tests used inputDefaults)
3. **Manual test**:
   - Load app
   - Edit a block param in inspector
   - Verify visual output changes
4. **Grep verification**: `grep -r "inputDefaults" src/` returns nothing

---

## Spec References

- `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/02-block-system.md` - Default Sources section
- `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/04-compilation.md` - GraphNormalization, anchor-based IDs
- `design-docs/CANONICAL-oscilla-v2.5-20260109/INVARIANTS.md` - I26 (every input has source)
- `design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md` - DefaultSource overview

---

## Summary

**Remove `inputDefaults`. It should never have existed. The correct architecture is already in the spec: params → normalization → DefaultSource blocks → compilation. Follow it.**
