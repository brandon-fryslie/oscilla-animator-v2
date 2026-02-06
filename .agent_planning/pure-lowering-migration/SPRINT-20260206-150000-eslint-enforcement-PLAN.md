# Sprint: eslint-enforcement - ESLint Pure Lowering Enforcement
Generated: 2026-02-06 15:00:00
Confidence: HIGH: 3, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION
Source: EVALUATION-20260206-143000.md

## Sprint Goal
Write and configure an ESLint rule that mechanically enforces the pure lowering contract: block `lower()` functions must not call `ctx.b.allocSlot()`, `ctx.b.stepSlotWriteStrided()`, or `ctx.b.registerSigSlot()`.

## Scope
**Deliverables:**
- Custom ESLint rule `no-impure-lower` forbidding imperative builder calls in lower()
- Configuration in eslint.config.js
- Audit and fix all violations (or mark blocks as intentionally impure)

## Work Items

### P0 - Write ESLint rule forbidding impure builder calls in lower()

**Dependencies**: None
**Spec Reference**: PURE-LOWERING-TODO.md "Define the invariant: outputs are produced by eval steps, never by direct slot writes"
**Status Reference**: EVALUATION-20260206-143000.md "No Enforcement Mechanism Exists"

#### Description
Create a new ESLint rule at `eslint-rules/no-impure-lower.js` that forbids the following method calls inside `lower:` property functions:
- `ctx.b.allocSlot()` -- blocks must use `effects.slotRequests` instead
- `ctx.b.stepSlotWriteStrided()` -- blocks must use construct() expressions instead
- `ctx.b.registerSigSlot()` -- orchestrator handles signal slot registration

The rule should:
1. Track when execution is inside a `lower:` property arrow/function expression (same pattern as existing `no-defaults-in-lower.js`)
2. Detect `MemberExpression` → `CallExpression` patterns matching `ctx.b.allocSlot`, `ctx.b.stepSlotWriteStrided`, `ctx.b.registerSigSlot`
3. Report with clear message explaining what to use instead

Blocks marked `loweringPurity: 'impure'` should be exempt. The rule can check for a `loweringPurity` property sibling in the registerBlock call. Alternatively, use ESLint disable comments for known-impure blocks (simpler, more explicit).

#### Acceptance Criteria
- [ ] Rule file exists at `eslint-rules/no-impure-lower.js`
- [ ] Rule detects `ctx.b.allocSlot()` calls inside `lower()` and reports error
- [ ] Rule detects `ctx.b.stepSlotWriteStrided()` calls inside `lower()` and reports error
- [ ] Rule detects `ctx.b.registerSigSlot()` calls inside `lower()` and reports error
- [ ] Rule does NOT flag calls outside of `lower()` functions

#### Technical Notes
- Follow the exact pattern used by `eslint-rules/no-defaults-in-lower.js` for tracking `insideLower` state.
- The forbidden methods are accessed through `ctx.b` member expressions. Match on the terminal method name: `allocSlot`, `stepSlotWriteStrided`, `registerSigSlot`.
- Consider also forbidding `ctx.b.stepEvalSig()` and `ctx.b.stepMaterialize()` for completeness (these are also imperative schedule mutations).

---

### P0 - Configure ESLint to run the rule

**Dependencies**: Rule written
**Spec Reference**: N/A (tooling)
**Status Reference**: EVALUATION-20260206-143000.md "No Enforcement Mechanism Exists"

#### Description
Add the new rule to `eslint.config.js` in the existing `src/blocks/**/*.ts` configuration block. Set it to `'error'` severity.

#### Acceptance Criteria
- [ ] Rule is imported and registered in `eslint.config.js` plugin block
- [ ] Rule is enabled at `'error'` level for `src/blocks/**/*.ts` files
- [ ] `npx eslint src/blocks/` reports violations for known impure blocks (const.ts, expression.ts, external-vec2.ts, default-source.ts)

#### Technical Notes
- Add import: `import noImpureLower from './eslint-rules/no-impure-lower.js';`
- Add to plugin rules: `'no-impure-lower': noImpureLower`
- Add to rules: `'oscilla/no-impure-lower': 'error'`

---

### P1 - Audit and address all violations

**Dependencies**: Rule configured and running
**Spec Reference**: PURE-LOWERING-TODO.md full migration scope
**Status Reference**: EVALUATION-20260206-143000.md "ESLint enforcement may reveal more violations"

#### Description
Run `npx eslint src/blocks/` and categorize all violations:
1. **Already known (4 blocks)**: const.ts, expression.ts, external-vec2.ts, default-source.ts -- these will be fixed in Sprint 3
2. **Intentionally impure**: render-instances-2d.ts, camera.ts, external-input.ts, external-gate.ts, infinite-time-root.ts -- add `eslint-disable` comments with rationale
3. **Unexpected violations**: Any other blocks found -- assess and plan fixes

Also check for blocks missing `loweringPurity` annotations (evaluation noted `domain-index.ts` is missing one).

#### Acceptance Criteria
- [ ] All violations are categorized as: "to fix in Sprint 3", "intentionally impure", or "unexpected"
- [ ] Intentionally impure blocks have `eslint-disable-next-line oscilla/no-impure-lower` comments with rationale
- [ ] `domain-index.ts` has `loweringPurity` annotation added
- [ ] No unexpected violations remain unaddressed
- [ ] After Sprint 3 fixes, `npx eslint src/blocks/` passes with zero errors from this rule

#### Technical Notes
Known impure blocks (per loweringPurity annotations):
- `render/render-instances-2d.ts` -- loweringPurity: 'impure'
- `render/camera.ts` -- loweringPurity: 'impure'
- `io/external-input.ts` -- loweringPurity: 'impure'
- `io/external-gate.ts` -- loweringPurity: 'impure'
- `time/infinite-time-root.ts` -- loweringPurity: 'impure'
- `io/external-vec2.ts` -- loweringPurity: 'impure' (will be migrated in Sprint 3)

Blocks currently lacking loweringPurity annotation:
- `domain/domain-index.ts`
- `signal/const.ts`
- `math/expression.ts`

## Dependencies
- None (can run in parallel with Sprint 1)

## Risks
- **More violations than expected**: The grep search found `allocSlot` calls in `.bak` files too, but those are not `.ts` so ESLint should skip them. However, there may be blocks we haven't identified.
- **Existing ESLint errors**: The evaluation noted 46 existing ESLint errors. The new rule should not be blocked by existing errors.
