# Index: Connection Type Validation Planning (oscilla-animator-v2-wc9)

**Bead ID**: oscilla-animator-v2-wc9
**Priority**: P1 (High)
**Status**: Planning Complete - Pending Verification
**Date**: 2026-01-19

---

## Overview

This planning session addresses bead `oscilla-animator-v2-wc9`: "Add connection type validation to React Flow editor".

**Key Finding**: The feature appears to already be implemented! This planning focuses on **verification** and **gap analysis** rather than new implementation.

---

## Planning Documents

### 1. [CONTEXT.md](./CONTEXT.md)
**Purpose**: Problem analysis and current state assessment

**Key Sections**:
- Problem statement and user impact
- Existing implementation review
- Architecture analysis
- Historical context from Rete migration
- Hypotheses for why bead is still open

**Key Findings**:
- `typeValidation.ts` exists with complete validation logic
- `ReactFlowEditor.tsx` has `isValidConnection` callback integrated
- Implementation follows correct ReactFlow patterns
- Bead description may be misleading about implementation location

### 2. [PLAN.md](./PLAN.md)
**Purpose**: Verification and implementation strategy

**Key Sections**:
- Phase 1: Verification & Testing (manual test cases)
- Phase 2: Gap Analysis (compare against requirements)
- Phase 3: Enhancement (if needed - visual feedback)
- Phase 4: Documentation & Closure

**Strategy**: Verify-first approach using Chrome DevTools MCP

**Timeline Estimates**:
- If working as-is: ~25 minutes
- If enhancements needed: ~70 minutes
- If bugs found: 1-4 hours

### 3. [DOD.md](./DOD.md)
**Purpose**: Acceptance criteria and test specifications

**Key Sections**:
- Core functionality requirements
- Type compatibility rules checklist
- 8 manual test cases with expected outcomes
- Edge case testing requirements
- Success metrics table

**Completion Criteria**: All test cases pass + verification report complete

---

## Implementation Status

### What Exists
✅ **Type validation logic**: `src/ui/reactFlowEditor/typeValidation.ts`
- `validateConnection()` function
- Type compatibility checking
- Error message generation
- Port type lookup utilities

✅ **ReactFlow integration**: `src/ui/reactFlowEditor/ReactFlowEditor.tsx`
- `isValidConnection` callback (lines 152-164)
- Proper parameter passing
- Callback registered with ReactFlow component (line 295)

✅ **Type system foundation**
- 5-axis type system in `canonical-types.ts`
- Block registry with typed ports
- Compiler type checking in Pass 2

### What Needs Verification
❓ **Runtime behavior**: Does validation actually work when app runs?
❓ **Edge cases**: Polymorphic types, field instances, etc.
❓ **User feedback**: Is cursor change sufficient, or do we need tooltips?
❓ **Integration**: Are all connection types validated?

---

## Key Files

| File | Role | Status |
|------|------|--------|
| `src/ui/reactFlowEditor/typeValidation.ts` | Validation logic | ✅ EXISTS |
| `src/ui/reactFlowEditor/ReactFlowEditor.tsx` | UI integration | ✅ EXISTS |
| `src/ui/reactFlowEditor/sync.ts` | Connection handlers | ✅ EXISTS |
| `src/core/canonical-types.ts` | Type system | ✅ EXISTS |
| `src/blocks/registry.ts` | Block definitions | ✅ EXISTS |

---

## Test Cases Summary

1. **Incompatible Payload**: `float` → `color` (MUST BLOCK)
2. **Incompatible Cardinality**: `Signal` → `Field` (MUST BLOCK)
3. **Compatible Connection**: `Signal<float>` → `Signal<float>` (MUST ALLOW)
4. **Polymorphic Type**: `???` → concrete type (MUST ALLOW)
5. **Field Same Instance**: Same domain instance (MUST ALLOW)
6. **Field Different Instance**: Different domain instances (MUST BLOCK)
7. **Temporality Mismatch**: `continuous` → `discrete` (MUST BLOCK)
8. **Self-Connection**: Same block/port (MUST BLOCK)

---

## Decision Points

### For User Review

1. **Verification Approach**:
   - Option A: Manual testing via DevTools MCP (recommended)
   - Option B: Code review only (faster but less certain)

2. **If Working**:
   - Option A: Close bead immediately (minimal)
   - Option B: Add visual enhancements first (tooltips, colors)

3. **If Not Working**:
   - Debug and fix implementation
   - Re-verify after fixes

---

## Related Work

### Previous Planning
- `.agent_planning/port-type-checking/` - Earlier planning docs (2026-01-19)
- `.agent_planning/rete-removal/` - Rete migration analysis

### Historical Context
- Rete used `OscillaSocket` class with compatibility checking
- React Flow migration ported rules to `validateConnection()`
- Implementation based on Pass 2 compiler logic

### Future Enhancements (Out of Scope)
- Color-coded handles by type
- Tooltips showing error messages
- Type badges on ports
- Programmatic connection validation
- Diagnostic system integration

---

## Next Steps

1. **User Decision**: Choose verification approach (manual testing recommended)
2. **Execute Phase 1**: Run test cases against running app
3. **Document Results**: Create VERIFICATION.md with findings
4. **Assess Gaps**: Determine if enhancements needed
5. **Close or Enhance**: Based on verification results

---

## References

### Spec Documents
- `design-docs/CANONICAL-oscilla-v2.5-20260109/02-type-system.md` - Type system rules
- `design-docs/CANONICAL-oscilla-v2.5-20260109/00-invariants.md` - System invariants

### Implementation Files
- Type system: `src/core/canonical-types.ts`
- Compiler validation: `src/compiler/passes-v2/pass2-types.ts`
- Block registry: `src/blocks/registry.ts`

### Planning Artifacts
- Bead: `oscilla-animator-v2-wc9` in `.beads/issues.jsonl`
- Analysis: `.agent_planning/rete-removal/ANALYSIS-rete-vs-reactflow.md`

---

## Questions for User

1. Should we verify via manual testing (recommended) or just review code?
2. If validation works, is cursor-change feedback sufficient?
3. Do we need color-coded handles or tooltips for better UX?
4. Should we validate programmatic connections (not just user-created)?

---

## Notes

- Bead description mentions `sync.ts createConnectHandler()` as implementation location
- This is INCORRECT - validation should be in `isValidConnection` callback
- Current implementation uses correct ReactFlow pattern
- May indicate confusion about where validation should happen
