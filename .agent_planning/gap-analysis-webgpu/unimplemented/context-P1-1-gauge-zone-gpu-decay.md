# Context: P1-1 - Gauge Zone GPU-Side Decay

## Target State
The spec requires gauge (continuity offset) decay to happen on the GPU:
1. CPU calculates Gauge = Old_Val - New_Val on graph edit.
2. CPU uploads Gauge to Zone 5.
3. Compute shader reads Gauge, decays it (Gauge *= 0.9), and adds it to output.
4. Compute shader writes decayed Gauge back to the output buffer.

This eliminates per-instance CPU work for continuity smoothing.

## Current State
Continuity (gauge) logic runs entirely on the CPU:
- `ContinuityState.ts:123`: "Active arena backing store for gauge zone views"
- `ContinuityApply.ts`: Manages slew buffers, captures pre-allocation state, applies continuity corrections.
- The compiler's `ArenaZonePlan` (storage-class.ts:153) allocates gauge zone ranges but these map to CPU-side arrays.
- No GPU shader performs gauge decay.
- `arena-layout.test.ts:454-489`: Tests verify gauge zone metadata exists but do not test GPU-side behavior.

## Files Involved
- `/Users/bmf/code/oscilla-animator-v2/src/runtime/ContinuityState.ts` (CPU gauge management)
- `/Users/bmf/code/oscilla-animator-v2/src/runtime/ContinuityApply.ts` (CPU continuity application)
- `/Users/bmf/code/oscilla-animator-v2/src/compiler/ir/storage-class.ts` (gauge zone plan)
- `/Users/bmf/code/oscilla-animator-v2/src/compiler/ir/program.ts` (ArenaGaugeTargetLayoutIR)

## Suggested Approach
1. Allocate gauge zone in the GPU arena (compiler_arena_buffers) alongside simulation data.
2. On graph edit: CPU computes gauge offsets and uploads them to the gauge zone via queue.writeBuffer.
3. Add a gauge-decay compute pass (or integrate into simulation pass) that reads gauge, applies decay factor, adds to output, writes back decayed gauge.
4. Connect gauge zone offsets from compiler IR to GPU arena layout.

## Risks
- CPU-side continuity works correctly today; moving to GPU may introduce regression.
- Gauge decay needs to be additive to simulation output, which requires careful ordering within the compute pipeline.
- The decay factor (0.9 or tunable) needs to be parameterizable.
- For small instance counts, GPU overhead may exceed CPU time.
