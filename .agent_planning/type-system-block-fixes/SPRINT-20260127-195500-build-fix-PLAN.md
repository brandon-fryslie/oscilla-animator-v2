# Sprint: build-fix - Fix TypeScript Build Errors

**Generated**: 2026-01-27-195500
**Confidence**: HIGH: 3, MEDIUM: 1, LOW: 0
**Status**: READY FOR IMPLEMENTATION

## Sprint Goal

Fix 4 TypeScript compilation errors that block `npm run build` and verify path-field-demo works.

## Scope

**Deliverables:**
1. Fix DiagnosticHub.ts type errors (lines 440, 450)
2. Fix HealthMonitor.ts missing createDiagnostic (lines 316, 336, 351)
3. Fix DiagnosticsStore.ts type error (line 288)
4. Verify path-field-demo.ts runs in browser

## Work Items

### P0: Fix DiagnosticHub.ts Type Errors [HIGH]

**Acceptance Criteria:**
- [ ] Line 440: `{ severity }` changed to `{ severity: [severity] }`
- [ ] Line 450: `{ domain }` changed to `{ domain: [domain] }`
- [ ] `npm run typecheck` shows no errors in DiagnosticHub.ts

**Technical Notes:**
- DiagnosticFilter interface expects arrays for severity and domain fields
- Single value → array wrapping is the fix

### P0: Fix HealthMonitor.ts Missing Function [HIGH]

**Acceptance Criteria:**
- [ ] `createDiagnostic` helper exists and is exported from `src/diagnostics/types.ts`
- [ ] Import on line 21 is uncommented
- [ ] `npm run typecheck` shows no errors in HealthMonitor.ts

**Technical Notes:**
- Create a simple helper that constructs a Diagnostic object with type safety
- Signature: `createDiagnostic(params: Partial<Diagnostic> & Required<Pick<Diagnostic, 'code' | 'severity' | 'domain' | 'title' | 'message'>>): Diagnostic`
- Helper should add default values for optional fields (timestamp, id)

### P0: Fix DiagnosticsStore.ts Type Error [HIGH]

**Acceptance Criteria:**
- [ ] Line 288: `{ severity: 'warn' }` changed to `{ severity: ['warn'] }`
- [ ] `npm run typecheck` shows no errors in DiagnosticsStore.ts

**Technical Notes:**
- Same pattern as DiagnosticHub.ts fix

### P1: Verify path-field-demo.ts [MEDIUM]

**Acceptance Criteria:**
- [ ] Demo loads in browser without console errors
- [ ] Star shape with rainbow colors renders
- [ ] If 3D helix doesn't work, revert to 2D version and document reason

**Technical Notes:**
- Clear localStorage before testing (`localStorage.clear()`)
- Check browser console for runtime errors
- PathField outputs (arcLength, tangent) are implemented; if demo fails, issue is elsewhere

#### Unknowns to Resolve
- Does Multiply block handle Field×Signal correctly?
- Is there a kernel registration issue?

#### Exit Criteria
- Console shows no errors OR root cause identified and documented

## Dependencies

- None - this is foundation work

## Risks

| Risk | Mitigation |
|------|------------|
| createDiagnostic function more complex than expected | Inline object construction as fallback |
| path-field-demo has deeper issues | Revert to working 2D version, create new ticket |

## Estimated Scope

- TypeScript fixes: ~15 minutes
- Demo verification: ~30 minutes (includes debugging if needed)
- Total: ~45 minutes
