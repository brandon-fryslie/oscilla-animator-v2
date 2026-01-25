# Definition of Done: Multi-Component Signal Support via Strided Value Slots

**Sprint**: SPRINT-20260125-multicomponent-signals
**Status**: READY FOR IMPLEMENTATION
**Confidence**: HIGH
**Spec**: CANONICAL-SPEC-multicomponent-signals.md

## Acceptance Criteria

### P0: Strided Slot Allocation
- [ ] `allocSlot(stride: number = 1)` accepts stride parameter
- [ ] Returns base slot for contiguous region of length stride
- [ ] Slot allocator increments by stride
- [ ] Existing stride=1 behavior unchanged

### P1: StepSlotWriteStrided IR Node
- [ ] New step type `StepSlotWriteStrided` added to IR
- [ ] Contains `slotBase: ValueSlot` and `inputs: SigExprId[]`
- [ ] Constraint: `inputs.length` must equal output stride

### P2: ScheduleExecutor Strided Write
- [ ] Executes `StepSlotWriteStrided` by evaluating each component
- [ ] Writes `evaluateSignal(inputs[i])` to `values.f64[slotBase + i]`
- [ ] No changes to SignalEvaluator (stays scalar-only)

### P3: IRBuilder API
- [ ] `stepSlotWriteStrided(slotBase, inputs[])` method added
- [ ] Emits the new step type

### P4: Lowering Helper for Component Read
- [ ] `sigSlotRead(slot + i)` pattern works for reading components
- [ ] Or helper `readSigComponent(inputValue, componentIndex)` added

### P5: Block Refactors - Remove Pack Kernels
- [ ] Const<vec2> uses strided slot write, not sigZip with packVec2
- [ ] Const<color> uses strided slot write, not sigZip with packColor
- [ ] PolarToCartesian signal path uses strided slot write
- [ ] OffsetVec signal path uses strided slot write
- [ ] SetZ signal path uses strided slot write
- [ ] JitterVec signal path uses strided slot write

### P6: Tests
- [ ] Unit test: StepSlotWriteStrided writes to correct slots
- [ ] Integration test: Const<vec2> produces correct slot values
- [ ] End-to-end: signal-only vec3 pipeline compiles and executes

## Global Success Criteria

- [ ] SignalEvaluator unchanged (scalar-only contract preserved)
- [ ] No array-returning signal APIs
- [ ] No kernel side effects writing to slots
- [ ] TypeScript compilation succeeds
- [ ] All tests pass
- [ ] vec2-to-vec3-migration unblocked

## Non-negotiable Prohibitions (from spec)

- ❌ No array-returning signal evaluation APIs
- ❌ No kernel side effects that write directly into slot storage
- ❌ No "strideMap" keyed by SigExprId
- ❌ No new semantics in SignalEvaluator beyond scalar evaluation

## Verification Commands

```bash
npm run typecheck
npm run test
```
