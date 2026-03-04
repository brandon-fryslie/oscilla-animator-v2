import type { CompiledProgramIR } from '../compiler/ir/program';
import type { InstanceDecl } from '../compiler/ir/types';
import type { RuntimeState } from './RuntimeState';
import type { PureFnExecutionContext } from './ScalarKernelLibrary';
import { evaluateValueExprScalar, type ScalarEvalContext } from './ValueExprScalarEvaluator';

function clampResolvedCount(raw: number, maxCount: number): number {
  if (!Number.isFinite(raw)) return 0;
  const floored = Math.floor(raw);
  if (floored <= 0) return 0;
  if (floored >= maxCount) return maxCount;
  return floored;
}

function getDynamicCountCache(state: RuntimeState): Map<string, number> {
  if (state.cache.instanceLaneCountFrameId !== state.cache.frameId) {
    state.cache.instanceLaneCounts?.clear();
    state.cache.instanceLaneCountFrameId = state.cache.frameId;
  }
  if (!state.cache.instanceLaneCounts) {
    // [LAW:no-shared-mutable-globals] Cache is owned by RuntimeState frame cache.
    state.cache.instanceLaneCounts = new Map<string, number>();
  }
  return state.cache.instanceLaneCounts;
}

/**
 * Resolve runtime lane count for an instance declaration.
 *
 * - Static instances: returns declared count (clamped to maxCount)
 * - Dynamic instances with countExpr: evaluates scalar expression and clamps
 * - Dynamic instances without countExpr: falls back to maxCount capacity
 */
export function resolveInstanceLaneCount(
  instanceDecl: InstanceDecl,
  program: CompiledProgramIR,
  state: RuntimeState,
  pureFnContext?: PureFnExecutionContext,
): number {
  const maxCount = Math.max(0, Math.floor(instanceDecl.maxCount));
  if (instanceDecl.count !== 'dynamic') {
    return clampResolvedCount(instanceDecl.count, maxCount);
  }

  const cache = getDynamicCountCache(state);
  const cacheKey = String(instanceDecl.id);
  const cached = cache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const countExpr = instanceDecl.countExpr;
  if (countExpr === undefined) {
    cache.set(cacheKey, maxCount);
    return maxCount;
  }

  const context: ScalarEvalContext | undefined = pureFnContext
    ? { pureFnContext }
    : undefined;
  const rawCount = evaluateValueExprScalar(
    countExpr,
    program.valueExprs.nodes,
    state,
    context,
  );
  const resolved = clampResolvedCount(rawCount, maxCount);
  cache.set(cacheKey, resolved);
  return resolved;
}
