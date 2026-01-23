# Sprint: deprecation-warnings - Remove Deprecated Signal Kernels

Generated: 2026-01-22
Confidence: HIGH
Status: READY FOR IMPLEMENTATION
Bead: oscilla-animator-v2-ms5.10

## Sprint Goal

Delete the deprecated signal kernels (sin/cos/tan) entirely. Migrate any references to their replacements (oscSin/oscCos/oscTan). No shims, no warnings, no backwards compatibility.

## Work Items

### P0: Migrate all usages of deprecated kernels to replacements

**Find and replace:**
- `sin` → `oscSin`
- `cos` → `oscCos`
- `tan` → `oscTan`

In all block definitions, patch files, test fixtures, and any other references.

### P1: Delete deprecated kernel cases from SignalEvaluator

**File:** `src/runtime/SignalEvaluator.ts`

Remove the `case 'sin':`, `case 'cos':`, `case 'tan':` branches entirely.

### P2: Delete deprecated kernel entries from kernel-signatures

**File:** `src/runtime/kernel-signatures.ts`

Remove the legacy alias entries and any "DEPRECATED" comments.

### P3: Verify

- TypeScript compiles
- All tests pass
- No remaining references to the deprecated names

## Acceptance Criteria

- [ ] No `sin`/`cos`/`tan` kernel references remain anywhere in the codebase (as signal kernel names)
- [ ] All usages migrated to `oscSin`/`oscCos`/`oscTan`
- [ ] Deprecated code paths deleted completely
- [ ] Tests pass, types check
