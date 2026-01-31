# Implementation Context: kill-legacy-surfaces
Generated: 2026-01-31-160000

## Key Files

### Must Modify
- `src/runtime/RenderAssembler.ts` — Remove `evaluateSignal` import and calls (lines 21, 428, 470)
- `src/runtime/index.ts` — Remove legacy exports

### Must Delete
- `src/runtime/SignalEvaluator.ts`
- `src/runtime/EventEvaluator.ts`
- `src/runtime/Materializer.ts`

### Must Create
- `src/runtime/__tests__/no-legacy-evaluator.test.ts`

### Must Read (for understanding)
- `src/runtime/ScheduleExecutor.ts` — How evalSig steps populate signalSlots
- `src/runtime/RuntimeState.ts` — Where `signalSlots` lives, how slots are indexed
- `src/compiler/ir/types.ts` — StepEvalSig type, slot mapping

## RenderAssembler Signal Resolution

The key change: `evaluateSignal(sigId, signals, state)` → read from `state.signalSlots[slotIndex]`.

**How to find the slot index for a SigExprId**:
- The compiled program's schedule steps include `evalSig` steps that have `{ sigId, slotIndex }`
- After all evalSig steps run in Phase 1, `state.signalSlots[slotIndex]` contains the value
- RenderAssembler runs in Phase 3 (after all evaluation), so all slots are populated

**What RenderAssembler currently does with evaluateSignal**:
1. **Scale resolution** (line ~428): Gets numeric scale value from a signal
2. **Shape param resolution** (line ~470): Gets numeric param values from signals

Both cases produce `number` — simple scalar reads. Perfect for slot-based reads.

**The `signals` parameter**: Currently `program.signals` (the SigExpr array). After this change, RenderAssembler should only need `program` (for slot mappings) and `state` (for slot values). The `signals` array becomes unnecessary.

## Test Migration Notes

Some tests may import legacy evaluators:
- `src/runtime/__tests__/signal-evaluator.test.ts` or similar — may need deletion
- `src/runtime/__tests__/materializer.test.ts` or similar — may need deletion
- Tests in `src/runtime/__tests__/` that specifically test legacy behavior should be deleted if they duplicate ValueExpr tests

Check before deleting: are there any legacy-specific tests that exercise behavior NOT covered by ValueExpr tests? If so, port the test cases to use ValueExpr evaluators before deleting.

## Tripwire Implementation Options

**Option A: Static import check (preferred)**
```typescript
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

describe('no legacy evaluator imports in production', () => {
  it('no runtime file imports legacy evaluators', () => {
    const runtimeDir = join(__dirname, '..');
    const files = readdirSync(runtimeDir).filter(f =>
      f.endsWith('.ts') && !f.includes('.test.') && !f.includes('__tests__')
    );
    for (const file of files) {
      const content = readFileSync(join(runtimeDir, file), 'utf-8');
      expect(content).not.toMatch(/from.*SignalEvaluator/);
      expect(content).not.toMatch(/from.*EventEvaluator[^V]/); // not ValueExprEventEvaluator
      expect(content).not.toMatch(/from.*[^V]Materializer/);   // not ValueExprMaterializer
    }
  });
});
```

**Option B: Runtime spy (alternative)**
- Mock `evaluateSignal` at module level, assert never called during a full frame execution
- More fragile (depends on mock timing) but tests actual execution

Recommend Option A for simplicity and reliability.
