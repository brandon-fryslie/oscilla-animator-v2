# Sprint: feature-completion - Render Feature Gaps

Generated: 2026-01-26
Confidence: HIGH: 1, MEDIUM: 3, LOW: 0
Status: PARTIALLY READY

## Sprint Goal

Complete render pipeline features that have IR/runtime support but missing block-level wiring.

## Scope

**Deliverables:**
- Wire rotation and scale2 inputs through RenderInstances2D block to IR
- Fix StepRender shape/scale optionality to match runtime requirements
- Add turns parameter to fieldGoldenAngle kernel
- Implement PureFn 'expr' kind for Expression DSL runtime

## Work Items

### P0: Wire rotation and scale2 through IR to RenderAssembler [HIGH]

**Bead:** ms5.15
**Acceptance Criteria:**
- [ ] RenderInstances2D block has optional `rotation` input (Field<float, radians>)
- [ ] RenderInstances2D block has optional `scale2` input (Field<vec2>)
- [ ] Block lowering emits `rotationSlot` and `scale2Slot` in StepRender when inputs connected
- [ ] RenderAssembler correctly reads and applies these slots (already implemented)
- [ ] Test: render with per-instance rotation produces correct visual output

**Technical Notes:**
- RenderAssembler already has full support (lines 762-853)
- Missing: Block input definitions in `src/blocks/render-blocks.ts`
- Missing: Block lowering in the render block's `lower()` function
- IR types already define the slots (`StepRender.rotationSlot`, `StepRender.scale2Slot`)

### P1: Fix StepRender.shape/scale optionality [MEDIUM]

**Bead:** ms5.14
**Acceptance Criteria:**
- [ ] Determine: Should shape be required or optional at IR level?
- [ ] If required: Make `StepRender.shape` non-optional, update all emission sites
- [ ] If optional: Document default behavior clearly
- [ ] Types match runtime enforcement (no runtime error for valid IR)

**Technical Notes:**
- Current IR has `shape?` as optional
- Runtime may assume shape exists - need to verify behavior
- If runtime has default, document it; if runtime throws, make type required

#### Unknowns to Resolve
- What happens at runtime when `shape` is undefined?
- What is the intended default shape behavior?

#### Exit Criteria
- Verified runtime behavior matches type optionality
- No type/runtime mismatch

### P2: Make fieldGoldenAngle turns configurable [MEDIUM]

**Bead:** ms5.13
**Acceptance Criteria:**
- [ ] `fieldGoldenAngle` kernel accepts turns as parameter (not hardcoded 50)
- [ ] Default value is 50 for backward compatibility
- [ ] GoldenAngle block (if exists) exposes turns as optional input
- [ ] Test: custom turns value produces correct spiral pattern

**Technical Notes:**
- Location: `src/runtime/FieldKernels.ts:384`
- Current: Hardcoded `turns=50`
- Change: Add to kernel signature, default to 50
- May need to update `FieldExprKernel` invocation sites

#### Unknowns to Resolve
- Is GoldenAngle exposed as a user-facing block?
- What blocks use fieldGoldenAngle kernel?

#### Exit Criteria
- Kernel accepts turns parameter
- Existing usage works with default

### P3: Implement PureFn 'expr' kind in SignalEvaluator [MEDIUM]

**Bead:** ms5.17
**Acceptance Criteria:**
- [ ] `applyPureFn` handles `'expr'` kind without throwing
- [ ] Expression DSL expressions can be compiled to PureFn and evaluated
- [ ] Test: simple expression like `x * 2 + 1` works through PureFn

**Technical Notes:**
- Location: `src/runtime/SignalEvaluator.ts:227-228`
- Current: `throw new Error("PureFn kind 'expr' not yet implemented")`
- Need to understand: What is the `fn.expr` structure? How to evaluate?
- May need to integrate with Expression DSL parser/evaluator

#### Unknowns to Resolve
- What is the PureFn.expr structure (AST, string, compiled bytecode)?
- Is there an existing expression evaluator to call?
- What inputs/outputs does expr expect?

#### Exit Criteria
- Can evaluate simple arithmetic expressions
- No throw on 'expr' kind

## Dependencies

- P0 (rotation/scale2) is independent - HIGH confidence
- P1-P3 have unknowns that may require research

## Risks

- **Medium risk for P1-P3**: Unknowns may expand scope
- **Mitigation**: Research first, implement second
- **Low risk for P0**: Full runtime support exists, just block wiring
