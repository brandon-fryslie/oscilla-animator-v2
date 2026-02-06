# Definition of Done: eslint-enforcement
Generated: 2026-02-06 15:00:00
Status: READY FOR IMPLEMENTATION
Plan: SPRINT-20260206-150000-eslint-enforcement-PLAN.md

## Acceptance Criteria

### Write ESLint rule forbidding impure builder calls in lower()
- [ ] Rule file exists at `eslint-rules/no-impure-lower.js`
- [ ] Rule detects `ctx.b.allocSlot()` calls inside `lower()` and reports error
- [ ] Rule detects `ctx.b.stepSlotWriteStrided()` calls inside `lower()` and reports error
- [ ] Rule detects `ctx.b.registerSigSlot()` calls inside `lower()` and reports error
- [ ] Rule does NOT flag calls outside of `lower()` functions

### Configure ESLint to run the rule
- [ ] Rule is imported and registered in `eslint.config.js` plugin block
- [ ] Rule is enabled at `'error'` level for `src/blocks/**/*.ts` files
- [ ] `npx eslint src/blocks/` reports violations for known impure blocks

### Audit and address all violations
- [ ] All violations categorized: "to fix in Sprint 3", "intentionally impure", or "unexpected"
- [ ] Intentionally impure blocks have eslint-disable comments with rationale
- [ ] `domain-index.ts` has `loweringPurity` annotation added
- [ ] No unexpected violations remain unaddressed

## Verification
- [ ] `npx eslint --no-error-on-unmatched-pattern eslint-rules/no-impure-lower.js` parses without errors
- [ ] `npx eslint src/blocks/signal/const.ts` reports at least one `oscilla/no-impure-lower` error
- [ ] After Sprint 3 fixes are applied, `npx eslint src/blocks/` has zero `no-impure-lower` errors
