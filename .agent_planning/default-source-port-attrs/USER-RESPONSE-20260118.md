# User Response: Default Sources as Port Attributes

**Date**: 2026-01-18
**Status**: PENDING APPROVAL

## Plan Summary

The user requested that default sources should NOT appear as separate blocks in the patch. Instead, they should be visible as visual modifiers on input ports, with the default source being an attribute of the port itself that gets transformed into a full block by graph normalization.

## Sprints Planned

### Sprint 1: patch-format (HIGH Confidence)

**Goal**: Add port-level default source attributes to Block type, enabling per-instance default customization.

**Deliverables**:
1. Add `inputDefaults?: Record<string, DefaultSource>` to Block type
2. Modify pass1 to check block instance before registry
3. Add PatchStore method to update input defaults
4. Update UI to show default indicators on ports

**Work Items**:
- P0: Update Block type in `src/graph/Patch.ts`
- P1: Modify pass1 in `src/graph/passes/pass1-default-sources.ts`
- P2: Add PatchStore action in `src/stores/PatchStore.ts`
- P3: Update UI in `src/ui/reactFlowEditor/` (nodes.ts, OscillaNode.tsx)

**Key Architecture Decision**: Store defaults as optional `inputDefaults` map on Block, not as separate blocks. Graph normalization (pass1) creates derived blocks internally for compilation, but these are never shown to the user.

## Research Completed

- Confirmed current Block type has no port-level data
- Confirmed no patch serialization exists (no migration needed)
- Confirmed pass1 location and how it reads defaults
- Confirmed UI structure and where to add indicators

## Files to Modify

| File | Change |
|------|--------|
| `src/graph/Patch.ts` | Add `inputDefaults` to Block interface |
| `src/graph/passes/pass1-default-sources.ts` | Check instance defaults before registry |
| `src/stores/PatchStore.ts` | Add `updateBlockInputDefault` action |
| `src/ui/reactFlowEditor/nodes.ts` | Include defaultSource in port data |
| `src/ui/reactFlowEditor/OscillaNode.tsx` | Render default indicators |

## Approval Request

Please approve this plan to proceed with implementation.

- [ ] Approved - proceed with implementation
- [ ] Revise - changes needed (specify below)
- [ ] Reject - different approach needed
