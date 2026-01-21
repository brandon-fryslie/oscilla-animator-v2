# Definition of Done: Patch Export for LLM

**Sprint:** patch-export
**Generated:** 2026-01-20

---

## Acceptance Criteria

### Core Functionality

- [ ] **Export produces valid markdown** - Output parses as valid markdown with tables, headers, code blocks
- [ ] **Blocks listed correctly** - All blocks appear in summary table with ID, type, and non-default config
- [ ] **Connections shown as arrows** - Edge notation: `b1.portName → b2.portName`
- [ ] **Default values omitted** - Only non-default values appear in Block Details section
- [ ] **Compile status included** - Shows ✓ success or ❌ failure with error message

### UI Integration

- [ ] **Export button visible** - Button appears in toolbar with clear labeling
- [ ] **Keyboard shortcut works** - Ctrl+Shift+E triggers export from graph editor
- [ ] **Clipboard populated** - Exported markdown copied to system clipboard
- [ ] **User feedback shown** - Toast confirms success or reports failure

### Quality

- [ ] **TypeScript compiles** - No type errors
- [ ] **Unit tests pass** - Format utilities tested with edge cases
- [ ] **Manual test passes** - Export a sample patch, paste into LLM, verify readability

---

## Verification Checklist

### Test Case 1: Empty Patch
```
Input: Patch with no blocks, no edges
Expected: Minimal output showing "0 blocks, 0 edges"
```

### Test Case 2: Simple Patch (All Defaults)
```
Input: Single Array block with default count=100
Expected: Block appears but config column empty (no non-defaults)
```

### Test Case 3: Configured Patch
```
Input: Array(count=5000) → CircleLayout → Render chain
Expected:
- Blocks table shows count=5000 for Array
- Connections show proper arrows
- Block Details shows "count: 5000 (default: 100)"
```

### Test Case 4: Patch with Expressions
```
Input: HSVColor block with h=index*0.1
Expected: Expression displayed as-is: h=index*0.1
```

### Test Case 5: Compile Error State
```
Input: Patch that fails to compile (e.g., disconnected required port)
Expected: Compile status shows ❌ with error message
```

---

## Exit Criteria

This sprint is DONE when:

1. All acceptance criteria checked off
2. All test cases pass (manual verification acceptable for UI tests)
3. No regressions in existing functionality
4. Code reviewed for:
   - Proper separation of concerns (service vs UI)
   - Consistent error handling
   - No hardcoded magic strings
