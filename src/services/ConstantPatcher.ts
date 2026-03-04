/**
 * ConstantPatcher — Fast-Path Constant Value Patching
 *
 * Patches constant values in a compiled program IR without full recompilation.
 * Uses the constantProvenance map (built during lowering) to locate the exact
 * ValueExprConst nodes that correspond to user-facing port defaults.
 *
 * Also supports instance count patching via instanceCountProvenance:
 * - Parses new count as integer
 * - Bounds-checks against maxCount
 * - Gates on StateMappingField (falls back to full recompile if per-instance state exists)
 * - Patches InstanceDecl.count in the schedule
 *
 * Returns a new program with patched constants, or null if the fast path
 * cannot handle the change (fallback to full recompile).
 *
 * Cost: O(changed_ports * max_stride) — typically patching 1-4 array entries
 * plus one shallow array copy of valueExprs.nodes.
 */

import type { CompiledProgramIR } from '../compiler/ir/program';
import type { ConstValue } from '../core/canonical-types';
import { floatConst, intConst, boolConst, isMany } from '../core/canonical-types';
import type { ValueExpr } from '../compiler/ir/value-expr';
import type { InstanceId } from '../compiler/ir/Indices';
import type { ScheduleIR } from '../compiler/backend/schedule-program';

/**
 * Patch constant values in a compiled program without full recompilation.
 *
 * @param program - The current compiled program IR
 * @param changes - Map of user-facing port keys ("blockId:portId") to new raw values
 * @returns New program with patched constants, or null if fallback to full recompile is needed
 */
export function patchProgramConstants(
  program: CompiledProgramIR,
  changes: ReadonlyMap<string, unknown>,
): CompiledProgramIR | null {
  // Separate changes into constant patches and instance count patches
  const constantChanges = new Map<string, unknown>();
  const instanceCountChanges = new Map<string, unknown>();

  for (const [key, newValue] of changes) {
    if (program.instanceCountProvenance?.has(key)) {
      instanceCountChanges.set(key, newValue);
    } else {
      constantChanges.set(key, newValue);
    }
  }

  // Phase 1: Constant patches (original logic)
  let result = program;

  if (constantChanges.size > 0) {
    const patched = patchConstants(result, constantChanges);
    if (!patched) return null;
    result = patched;
  }

  // Phase 2: Instance count patches
  if (instanceCountChanges.size > 0) {
    const patched = patchInstanceCounts(result, instanceCountChanges);
    if (!patched) return null;
    result = patched;
  }

  // If nothing changed, return null to indicate no-op
  if (result === program) return null;

  return result;
}

/**
 * Patch constant values (original patchProgramConstants logic).
 */
function patchConstants(
  program: CompiledProgramIR,
  changes: ReadonlyMap<string, unknown>,
): CompiledProgramIR | null {
  if (!program.constantProvenance) return null;
  const runtimeLiveExprIds = program.runtimeLiveExprIds;
  if (!runtimeLiveExprIds) return null;
  const runtimeLiveExprSet = new Set(runtimeLiveExprIds);

  const patches: Array<{ exprIndex: number; value: ConstValue }> = [];

  for (const [key, newValue] of changes) {
    const entry = program.constantProvenance.get(key);
    if (!entry) return null; // Unknown key → fallback

    const constValues = convertToConstValues(newValue, entry.payloadKind);
    if (!constValues) return null; // Unsupported payload kind → fallback

    if (entry.componentExprIds.length !== constValues.length) return null; // Shape mismatch → fallback

    for (let i = 0; i < entry.componentExprIds.length; i++) {
      const exprIndex = entry.componentExprIds[i] as number;
      // [LAW:dataflow-not-control-flow] Fast path only patches constants that
      // are active in runtime dataflow; compile-time-only constants fall back.
      if (!runtimeLiveExprSet.has(exprIndex)) return null;
      patches.push({
        exprIndex,
        value: constValues[i],
      });
    }
  }

  // Shallow copy the nodes array and apply patches
  const newNodes: ValueExpr[] = [...program.valueExprs.nodes];
  for (const patch of patches) {
    const existing = newNodes[patch.exprIndex];
    if (existing.kind !== 'const') return null; // Safety: expected const node
    newNodes[patch.exprIndex] = { ...existing, value: patch.value };
  }

  return { ...program, valueExprs: { nodes: newNodes } };
}

/**
 * Patch instance counts without full recompilation.
 *
 * Safety gate: If any StateMappingField exists for the affected instance,
 * fall back to full recompile (per-lane state requires schedule rebuild).
 *
 * Invariant: count patching assumes prefix-stable lane order.
 */
function patchInstanceCounts(
  program: CompiledProgramIR,
  changes: ReadonlyMap<string, unknown>,
): CompiledProgramIR | null {
  if (!program.instanceCountProvenance) return null;

  // Collect instance patches
  const instancePatches = new Map<InstanceId, number>();

  for (const [key, newValue] of changes) {
    const entry = program.instanceCountProvenance.get(key);
    if (!entry) return null;

    // Parse: newCount must be a valid integer
    const newCount = typeof newValue === 'number' ? Math.floor(newValue) : parseInt(String(newValue), 10);
    if (!Number.isFinite(newCount)) return null;

    // Look up current instance declaration
    const instanceDecl = program.schedule.instances.get(entry.instanceId);
    if (!instanceDecl) return null;

    // Bounds: 0 <= newCount <= maxCount
    if (newCount < 0 || newCount > instanceDecl.maxCount) return null;

    // [LAW:one-source-of-truth] Fast-path count patches must stay within the
    // compiled arena descriptor capacity (single canonical slot layout source).
    const laneCapacity = resolveInstanceLaneCapacity(program, entry.instanceId);
    if (laneCapacity !== null && newCount > laneCapacity) return null;

    instancePatches.set(entry.instanceId, newCount);
  }

  if (instancePatches.size === 0) return null;

  // StateMappingField gate: If any StateMappingField references an affected instance,
  // fall back to full recompile (per-lane state requires schedule/state array rebuild).
  for (const mapping of program.schedule.stateMappings) {
    if (mapping.instanceId !== undefined && mapping.laneCount > 1 && instancePatches.has(mapping.instanceId)) {
      return null; // Fall back to full recompile
    }
  }

  // Patch InstanceDecl: shallow-copy instances map with updated counts
  const newInstances = new Map(program.schedule.instances);
  for (const [instanceId, newCount] of instancePatches) {
    const existing = newInstances.get(instanceId)!;
    newInstances.set(instanceId, { ...existing, count: newCount });
  }

  // Patch ScheduleIR: create new schedule with updated instances map.
  // steps, stateMappings, stateSlotCount are unchanged
  // (no field state for this instance per StateMappingField gate).
  const newSchedule: ScheduleIR = {
    ...program.schedule,
    instances: newInstances,
  };

  // Note: The const feeding the count port was excluded from constantProvenance
  // by buildProvenanceMaps (instanceCount ports are skipped). The count value is
  // consumed at compile time by createInstance(). At runtime, the schedule's
  // InstanceDecl.count is the authority. No ValueExpr patching needed.

  return {
    ...program,
    schedule: newSchedule,
  };
}

/**
 * Resolve the compiled lane capacity for all many-cardinality slots owned by an instance.
 *
 * Returns:
 * - number: minimum lane capacity across all slots for this instance
 * - null: instance has no many-cardinality slots (or unresolved descriptor)
 */
function resolveInstanceLaneCapacity(
  program: CompiledProgramIR,
  instanceId: InstanceId,
): number | null {
  const { slotMeta, arenaLayout } = program;
  let capacity: number | null = null;

  for (const meta of slotMeta) {
    const cardAxis = meta.type.extent.cardinality;
    if (cardAxis.kind !== 'inst') continue;
    if (!isMany(cardAxis.value)) continue;
    if (cardAxis.value.instance.instanceId !== instanceId) continue;

    const arenaDesc = arenaLayout[meta.slot as number];
    if (!arenaDesc) return null;

    capacity = capacity === null
      ? arenaDesc.laneCount
      : Math.min(capacity, arenaDesc.laneCount);
  }

  return capacity;
}

/**
 * Convert a raw user value to component ConstValues based on payload kind.
 * Returns null for unsupported payload kinds.
 */
function convertToConstValues(
  rawValue: unknown,
  payloadKind: string,
): ConstValue[] | null {
  switch (payloadKind) {
    case 'float':
      return [floatConst(rawValue as number)];
    case 'int':
      return [intConst(Math.floor(rawValue as number))];
    case 'bool':
      return [boolConst(Boolean(rawValue))];
    case 'vec2': {
      const v = rawValue as { x: number; y: number };
      return [floatConst(v.x), floatConst(v.y)];
    }
    case 'color': {
      const v = rawValue as { r: number; g: number; b: number; a: number };
      return [floatConst(v.r), floatConst(v.g), floatConst(v.b), floatConst(v.a)];
    }
    default:
      return null; // Unsupported kind → caller falls back to full recompile
  }
}
