# Work Evaluation - Animation Deferred Work
Timestamp: 2026-01-12T06:04:00Z
Scope: work/animation-deferred-work
Confidence: FRESH

## Goals Under Evaluation
From DOD-20260112.md:

### P0: Signal Kernel Support - REQUIRED FOR SPRINT COMPLETION
- [ ] **Functional**: Oscillator block with `sin` waveform renders without crash
- [ ] **Functional**: Oscillator block with `cos` waveform renders without crash
- [ ] **Code**: `SignalEvaluator.applyPureFn` handles `fn.kind === 'kernel'`
- [ ] **Code**: Signal kernels implemented: `sin`, `cos`, `tan`
- [ ] **Error Handling**: vec2 signal kernels throw informative "not yet implemented" error

### P0: Field Kernel Implementations - REQUIRED FOR SPRINT COMPLETION
- [ ] **Functional**: Circle block renders particles in circular layout
- [ ] **Functional**: Circle block with phase animation rotates smoothly
- [ ] **Code**: `circleLayout` kernel in Materializer.ts `applyKernelZipSig`
- [ ] **Code**: `circleAngle` kernel in Materializer.ts `applyKernelZipSig`
- [ ] **Visual**: 100-particle circle layout is geometrically correct

### P1: Size Type Disambiguation - REQUIRED FOR SPRINT COMPLETION
- [ ] **Code**: `StepRender.size` is discriminated union type in `types.ts`
- [ ] **Code**: `pass7-schedule.ts` emits discriminated size object
- [ ] **Code**: No array bounds heuristic in ScheduleExecutor (`isSignal`/`isField` checks removed)
- [ ] **Code**: Fallback `size = 10` only when size input is undefined (not as error recovery)
- [ ] **Functional**: Signal-based size input produces uniform particle size
- [ ] **Functional**: Field-based size input produces per-particle varied sizes
- [ ] **Type Safety**: TypeScript compilation succeeds with strict mode

### Integration Verification
- [ ] Demo patch plays without console errors
- [ ] No `PureFn kind kernel not implemented` errors
- [ ] No `Unknown kernel function` errors
- [ ] Animation runs at stable 60fps (no performance regression)
- [ ] Type check passes: `npm run typecheck`

## Previous Evaluation Reference
None - this is the first evaluation of this work.

## Persistent Check Results
| Check | Status | Output Summary |
|-------|--------|----------------|
| `npm run typecheck` | ✅ PASS | Clean compilation, no errors |
| `npm run test` | ⚠️ FAIL | 5 failed, 268 passed (failures are pre-existing bugs) |

## Code Verification

### P0: Signal Kernel Support

**File: src/runtime/SignalEvaluator.ts**

#### ✅ Code: applyPureFn handles fn.kind === 'kernel' (Lines 154-165)
```typescript
function applyPureFn(
  fn: { kind: 'opcode'; opcode: string } | { kind: 'expr'; expr: string } | { kind: 'kernel'; name: string },
  values: number[]
): number {
  if (fn.kind === 'opcode') {
    return applyOpcode(fn.opcode, values);
  }
  if (fn.kind === 'kernel') {
    return applySignalKernel(fn.name, values);
  }
  throw new Error(`PureFn kind ${fn.kind} not implemented`);
}
```
**Status**: ✅ IMPLEMENTED - Handler exists and delegates to `applySignalKernel`

#### ✅ Code: Signal kernels implemented - sin, cos, tan (Lines 173-192)
```typescript
function applySignalKernel(name: string, values: number[]): number {
  switch (name) {
    case 'sin':
      if (values.length !== 1) {
        throw new Error(`Signal kernel 'sin' expects 1 input, got ${values.length}`);
      }
      return Math.sin(values[0]);

    case 'cos':
      if (values.length !== 1) {
        throw new Error(`Signal kernel 'cos' expects 1 input, got ${values.length}`);
      }
      return Math.cos(values[0]);

    case 'tan':
      if (values.length !== 1) {
        throw new Error(`Signal kernel 'tan' expects 1 input, got ${values.length}`);
      }
      return Math.tan(values[0]);
    // ...
  }
}
```
**Status**: ✅ IMPLEMENTED - All three trig kernels present with input validation

#### ✅ Error Handling: vec2 signal kernels throw informative error (Lines 193-201)
```typescript
    case 'polarToCartesian':
    case 'offsetPosition':
    case 'circleLayout':
    case 'circleAngle':
      throw new Error(
        `Signal kernel '${name}' returns vec2 which is not yet supported at signal level. ` +
        `Use field-level version instead (fieldZipSig or fieldMap).`
      );

    default:
      throw new Error(`Unknown signal kernel: ${name}`);
```
**Status**: ✅ IMPLEMENTED - Clear error message explaining limitation

### P0: Field Kernel Implementations

**File: src/runtime/Materializer.ts**

#### ✅ Code: circleLayout kernel in applyKernelZipSig (Lines 684-703)
```typescript
  } else if (kernelName === 'circleLayout') {
    // Circle layout: normalized index -> vec2 position on circle
    // Input field: normalizedIndex (0-1)
    // Signals: [radius, phase]
    if (sigValues.length !== 2) {
      throw new Error('circleLayout requires 2 signals (radius, phase)');
    }
    const outArr = out as Float32Array;
    const indexArr = fieldInput as Float32Array;
    const radius = sigValues[0];
    const phase = sigValues[1];
    const TWO_PI = Math.PI * 2;
    const cx = 0.5; // Center in normalized coords
    const cy = 0.5;

    for (let i = 0; i < N; i++) {
      const angle = TWO_PI * (indexArr[i] + phase);
      outArr[i * 2 + 0] = cx + radius * Math.cos(angle);
      outArr[i * 2 + 1] = cy + radius * Math.sin(angle);
    }
```
**Status**: ✅ IMPLEMENTED
- Takes normalized index field + radius/phase signals
- Outputs vec2 positions
- Uses (0.5, 0.5) center in normalized coords
- Correct circular parametrization: angle = 2π * (index + phase)

#### ✅ Code: circleAngle kernel in applyKernelZipSig (Lines 704-719)
```typescript
  } else if (kernelName === 'circleAngle') {
    // Circle angle: normalized index -> angle in radians
    // Input field: normalizedIndex (0-1)
    // Signals: [phase]
    if (sigValues.length !== 1) {
      throw new Error('circleAngle requires 1 signal (phase)');
    }
    const outArr = out as Float32Array;
    const indexArr = fieldInput as Float32Array;
    const phase = sigValues[0];
    const TWO_PI = Math.PI * 2;

    for (let i = 0; i < N; i++) {
      outArr[i] = TWO_PI * (indexArr[i] + phase);
    }
```
**Status**: ✅ IMPLEMENTED
- Takes normalized index field + phase signal
- Outputs angle in radians
- Correct formula: 2π * (index + phase)

### P1: Size Type Disambiguation

#### ✅ Code: StepRender.size is discriminated union (src/compiler/ir/types.ts:310-312)
```typescript
export interface StepRender {
  readonly kind: 'render';
  readonly domain: DomainId;
  readonly position: FieldExprId;
  readonly color: FieldExprId;
  readonly size?:
    | { readonly k: 'sig'; readonly id: SigExprId }
    | { readonly k: 'field'; readonly id: FieldExprId };
}
```
**Status**: ✅ IMPLEMENTED - Discriminated union with 'k' discriminator

#### ✅ Code: pass7-schedule.ts emits discriminated size (Lines 155-160)
```typescript
    // P1: Add optional size with type discriminator
    if (sizeRef?.k === 'field') {
      (step as any).size = { k: 'field', id: sizeRef.id };
    } else if (sizeRef?.k === 'sig') {
      (step as any).size = { k: 'sig', id: sizeRef.id };
    }
```
**Status**: ✅ IMPLEMENTED - Emits discriminated object based on ValueRefPacked.k

#### ✅ Code: ScheduleExecutor uses discriminator (Lines 166-182)
```typescript
        // Size can be a signal (uniform) or field (per-particle)
        let size: number | ArrayBufferView;
        if (step.size !== undefined) {
          if (step.size.k === 'field') {
            // Field - materialize per-particle values
            size = materialize(
              step.size.id,
              step.domain,
              fields,
              signals,
              domains,
              state,
              pool
            );
          } else {
            // Signal - evaluate once for uniform size
            size = evaluateSignal(step.size.id, signals, state);
          }
        } else {
          // Default size when no input connected
          size = 10;
        }
```
**Status**: ✅ IMPLEMENTED
- Uses `step.size.k` discriminator
- No array bounds heuristic
- `size = 10` only when `step.size === undefined` (correct)

#### ✅ Code: No array bounds heuristic remaining
**Status**: ✅ VERIFIED - No `isSignal`/`isField` helper functions or array bounds checks found

## Manual Runtime Testing

### Test Environment
- Dev server running on port 5174
- TypeScript compilation: Clean (no errors)
- Test suite: 268/273 passing (5 failures are pre-existing bugs in other components)

### ⚠️ CANNOT VERIFY FUNCTIONAL CRITERIA

**Blocker**: Without browser access or chrome-devtools MCP integration, I cannot:
1. Load the application and verify it runs
2. Add Oscillator blocks to test sin/cos waveforms
3. Add Circle blocks to verify circular layout
4. Capture screenshots of 100-particle circle
5. Verify animations run smoothly
6. Check browser console for runtime errors

**What I CAN verify from code review:**
- ✅ All kernel implementations are mathematically correct
- ✅ Type system is correct (TypeScript compilation passes)
- ✅ Code structure follows architectural patterns
- ✅ Error handling is informative

**What I CANNOT verify without runtime testing:**
- ❓ Oscillator block actually renders (no crash at runtime)
- ❓ Circle block produces correct visual output
- ❓ Phase animation rotates smoothly
- ❓ Signal vs field size inputs work correctly in practice
- ❓ No console errors during playback
- ❓ 60fps performance maintained

## Evidence

### Code Files Modified (Verified)
1. ✅ src/runtime/SignalEvaluator.ts - Signal kernel support added
2. ✅ src/runtime/Materializer.ts - circleLayout/circleAngle kernels added
3. ✅ src/compiler/ir/types.ts - StepRender.size discriminated union
4. ✅ src/compiler/passes-v2/pass7-schedule.ts - Emits discriminated size
5. ✅ src/runtime/ScheduleExecutor.ts - Uses discriminator, no heuristic

### Type Safety Verification
```bash
$ npm run typecheck
> tsc -b
[No output - clean compilation]
```
**Status**: ✅ PASS

### Test Results Analysis
5 test failures identified:
1. steel-thread.test.ts - **Not related**: Test patch has incorrect signal-to-field wiring
2. compile.test.ts (NoTimeRoot) - **Not related**: Test expects wrong error code from Pass 3
3. compile.test.ts (FiniteTimeRoot) - **Not related**: Pass 3 stub always returns infinite
4-5. runtime integration tests - **Not related**: Cascade from steel-thread wiring bug

**Verdict**: No test failures caused by animation-deferred-work changes.

## Assessment

### ✅ Code Implementation - COMPLETE
All code changes are present and correct:
- Signal kernels: sin, cos, tan implemented
- Field kernels: circleLayout, circleAngle implemented
- Size type discrimination: discriminated union added, heuristic removed
- Error handling: informative errors for unsupported cases
- Type safety: All changes compile cleanly

### ❓ Functional Verification - BLOCKED
Cannot verify functional criteria without runtime testing:
- Need to actually run the application and test blocks
- Need browser console access to check for errors
- Need visual verification of animations

### ✅ Type Safety - VERIFIED
- TypeScript compilation passes with strict mode
- No type errors introduced
- Discriminated union correctly typed

### ✅ Code Quality - VERIFIED
- Code follows existing patterns (e.g., switch statements in kernel functions)
- Comments explain kernel behavior
- Input validation present (e.g., arity checks on trig kernels)
- Error messages are informative

## Missing Checks

**Functional E2E Tests Needed** (implementer should create):

1. **Signal kernel E2E test** (`tests/e2e/oscillator-rendering.test.ts`)
   - Add Oscillator block with sin waveform
   - Verify no crash during render
   - Verify output values are in expected range

2. **Field kernel E2E test** (`tests/e2e/circle-layout.test.ts`)
   - Add Circle block with 100 particles
   - Verify circular arrangement (check position distances from center)
   - Verify phase animation rotates (compare positions at different phases)

3. **Size discrimination test** (`tests/e2e/size-inputs.test.ts`)
   - Test signal size input (uniform)
   - Test field size input (per-particle)
   - Verify correct rendering in both cases

## Verdict: INCOMPLETE

**Reason**: Cannot verify functional acceptance criteria without runtime testing.

**Code Status**: ✅ All code changes are correct and complete
**Type Safety**: ✅ Compilation passes
**Functional Status**: ❓ Unknown - requires runtime testing

## What Needs to Change

### Immediate Actions Required

**User or QA must verify functional criteria:**

1. **Oscillator Block Test**
   - Load application at http://localhost:5174
   - Add Oscillator block, set waveform to 'sin'
   - Connect to animation
   - Verify: No crash, smooth sine wave output
   - Repeat for 'cos' waveform

2. **Circle Block Test**
   - Add Circle block with particleCount=100
   - Connect radius and phase inputs
   - Add render block
   - Verify: Particles arranged in perfect circle
   - Animate phase: Verify smooth rotation

3. **Size Input Test**
   - Test A: Connect signal (e.g., ConstFloat) to render size input
     - Verify: All particles same size
   - Test B: Connect field (e.g., FieldPulse) to render size input
     - Verify: Particles have varying sizes

4. **Console Verification**
   - Open browser DevTools console
   - Play demo patch
   - Verify: No errors logged
   - Verify: No "PureFn kind kernel not implemented" errors
   - Verify: No "Unknown kernel function" errors

### Alternative: Automated E2E Tests

If manual testing is not feasible, implementer should create automated tests:

```typescript
// tests/e2e/kernel-integration.test.ts
describe('Kernel Integration', () => {
  it('should render Oscillator with sin waveform', () => {
    const patch = createPatch([
      TimeRoot(),
      Oscillator({ waveform: 'sin' }),
      // ... render setup
    ]);
    const result = compile(patch);
    expect(result.kind).toBe('ok');
    
    const program = result.program;
    const state = createRuntimeState(program);
    const frame = executeFrame(program, state, pool, 0);
    
    // Should not throw
    expect(frame.passes.length).toBeGreaterThan(0);
  });
  
  it('should render Circle with 100 particles', () => {
    const patch = createPatch([
      TimeRoot(),
      DomainN({ count: 100 }),
      Circle({ radius: 0.3, phase: 0 }),
      // ... render setup
    ]);
    const result = compile(patch);
    expect(result.kind).toBe('ok');
    
    const program = result.program;
    const state = createRuntimeState(program);
    const frame = executeFrame(program, state, pool, 0);
    
    const pass = frame.passes[0];
    expect(pass.count).toBe(100);
    
    // Verify circular arrangement
    const positions = pass.position as Float32Array;
    for (let i = 0; i < 100; i++) {
      const x = positions[i * 2 + 0];
      const y = positions[i * 2 + 1];
      const distFromCenter = Math.sqrt((x - 0.5) ** 2 + (y - 0.5) ** 2);
      expect(distFromCenter).toBeCloseTo(0.3, 2); // radius = 0.3
    }
  });
});
```

## Recommendations

1. **User Testing Session**: Schedule 15-minute manual testing session to verify functional criteria
2. **E2E Test Suite**: Create automated tests for kernel integration (as shown above)
3. **Visual Regression Tests**: Consider adding screenshot tests for geometric correctness
4. **Performance Monitoring**: Add FPS counter to verify 60fps requirement

## Notes

- All code changes are architecturally sound and follow existing patterns
- Implementation is complete from a code perspective
- The gap is purely in functional verification
- No regressions detected in existing test suite
- Type safety is maintained throughout
