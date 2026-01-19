# Evaluation: Default Sources as Port Attributes

**Date**: 2026-01-18
**Topic**: Refactor default sources from separate blocks to port attributes
**Verdict**: CONTINUE

---

## Current State Analysis

### How Default Sources Work Today

1. **Definition Layer** (`src/blocks/registry.ts`):
   - `InputDef` has optional `defaultSource?: DefaultSource`
   - DefaultSource is a discriminated union: `'rail' | 'constant' | 'none'`
   - Block definitions declare defaults inline with port definitions

2. **Materialization Layer** (`src/graph/passes/pass1-default-sources.ts`):
   - Pass 1 scans all blocks for unconnected inputs with `defaultSource`
   - Creates `_ds_${blockId}_${portId}` derived blocks (Const blocks)
   - Creates edges from these blocks to target ports
   - Marks blocks with `role: { kind: 'derived', meta: { kind: 'defaultSource', target: ... } }`

3. **Patch Storage**:
   - Raw patch has NO default source blocks
   - After normalization, patch contains derived default source blocks
   - These blocks are visible in the normalized patch but not the raw patch

### What the User Wants

Default sources should:
1. **NOT appear as separate blocks** in the patch UI
2. **BE visible as visual modifiers** on input ports
3. **BE attributes of the port itself** in the data model
4. **BE transformed into full blocks** by graph normalization (internal, not visible)

---

## Gap Analysis

### Current Problems

1. **Visual Clutter**: If derived blocks were shown in the UI, they would clutter the graph
   - Currently not an issue because pass1 runs during normalization, not in editor context
   - But the architecture doesn't cleanly separate "user patch" from "normalized patch"

2. **Two Representations**: Default info exists in:
   - Block registry (`InputDef.defaultSource`) - static, per-block-type
   - Materialized blocks (`_ds_*`) - dynamic, per-instance

3. **No Per-Instance Defaults**: Current architecture doesn't support customizing a port's default on a per-block-instance basis

4. **Spec Conformance**: Spec says derived blocks "exist in `patch.blocks`" and are "visible in patch data model" - but the user wants them to NOT be separate blocks in the patch

### What Needs to Change

1. **Patch Type**: Add `defaultSource` attribute to input port representations in patch
2. **Serialization**: Store default sources as port attributes, not as blocks
3. **Graph Normalization**: Keep pass1 but only apply it internally for compilation
4. **UI**: Show default source indicators on ports instead of as blocks
5. **Spec Alignment**: This is a UI/UX change, not an architecture violation - derived blocks still exist at compile time

---

## Architectural Assessment

### This Change Is Spec-Compliant

The spec says:
- "Derived blocks... exist in `patch.blocks`" - This is about the NORMALIZED graph
- "Both kinds exist in the patch data. Both are compiled. Both are real." - At compile time
- "This is a presentation choice, not an architectural one" - UI filtering is allowed

The user's request aligns with spec:
- User-authored patch stores defaults as port attributes
- Graph normalization materializes them into blocks for compilation
- UI shows them as port decorators, not separate blocks

### Implementation Approach

**Option A (Recommended): Port-Level Default in Patch**

Store defaults on ports in the patch format:
```typescript
interface PatchPort {
  portId: string;
  defaultSource?: DefaultSource;  // NEW - per-instance override
}
```

- Pass1 reads from either block registry (static) OR patch port (instance override)
- UI renders default indicator on port, not as block
- Clean separation: user patch vs normalized compile-time patch

**Option B: Keep Current Architecture, UI Only**

- Keep pass1 as-is
- Just filter `_ds_*` blocks from UI rendering
- Add port visual indicators based on block registry

This is simpler but doesn't enable per-instance default customization.

---

## Risks & Dependencies

1. **Patch Format Change**: Adding `defaultSource` to ports changes the patch schema
2. **Serialization Migration**: Existing patches need migration (or rely on registry defaults)
3. **UI Work**: New port rendering logic for default indicators
4. **Spec Update**: May need to clarify "user patch vs normalized patch" distinction

---

## Recommendation

**Option A is better** because:
- Enables per-instance default customization (future capability)
- Clean separation of concerns
- More intuitive data model (defaults are port properties)

However, this should be split into sprints by confidence:

1. **HIGH Confidence**: UI changes to show defaults as port decorators
2. **MEDIUM Confidence**: Patch format changes and pass1 modifications
3. **LOW Confidence**: Spec alignment and migration strategy

---

## Files to Modify

| File | Change |
|------|--------|
| `src/graph/Patch.ts` | Add port-level default source attribute |
| `src/graph/passes/pass1-default-sources.ts` | Read from patch port or registry |
| `src/ui/reactFlowEditor/OscillaNode.tsx` | Render default indicators on ports |
| `src/ui/components/BlockInspector.tsx` | Show/edit default sources |
| `design-docs/spec/*` | Clarify user patch vs normalized patch |

---

## Questions for User (if any)

None - the requirement is clear: defaults should be port attributes, not blocks.

---

## Next Steps

1. Generate sprint plans for each confidence level
2. Start with HIGH confidence sprint (UI indicators)
3. Progress to MEDIUM confidence sprint (data model changes)
