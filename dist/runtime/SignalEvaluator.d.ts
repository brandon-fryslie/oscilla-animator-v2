/**
 * Signal Evaluator - SINGLE SOURCE OF TRUTH
 *
 * Unified signal evaluation for both ScheduleExecutor and Materializer.
 * Eliminates ~90 lines of code duplication.
 *
 * Adheres to architectural law: ONE SOURCE OF TRUTH
 */
import type { SigExpr } from '../compiler/ir/types';
import type { SigExprId } from '../types';
import type { RuntimeState } from './RuntimeState';
/**
 * Evaluate a signal expression with caching
 *
 * @param sigId - Signal expression ID to evaluate
 * @param signals - Map of signal expressions
 * @param state - Runtime state with cache
 * @returns Evaluated signal value
 */
export declare function evaluateSignal(sigId: SigExprId, signals: ReadonlyMap<SigExprId, SigExpr>, state: RuntimeState): number;
