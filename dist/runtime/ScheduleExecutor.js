/**
 * Schedule Executor - Core Frame Execution Loop
 *
 * Executes the IR program schedule step-by-step to produce a frame.
 * Simplified for v2 - pure IR path, no legacy complexity.
 */
import { resolveTime } from './timeResolution';
import { materialize } from './Materializer';
import { evaluateSignal } from './SignalEvaluator';
/**
 * Execute one frame of the program
 *
 * @param program - Compiled IR program
 * @param state - Runtime state
 * @param pool - Buffer pool
 * @param tAbsMs - Absolute time in milliseconds
 * @returns RenderFrameIR for this frame
 */
export function executeFrame(program, state, pool, tAbsMs) {
    // 1. Advance frame (cache owns frameId)
    state.cache.frameId++;
    // 2. Resolve effective time
    const time = resolveTime(tAbsMs, program.timeModel, state.timeState);
    state.time = time;
    // 3. Execute schedule steps
    const passes = [];
    for (const step of program.steps) {
        switch (step.kind) {
            case 'evalSig': {
                // Evaluate signal and store in slot
                const value = evaluateSignal(step.expr, program.signals, state);
                state.values.f64[step.target] = value;
                // Cache the result
                state.cache.sigValues[step.expr] = value;
                state.cache.sigStamps[step.expr] = state.cache.frameId;
                break;
            }
            case 'materialize': {
                // Materialize field to buffer and store in slot
                const buffer = materialize(step.field, step.domain, program.fields, program.signals, program.domains, state, pool);
                state.values.objects.set(step.target, buffer);
                break;
            }
            case 'render': {
                // Assemble render pass
                const domain = program.domains.get(step.domain);
                if (!domain) {
                    throw new Error(`Domain ${step.domain} not found`);
                }
                const position = materialize(step.position, step.domain, program.fields, program.signals, program.domains, state, pool);
                const color = materialize(step.color, step.domain, program.fields, program.signals, program.domains, state, pool);
                // Size can be a signal (uniform) or field (per-particle)
                let size;
                if (step.size !== undefined) {
                    // Check if it's a signal or field ID by checking which map it belongs to
                    const isSignal = program.signals.has(step.size);
                    const isField = program.fields.has(step.size);
                    // Check field FIRST - fields take precedence for per-particle data
                    if (isField) {
                        // It's a field - materialize per-particle values
                        size = materialize(step.size, step.domain, program.fields, program.signals, program.domains, state, pool);
                    }
                    else if (isSignal) {
                        // It's a signal - evaluate once
                        size = evaluateSignal(step.size, program.signals, state);
                    }
                    else {
                        size = 10; // Fallback
                    }
                }
                else {
                    size = 10;
                }
                passes.push({
                    kind: 'instances2d',
                    count: domain.count,
                    position,
                    color,
                    size,
                });
                break;
            }
            default: {
                const _exhaustive = step;
                throw new Error(`Unknown step kind: ${_exhaustive.kind}`);
            }
        }
    }
    // 4. Return render frame
    return {
        version: 1,
        passes,
    };
}
