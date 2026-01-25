# Sprint: multicomponent-signals - Full Multi-Component Signal Support

Generated: 2026-01-25
Confidence: HIGH: 2, MEDIUM: 2, LOW: 0
Status: PARTIALLY READY

## Sprint Goal

Enable the signal evaluator to handle multi-component values (vec2, vec3, vec4, color) using contiguous scalar slots.

## Approach: Scalar Component Decomposition

Store vec2 in slots [n, n+1], vec3 in [n, n+1, n+2], color in [n, n+1, n+2, n+3].
This works within the existing scalar-based architecture without changing the evaluateSignal return type.

## Scope

**Deliverables:**
1. Update slot allocation to support stride > 1
2. Implement multi-component signal kernels
3. Update existing blocks to use new kernels correctly
4. Add tests for multi-component signal paths

**NOT changing:**
- evaluateSignal return type (stays `number`)
- Field kernels (already work)

## Work Items

### P0: Stride-aware Slot Allocation [HIGH]

**Acceptance Criteria:**
- [ ] IRBuilder.allocSlot() accepts optional stride parameter
- [ ] Slots are allocated contiguously for stride > 1
- [ ] Slot metadata tracks stride
- [ ] No changes to existing stride=1 behavior

**Technical Notes:**
- File: src/compiler/ir/IRBuilderImpl.ts
- Existing `allocSlot()` returns ValueSlot
- Add stride to ValueSlot or track separately

---

### P1: Multi-Component Signal Write [HIGH]

**Acceptance Criteria:**
- [ ] `writeF64Multi(state, lookup, values: number[])` implemented
- [ ] Writes to contiguous slots [offset, offset+1, ...]
- [ ] Validates values.length matches stride
- [ ] Connected to signal evaluation path

**Technical Notes:**
- File: src/runtime/ScheduleExecutor.ts
- `writeF64Strided` exists but needs connection to signal path
- May need new step type for multi-component signal writes

---

### P2: Pack/Unpack Signal Kernels [MEDIUM]

**Acceptance Criteria:**
- [ ] `packVec2` kernel: [x, y] → writes to 2 contiguous slots
- [ ] `packVec3` kernel: [x, y, z] → writes to 3 contiguous slots
- [ ] `packColor` kernel: [r, g, b, a] → writes to 4 contiguous slots
- [ ] All kernels registered in SignalEvaluator
- [ ] kernel-signatures.ts updated

**Technical Notes:**
- File: src/runtime/SignalEvaluator.ts
- These kernels don't "return" values - they write to pre-allocated slots
- May need different kernel invocation pattern than scalar kernels

**Unknowns to Resolve:**
- How do signal kernels write to multiple slots? (evaluate returns single number)
- Option 1: Return Float64Array, caller writes
- Option 2: Pass slot references to kernel, kernel writes directly
- Option 3: Chain multiple scalar writes

**Exit Criteria:**
- Clear mechanism chosen for multi-slot writes from signal kernels

---

### P3: Update Blocks to Use Multi-Component Signals [MEDIUM]

**Acceptance Criteria:**
- [ ] Const<vec2> uses packVec2 correctly
- [ ] Const<color> uses packColor correctly
- [ ] PolarToCartesian uses packVec3 or vec3FromComponents
- [ ] OffsetVec signal path works
- [ ] SetZ signal path works
- [ ] JitterVec signal path works

**Technical Notes:**
- Files: signal-blocks.ts, geometry-blocks.ts, field-operations-blocks.ts
- Each block's signal path needs to allocate stride-appropriate slots
- May need to call sigZip differently for multi-component outputs

**Unknowns to Resolve:**
- How does sigZip handle multi-component outputs?
- Does IR need new expression type for multi-component signals?

**Exit Criteria:**
- All blocks with multi-component signal outputs compile and work

---

### P4: Tests [HIGH - but added after P2/P3 resolve]

**Acceptance Criteria:**
- [ ] Test Const<vec2> signal output
- [ ] Test Const<color> signal output
- [ ] Test PolarToCartesian with pure signal inputs
- [ ] Test OffsetVec with pure signal inputs
- [ ] Test SetZ with pure signal inputs

**Technical Notes:**
- Add to existing test files
- Test both compilation and runtime execution

## Dependencies

- vec2-to-vec3-migration (in progress) - shares some blocks

## Risks

1. **sigZip architecture**: May need IR changes if sigZip can't handle stride > 1
2. **Performance**: Multiple slot writes per signal may be slower than field path
3. **Complexity**: Slot allocation becomes more complex with variable strides

## Alternative: Hybrid Approach

If P2/P3 unknowns prove too complex, fallback to:
1. Remove pure-signal paths from multi-component blocks
2. Force broadcast to field for all multi-component operations
3. Document limitation

This unblocks immediately with lower risk.

## Verification

```bash
npm run typecheck
npm run test
```
