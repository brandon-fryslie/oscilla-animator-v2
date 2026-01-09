/**
 * Time Resolution - Convert Player Time to Effective Time
 *
 * Resolves absolute player time into effective time signals based on the time model.
 */
/**
 * Create initial TimeState
 */
export function createTimeState() {
    return {
        prevTAbsMs: null,
        prevTModelMs: null,
        wrapCount: 0,
    };
}
/**
 * Resolve effective time from absolute time and time model.
 *
 * Semantics:
 * - Finite: tModelMs clamped to [0, durationMs], progress = tModelMs / durationMs
 * - Cyclic: tModelMs wrapped to [0, periodMs], phase = tModelMs / periodMs
 * - Infinite: tModelMs = tAbsMs
 *
 * Wrap Detection (cyclic only):
 * - Detects wrap when tModelMs < prevTModelMs
 * - Sets pulse = 1.0 on wrap, 0.0 otherwise
 * - Increments energy counter on each wrap
 */
export function resolveTime(tAbsMs, timeModel, timeState) {
    // Calculate delta time
    const dt = timeState.prevTAbsMs !== null ? tAbsMs - timeState.prevTAbsMs : 0;
    timeState.prevTAbsMs = tAbsMs;
    switch (timeModel.kind) {
        case 'finite': {
            // Clamp to duration
            const tModelMs = Math.max(0, Math.min(tAbsMs, timeModel.durationMs));
            const progress = timeModel.durationMs > 0 ? tModelMs / timeModel.durationMs : 0;
            return {
                tAbsMs,
                tModelMs,
                dt,
                progress,
            };
        }
        case 'cyclic': {
            // Wrap to period
            const periodMs = timeModel.periodMs;
            const tModelMs = ((tAbsMs % periodMs) + periodMs) % periodMs;
            const phase = periodMs > 0 ? tModelMs / periodMs : 0;
            // Detect wrap
            let pulse = 0.0;
            if (timeState.prevTModelMs !== null &&
                tModelMs < timeState.prevTModelMs) {
                pulse = 1.0;
                timeState.wrapCount++;
            }
            timeState.prevTModelMs = tModelMs;
            const energy = timeState.wrapCount;
            return {
                tAbsMs,
                tModelMs,
                dt,
                phase,
                pulse,
                energy,
            };
        }
        case 'infinite': {
            // No transformation
            return {
                tAbsMs,
                tModelMs: tAbsMs,
                dt,
            };
        }
        default: {
            const _exhaustive = timeModel;
            throw new Error(`Unknown time model: ${String(_exhaustive)}`);
        }
    }
}
