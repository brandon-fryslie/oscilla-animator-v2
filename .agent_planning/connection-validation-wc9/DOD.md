# Definition of Done: Connection Type Validation (oscilla-animator-v2-wc9)

**Date:** 2026-01-19
**Bead ID:** oscilla-animator-v2-wc9

---

## Acceptance Criteria

### Core Functionality

- [ ] **Type validation prevents invalid connections**
  - User cannot create connections between incompatible port types
  - ReactFlow's `isValidConnection` callback returns `false` for invalid connections
  - Visual feedback indicates connection is not allowed (cursor change)

- [ ] **Type compatibility rules are enforced**
  - [ ] Payload types must match (e.g., `float` ≠ `color`)
  - [ ] Polymorphic `???` types unify with any concrete type
  - [ ] Temporality must match (`continuous` ≠ `discrete`)
  - [ ] Cardinality must match (`Signal` ≠ `Field`)
  - [ ] Field instances must match (same domainType + instanceId)
  - [ ] Self-connections are prevented (same block, same port)

- [ ] **Valid connections still work**
  - Compatible connections complete successfully
  - No false positives (blocking valid connections)

### Code Quality

- [ ] TypeScript compilation passes: `npm run typecheck`
- [ ] Build succeeds: `npm run build`
- [ ] No new console errors or warnings
- [ ] Code follows existing architecture patterns

### Testing Requirements

#### Manual Test Cases (All Must Pass)

**Test 1: Incompatible Payload Types**
- Create `Oscillator` block (outputs `Signal<float>`)
- Create block with `Signal<color>` input
- Attempt connection
- **Expected**: Connection prevented, cursor shows "not-allowed"

**Test 2: Incompatible Cardinality (Signal vs Field)**
- Create `Const` block (outputs `Signal<float>`)
- Create `Field Add` block (expects `Field<float>`)
- Attempt connection
- **Expected**: Connection prevented

**Test 3: Compatible Signal-to-Signal**
- Create two blocks with matching `Signal<float>` types
- Attempt connection
- **Expected**: Connection succeeds

**Test 4: Polymorphic Type Unification**
- Create `Const` block with polymorphic `???` output
- Connect to any typed input
- **Expected**: Connection succeeds (polymorphic unifies)

**Test 5: Field Instance Matching (Same Instance)**
- Create `Array` block (defines domain instance)
- Create two `Field` blocks using same instance
- Connect between them
- **Expected**: Connection succeeds

**Test 6: Field Instance Mismatch**
- Create two separate `Array` blocks (different instances)
- Attempt to connect field outputs requiring different instances
- **Expected**: Connection prevented

**Test 7: Temporality Mismatch**
- Create block with `continuous` output
- Create block with `discrete` (event) input
- Attempt connection
- **Expected**: Connection prevented

**Test 8: Self-Connection Prevention**
- Create any block
- Attempt to connect output to input on same block
- **Expected**: Connection prevented

### Edge Cases

- [ ] Connections during block deletion handled gracefully
- [ ] Invalid blocks (missing definitions) don't crash validation
- [ ] Multiple connections from same output still work
- [ ] Validation uses current patch state (not stale data)

### User Experience

- [ ] Visual feedback for invalid connections (minimum: cursor change)
- [ ] No user confusion about blocked connections
- [ ] Valid connections remain easy to create

### Documentation

- [ ] Verification report created documenting test results
- [ ] Any bugs found are documented
- [ ] Any deferred enhancements are documented

---

## Out of Scope (Future Work)

These are NOT required for this bead to be complete:

- Advanced visual feedback (tooltips showing WHY invalid)
- Color-coded handles by port type
- Type badges on ports
- Programmatic connection validation (only UI validation required)
- Diagnostic messages for type mismatches
- Auto-suggestion of compatible ports

---

## Verification Commands

```bash
# Type check
npm run typecheck

# Build
npm run build

# Start dev server for manual testing
npm run dev
```

---

## Completion Checklist

### Pre-Verification
- [ ] Code review confirms `isValidConnection` is implemented
- [ ] Code review confirms all type rules are checked

### Verification Phase
- [ ] Dev server started successfully
- [ ] All 8 manual test cases executed
- [ ] Test results documented in VERIFICATION.md
- [ ] Edge cases tested

### Results Assessment
- [ ] Zero false negatives (all invalid connections blocked)
- [ ] Zero false positives (all valid connections work)
- [ ] User feedback mechanism is adequate
- [ ] No console errors during testing

### Closure
- [ ] Bead updated with verification evidence
- [ ] Bead closed with reason documented
- [ ] Planning files archived or cleaned up

---

## Success Metrics

| Metric | Target | Actual |
|--------|--------|--------|
| Invalid connections blocked | 100% | TBD |
| Valid connections working | 100% | TBD |
| False positives | 0 | TBD |
| Console errors | 0 | TBD |
| Build warnings | 0 | TBD |

---

## Sign-Off Criteria

This bead is DONE when:
1. All acceptance criteria are met
2. All test cases pass
3. Verification report is complete
4. Bead is closed with evidence

**Evidence Required**: Verification report with test results and/or console logs showing validation working correctly.
