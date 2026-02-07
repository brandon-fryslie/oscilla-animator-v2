/**
 * Value Inspector — Read-only slot inspection utilities
 *
 * Functions for reading runtime state values and detecting anomalies (NaN, Infinity).
 * Used by the step debugger to snapshot slot values after each step.
 */

import type { RuntimeState } from './RuntimeState';
import { readShape2D } from './RuntimeState';
import type { CompiledProgramIR, ValueSlot, BlockId, PortId, SlotMetaEntry } from '../compiler/ir/program';
import type { SlotLookup } from './SlotLookupCache';
import { getSlotLookupMap } from './SlotLookupCache';
import type { SlotValue, ValueAnomaly, LaneIdentity } from './StepDebugTypes';
import type { InstanceId } from '../core/ids';
import type { ContinuityState } from './ContinuityState';

/**
 * Read the current value of a slot from runtime state.
 *
 * @param state - Runtime state to read from
 * @param lookup - Pre-computed slot lookup (from SlotLookupCache)
 * @param meta - Slot metadata (for type information)
 * @returns Typed slot value snapshot
 */
export function readSlotValue(
  state: RuntimeState,
  lookup: SlotLookup,
  meta: SlotMetaEntry,
): SlotValue {
  switch (lookup.storage) {
    case 'f64': {
      if (lookup.stride === 1) {
        return {
          kind: 'scalar',
          value: state.values.f64[lookup.offset],
          type: meta.type,
        };
      }
      // Multi-component: copy the values into a snapshot buffer
      const buffer = new Float64Array(lookup.stride);
      for (let i = 0; i < lookup.stride; i++) {
        buffer[i] = state.values.f64[lookup.offset + i];
      }
      return {
        kind: 'buffer',
        buffer,
        count: lookup.stride,
        type: meta.type,
      };
    }

    case 'object': {
      const ref = state.values.objects.get(lookup.slot);
      if (ref instanceof Float32Array || ref instanceof Float64Array ||
          ref instanceof Uint8Array || ref instanceof Uint8ClampedArray ||
          ref instanceof Int32Array || ref instanceof Uint32Array) {
        return {
          kind: 'buffer',
          buffer: ref,
          count: ref.length,
          type: meta.type,
        };
      }
      return { kind: 'object', ref };
    }

    case 'shape2d': {
      const record = readShape2D(state.values.shape2d, lookup.offset);
      return { kind: 'object', ref: record };
    }

    case 'f32':
    case 'i32':
    case 'u32':
      // Future storage types — return as object for now
      return { kind: 'object', ref: undefined };

    default: {
      const _: never = lookup.storage;
      throw new Error(`Unknown storage type: ${_ as string}`);
    }
  }
}

/**
 * Read a slot value for an event target.
 *
 * @param state - Runtime state
 * @param eventSlot - Event slot index
 * @returns SlotValue representing whether the event fired
 */
export function readEventSlotValue(
  state: RuntimeState,
  eventSlot: number,
): SlotValue {
  return {
    kind: 'event',
    fired: state.eventScalars[eventSlot] !== 0,
  };
}

/**
 * Detect anomalies (NaN, Infinity, -Infinity) in a set of written slot values.
 *
 * @param writtenSlots - Map of slot -> value snapshots to check
 * @param debugIndex - Debug index for block/port provenance (optional)
 * @returns Array of detected anomalies
 */
export function detectAnomalies(
  writtenSlots: ReadonlyMap<ValueSlot, SlotValue>,
  debugIndex?: CompiledProgramIR['debugIndex'],
): readonly ValueAnomaly[] {
  const anomalies: ValueAnomaly[] = [];

  for (const [slot, value] of writtenSlots) {
    const blockId = debugIndex?.slotToBlock.get(slot) ?? null;
    const portId = debugIndex?.slotToPort.get(slot) ?? null;

    if (value.kind === 'scalar') {
      checkNumber(value.value, slot, blockId, portId, anomalies);
    } else if (value.kind === 'buffer') {
      // Check typed array elements
      if (value.buffer instanceof Float64Array || value.buffer instanceof Float32Array) {
        for (let i = 0; i < value.buffer.length; i++) {
          checkNumber(value.buffer[i], slot, blockId, portId, anomalies);
        }
      }
    }
  }

  return anomalies;
}

function checkNumber(
  n: number,
  slot: ValueSlot,
  blockId: BlockId | null,
  portId: PortId | null,
  out: ValueAnomaly[],
): void {
  if (Number.isNaN(n)) {
    out.push({ slot, kind: 'nan', blockId, portId });
  } else if (n === Infinity) {
    out.push({ slot, kind: 'infinity', blockId, portId });
  } else if (n === -Infinity) {
    out.push({ slot, kind: 'neg-infinity', blockId, portId });
  }
}

/**
 * Inspect all slots associated with a block.
 *
 * @param blockId - Block to inspect
 * @param program - Compiled program IR
 * @param state - Runtime state
 * @param slotLookupMap - Pre-computed slot lookup map
 * @returns Map of slot -> value for all slots belonging to the block
 */
export function inspectBlockSlots(
  blockId: BlockId,
  program: CompiledProgramIR,
  state: RuntimeState,
  slotLookupMap?: Map<ValueSlot, SlotLookup>,
): Map<ValueSlot, SlotValue> {
  const lookupMap = slotLookupMap ?? getSlotLookupMap(program);
  const result = new Map<ValueSlot, SlotValue>();

  // Build a slot-to-meta index for quick lookup
  const slotToMeta = new Map<ValueSlot, SlotMetaEntry>();
  for (const meta of program.slotMeta) {
    slotToMeta.set(meta.slot, meta);
  }

  // Find all slots belonging to this block
  for (const [slot, ownerBlockId] of program.debugIndex.slotToBlock) {
    if (ownerBlockId !== blockId) continue;

    const lookup = lookupMap.get(slot);
    const meta = slotToMeta.get(slot);
    if (!lookup || !meta) continue;

    result.set(slot, readSlotValue(state, lookup, meta));
  }

  return result;
}

// =============================================================================
// Temporal Comparison (cross-frame deltas)
// =============================================================================

export interface SlotDelta {
  readonly current: number;
  readonly previous: number;
  readonly delta: number;
}

/**
 * Compute per-slot deltas between the current snapshot's scalar slots and
 * previous frame values. Only includes slots present in both maps.
 *
 * @param currentSlots - Current frame's written slot values
 * @param previousValues - Previous frame's scalar slot values (null on first frame)
 * @returns Map of slot -> delta info for slots that existed in both frames
 */
export function computeSlotDeltas(
  currentSlots: ReadonlyMap<ValueSlot, SlotValue>,
  previousValues: ReadonlyMap<ValueSlot, number> | null,
): ReadonlyMap<ValueSlot, SlotDelta> {
  const result = new Map<ValueSlot, SlotDelta>();
  if (!previousValues) return result;

  for (const [slot, value] of currentSlots) {
    if (value.kind !== 'scalar') continue;
    const prev = previousValues.get(slot);
    if (prev === undefined) continue;
    result.set(slot, {
      current: value.value,
      previous: prev,
      delta: value.value - prev,
    });
  }

  return result;
}

// =============================================================================
// Lane Identity (F5: Continuity State Integration)
// =============================================================================

/**
 * Build a map from field slots to their per-lane identity information.
 *
 * Iterates over `program.fieldSlotRegistry` to determine which instance owns each
 * field slot, then uses `program.schedule.instances` for element counts and
 * optionally enriches with element IDs from continuity state.
 *
 * @param program - Compiled program IR
 * @param continuity - Continuity state (for element identity enrichment)
 * @returns Map from field ValueSlot to array of LaneIdentity entries
 */
export function buildLaneIdentityMap(
  program: CompiledProgramIR,
  continuity: ContinuityState | null,
): ReadonlyMap<ValueSlot, readonly LaneIdentity[]> {
  const result = new Map<ValueSlot, readonly LaneIdentity[]>();
  const instances = program.schedule.instances;

  for (const [slot, entry] of program.fieldSlotRegistry) {
    const instanceDecl = instances.get(entry.instanceId);
    if (!instanceDecl) continue;

    const count = typeof instanceDecl.count === 'number' ? instanceDecl.count : 0;
    if (count === 0) continue;

    // Derive a human-readable label for the instance
    const instanceLabel = resolveInstanceLabel(entry.instanceId, program.debugIndex);

    // Look up element IDs from continuity state (enrichment)
    const prevDomain = continuity?.prevDomains.get(entry.instanceId as string);
    const hasElementIds = prevDomain?.identityMode === 'stable' && prevDomain.elementId.length > 0;

    const lanes: LaneIdentity[] = new Array(count);
    for (let i = 0; i < count; i++) {
      lanes[i] = {
        instanceId: entry.instanceId,
        instanceLabel,
        laneIndex: i,
        totalLanes: count,
        elementId: hasElementIds && i < prevDomain!.elementId.length
          ? `element #${prevDomain!.elementId[i]}`
          : undefined,
      };
    }

    result.set(slot, lanes);
  }

  return result;
}

/**
 * Resolve a human-readable label for an instance.
 * Uses debugIndex.blockMap to find the source block's string ID.
 */
function resolveInstanceLabel(
  instId: InstanceId,
  debugIndex: CompiledProgramIR['debugIndex'],
): string {
  // Instance IDs are often derived from block IDs. Try blockMap for a match.
  for (const [blockId, blockStringId] of debugIndex.blockMap) {
    // BlockMap maps numeric BlockId → string ID.
    // Instance IDs often contain the block's string ID as a substring.
    if ((instId as string).includes(blockStringId)) {
      return blockStringId;
    }
    // Also check if the numeric blockId matches (unlikely but defensive)
    if ((instId as string) === String(blockId)) {
      return blockStringId;
    }
  }

  // Fallback: use the raw instance ID string
  return instId as string;
}
