/**
 * Value Inspector — Read-only slot inspection utilities
 *
 * Functions for reading runtime state values and detecting anomalies (NaN, Infinity).
 * Used by the step debugger to snapshot slot values after each step.
 */

import type { RuntimeState } from './RuntimeState';
import { readShape2D } from './RuntimeState';
import type { CompiledProgramIR } from '../compiler/ir/program';
import type { ValueSlot } from '../compiler/ir/Indices';
import type { BlockId, PortId } from '../types';
import type { SlotLookup } from './ExprAddressTable';
import { getExprAddressTable } from './ExprAddressTable';
import type { SlotValue, ValueAnomaly, LaneIdentity } from './StepDebugTypes';
import type { InstanceId } from '../core/ids';
import type { ContinuityState } from './ContinuityState';
import { arenaIndex, type ArenaSlotDescriptor } from './ArenaValueStore';

/**
 * Read the current value of a slot from runtime state.
 *
 * @param state - Runtime state to read from
 * @param lookup - Pre-computed slot lookup (from ExprAddressTable)
 * @returns Typed slot value snapshot
 */
export function readSlotValue(
  state: RuntimeState,
  lookup: SlotLookup,
  slotToArena?: ReadonlyMap<ValueSlot, ArenaSlotDescriptor>,
): SlotValue {
  switch (lookup.storage) {
    case 'f32':
    case 'i32':
    case 'u32': {
      const arenaDesc = slotToArena?.get(lookup.slot);
      if (!arenaDesc) {
        throw new Error(`readSlotValue: missing arena descriptor for numeric slot ${lookup.slot}`);
      }
      if (lookup.stride === 1) {
        return {
          kind: 'scalar',
          value: state.arena[arenaIndex(arenaDesc, 0, 0)],
          type: lookup.type,
        };
      }
      // Multi-component: copy the values into a snapshot buffer
      const buffer = new Float64Array(lookup.stride);
      for (let i = 0; i < lookup.stride; i++) {
        buffer[i] = state.arena[arenaIndex(arenaDesc, 0, i)];
      }
      return {
        kind: 'buffer',
        buffer,
        count: lookup.stride,
        type: lookup.type,
      };
    }

    case 'shape2d': {
      const record = readShape2D(state.values.shape2d, lookup.offset);
      return { kind: 'object', ref: record };
    }

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
  const addressTable = getExprAddressTable(program);
  const lookupMap = slotLookupMap ?? addressTable.slotLookup;
  const result = new Map<ValueSlot, SlotValue>();

  // Find all slots belonging to this block
  for (const [slot, ownerBlockId] of program.debugIndex.slotToBlock) {
    if (ownerBlockId !== blockId) continue;

    const lookup = lookupMap.get(slot);
    if (!lookup) continue;

    result.set(slot, readSlotValue(state, lookup, addressTable.slotToArena));
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
