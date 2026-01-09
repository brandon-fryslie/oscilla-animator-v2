/**
 * Signal Evaluator - SINGLE SOURCE OF TRUTH
 *
 * Unified signal evaluation for both ScheduleExecutor and Materializer.
 * Eliminates ~90 lines of code duplication.
 *
 * Adheres to architectural law: ONE SOURCE OF TRUTH
 */
import { applyOpcode } from './OpcodeInterpreter';
/**
 * Evaluate a signal expression with caching
 *
 * @param sigId - Signal expression ID to evaluate
 * @param signals - Map of signal expressions
 * @param state - Runtime state with cache
 * @returns Evaluated signal value
 */
export function evaluateSignal(sigId, signals, state) {
    // Check cache first
    const cached = state.cache.sigValues[sigId];
    const cachedStamp = state.cache.sigStamps[sigId];
    if (cachedStamp === state.cache.frameId) {
        return cached;
    }
    // Get expression
    const expr = signals.get(sigId);
    if (!expr) {
        throw new Error(`Signal expression ${sigId} not found`);
    }
    // Evaluate based on kind
    const value = evaluateSigExpr(expr, signals, state);
    // Cache result
    state.cache.sigValues[sigId] = value;
    state.cache.sigStamps[sigId] = state.cache.frameId;
    return value;
}
/**
 * Evaluate a SigExpr recursively
 *
 * @param expr - Signal expression to evaluate
 * @param signals - Map of all signal expressions (for recursive evaluation)
 * @param state - Runtime state
 * @returns Evaluated value
 */
function evaluateSigExpr(expr, signals, state) {
    if (!state.time) {
        throw new Error('Effective time not set');
    }
    switch (expr.kind) {
        case 'const': {
            return typeof expr.value === 'number' ? expr.value : 0;
        }
        case 'slot': {
            return state.values.f64[expr.slot];
        }
        case 'time': {
            const timeExpr = expr;
            switch (timeExpr.which) {
                case 't':
                    return state.time.tModelMs;
                case 'dt':
                    return state.time.dt;
                case 'phase':
                    return state.time.phase ?? 0;
                case 'pulse':
                    return state.time.pulse ?? 0;
                case 'energy':
                    return state.time.energy ?? 0;
                default: {
                    const _exhaustive = timeExpr.which;
                    throw new Error(`Unknown time signal: ${String(_exhaustive)}`);
                }
            }
        }
        case 'external': {
            const ext = expr;
            // Use smooth positions for organic following
            if (ext.which === 'mouseX')
                return state.external.smoothX;
            if (ext.which === 'mouseY')
                return state.external.smoothY;
            if (ext.which === 'mouseOver')
                return state.external.mouseOver ? 1 : 0;
            throw new Error(`Unknown external signal: ${ext.which}`);
        }
        case 'map': {
            const input = evaluateSignal(expr.input, signals, state);
            return applyPureFn(expr.fn, [input]);
        }
        case 'zip': {
            const inputs = expr.inputs.map((id) => evaluateSignal(id, signals, state));
            return applyPureFn(expr.fn, inputs);
        }
        default: {
            const _exhaustive = expr;
            throw new Error(`Unknown signal expr kind: ${_exhaustive.kind}`);
        }
    }
}
/**
 * Apply a pure function to values
 */
function applyPureFn(fn, values) {
    if (fn.kind === 'opcode') {
        return applyOpcode(fn.opcode, values);
    }
    throw new Error(`PureFn kind ${fn.kind} not implemented`);
}
