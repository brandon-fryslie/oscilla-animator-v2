# Runtime Behavior: Diagnostics System Sprint 2

**Scope**: diagnostics-system Sprint 2 P0+P1 (Runtime Health + Config Object)
**Confidence**: FRESH
**Last Updated**: 2026-01-12 03:06:54

---

## Sprint 2 Implementation Characteristics

### Files Created
- `src/diagnostics/config.ts` (78 lines) - Configuration object
- `src/runtime/HealthMonitor.ts` (254 lines) - Health monitoring functions

### Files Modified
- `src/diagnostics/types.ts` - Added P_NAN_DETECTED, P_INFINITY_DETECTED, P_FRAME_BUDGET_EXCEEDED codes
- `src/runtime/RuntimeState.ts` - Added HealthMetrics interface and createHealthMetrics()
- `src/runtime/SignalEvaluator.ts` - Added NaN/Inf detection calls
- `src/main.ts` - Integrated health monitoring in animation loop

---

## Batching Strategy (NaN/Inf Detection)

**Implementation**: `src/runtime/HealthMonitor.ts` lines 49-117

**How it Works**:
1. Track `nanBatchCount` (occurrences in current 100ms window)
2. Track `samplingBatchStart` (window start time)
3. When window expires (>100ms elapsed):
   - Commit batch: `nanCount++` (if nanBatchCount > 0)
   - Reset: `nanBatchCount = 0`, `samplingBatchStart = now`
4. Each NaN detection increments `nanBatchCount`

**Result**: 600 NaN/sec at 60fps → 10 batches/sec (10 diagnostics max, not 600)

**Config Controls**:
- `DIAGNOSTICS_CONFIG.nanBatchWindowMs` (default: 100ms)
- `DIAGNOSTICS_CONFIG.nanDetectionEnabled` (default: true)

**Same strategy for Infinity detection** (separate counters, same batching logic)

---

## Snapshot Throttling

**Implementation**: `src/runtime/HealthMonitor.ts` lines 132-138

**How it Works**:
1. Check `DIAGNOSTICS_CONFIG.runtimeHealthEnabled` (early return if false)
2. Calculate elapsed: `now - state.health.lastSnapshotTime`
3. Return true if elapsed >= `DIAGNOSTICS_CONFIG.healthSnapshotIntervalMs`

**Result**: Checked every frame, emits only when interval elapsed

**Config Controls**:
- `healthSnapshotIntervalMs` (default: 200ms = 5 Hz)
- `runtimeHealthEnabled` (default: true)

**Integration**: `src/main.ts` line 249
```typescript
if (shouldEmitSnapshot(currentState)) {
  emitHealthSnapshot(currentState, rootStore.events, 'patch-0', rootStore.getPatchRevision(), tMs);
}
```

---

## Frame Time Tracking

**Implementation**: `src/runtime/HealthMonitor.ts` lines 27-43

**Data Structure**: Ring buffer (10 frames)
- `frameTimes: number[]` - Array of last 10 frame times
- `frameTimesIndex: number` - Current write position

**Recording**:
```typescript
h.frameTimes[h.frameTimesIndex] = frameTimeMs;
h.frameTimesIndex = (h.frameTimesIndex + 1) % h.frameTimes.length;
```

**Metrics Calculated** (on snapshot):
- `avgFrameMs` - Mean of non-zero frame times
- `worstFrameMs` - Max of non-zero frame times
- `fpsEstimate` - 1000 / avgFrameMs

**Usage**: P_FRAME_BUDGET_EXCEEDED diagnostic when worstFrameMs > threshold

---

## Diagnostic ID Generation

**Implementation**: `src/diagnostics/diagnosticId.ts` (existing function)

**Format**: `CODE:targetStr:revN`

**Examples**:
- `P_NAN_DETECTED:graphSpan-:rev42`
- `P_FRAME_BUDGET_EXCEEDED:graphSpan-:rev42`
- `P_INFINITY_DETECTED:block-b1:rev42` (when block ID tracking added)

**Why Revision in ID**: Same diagnostic in different patch versions = different ID (user wants to see it again after editing)

---

## Config Object Pattern

**File**: `src/diagnostics/config.ts`

**Pattern**: Flat, exported const object
```typescript
export const DIAGNOSTICS_CONFIG: DiagnosticsConfig = {
  runtimeHealthEnabled: true,
  healthSnapshotIntervalMs: 200,
  // ...
};
```

**Migration Path** (documented in JSDoc):
1. Move DiagnosticsConfig interface into app settings
2. Replace `DIAGNOSTICS_CONFIG` imports with `appSettings.diagnostics`
3. No other code changes needed

**Usage Pattern**:
```typescript
import { DIAGNOSTICS_CONFIG } from '../diagnostics/config';

if (DIAGNOSTICS_CONFIG.nanDetectionEnabled) {
  // ...
}
```

**Why Not MobX Store**: User building app-wide settings panel later, temporary UI avoided

---

## Event Flow

**Animation Loop** → **HealthMonitor** → **EventHub** → **DiagnosticHub** → **UI**

1. `main.ts:246` - `recordFrameTime(currentState, frameTime)`
2. `main.ts:249-257` - `if (shouldEmitSnapshot()) { emitHealthSnapshot(...) }`
3. `HealthMonitor.ts:229-245` - Emit RuntimeHealthSnapshot event with diagnosticsDelta
4. `DiagnosticHub.ts:214-235` - Handle event, merge runtime diagnostics, increment revision
5. `DiagnosticHub.ts:251-273` - `getActive()` includes runtime diagnostics
6. UI (MobX) - Observes diagnostics revision, re-renders DiagnosticConsole

---

## Performance Characteristics

**Overhead Measurements** (by code analysis):
- `recordFrameTime`: O(1) - Single array write
- `recordNaN/recordInfinity`: O(1) - Counter increment + timestamp check
- `shouldEmitSnapshot`: O(1) - Timestamp comparison
- `emitHealthSnapshot`: O(1) - Ring buffer iteration (max 10 frames)

**Total Frame Budget Impact**: <1% (confirmed by design, not runtime measured due to build errors)

**Memory Footprint**:
- Ring buffer: 10 * 8 bytes = 80 bytes
- Counters: 6 * 8 bytes = 48 bytes
- Timestamps: 2 * 8 bytes = 16 bytes
- Total: ~144 bytes per RuntimeState

---

## Block ID Tracking Limitation

**Current State**: `null` passed to `recordNaN(state, null)`

**Why**: IR doesn't track block provenance yet

**Impact**: 
- NaN/Inf diagnostics use `{ kind: 'graphSpan', blockIds: [] }` target
- Diagnostic appears but doesn't point to specific block
- User sees "NaN detected" but not "in block XYZ"

**Future**: When IR includes block provenance, update SignalEvaluator.ts:51 to pass actual block ID

**Comment in Code** (SignalEvaluator.ts:48-49):
```typescript
// Note: sourceBlockId not yet tracked in IR - will pass null for now
// Once IR includes block provenance, update this to pass actual block ID
```

---

## Test Coverage Gaps

**Missing Test File**: `src/diagnostics/__tests__/runtimeDiagnostics.test.ts`

**What Needs Tests**:
1. Batching logic (multiple NaN in <100ms → single count)
2. Snapshot throttling (respects interval)
3. Config integration (toggles work)
4. Diagnostic creation (correct codes, stable IDs)
5. DiagnosticHub merge (runtime diagnostics in getActive())

**Current Coverage**: DiagnosticHub tests (51 tests) cover event handling but not HealthMonitor internals

---

## Known Pre-existing Blockers (NOT Sprint 2)

**TypeScript Errors** (38 errors):
- IRBuilder interface incomplete (domain-blocks.ts, math-blocks.ts, passes-v2/)
- UI theme properties missing (BlockInspector.tsx)
- TimeSignals.dt property missing (pass3-time.ts)

**Test Failures** (16 failures):
- integration.test.ts compilation fails (IRBuilder issues)

**Runtime Verification Status**: BLOCKED (cannot start dev server)

---

## Reusable Findings for Future Evaluations

### Config Object Pattern
- Simple, flat object for temporary settings
- Documented migration path to app-wide settings
- No MobX store needed for config-only (read-only at runtime)

### Batching Strategy
- 100ms windows prevent diagnostic spam
- Batch counters separate from aggregate counters
- Window expiry commits batch, resets counter

### Event-Driven Diagnostics
- RuntimeHealthSnapshot event with diagnosticsDelta
- DiagnosticHub merges (not replaces) runtime diagnostics
- Stable IDs prevent duplicate diagnostics

### Performance-Conscious Design
- Ring buffer for bounded memory
- Throttled emission (not per-frame)
- Batched aggregation (not per-occurrence)
- O(1) operations in hot path

---

**Cache Status**: FRESH (just evaluated)
**Re-evaluation Needed**: After build errors fixed and runtime verification completed
