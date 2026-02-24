/**
 * ExprAddressTable — single address-resolution structure per compiled program.
 *
 * [LAW:one-source-of-truth] All slot/expr/field address queries go through here.
 * WeakMap-cached per CompiledProgramIR (immutable after construction).
 *
 * Replaces the former three separate caches (SLOT_LOOKUP_CACHE,
 * FIELD_EXPR_SLOT_CACHE, SIG_TO_SLOT_CACHE) with one unified table
 * built in a single pass over runtimeSlots + schedule steps.
 */

import type { CompiledProgramIR } from '../compiler/ir/program';
import type { ValueSlot } from '../compiler/ir/Indices';
import { SCALAR_INSTANCE_ID } from '../compiler/ir/Indices';
import type { ScheduleIR } from '../compiler/backend/schedule-program';
import type { ArenaSlotDescriptor } from './ArenaValueStore';
import type { CanonicalType } from '../core/canonical-types';

/**
 * Slot lookup entry — maps a ValueSlot to its physical storage location.
 */
export interface SlotLookup {
  storage: 'f64' | 'f32' | 'i32' | 'u32' | 'object' | 'shape2d';
  offset: number;
  stride: number;
  slot: ValueSlot;
  /** Canonical value type for runtime/debug inspection. */
  type: CanonicalType;
}

/**
 * Unified address table: all slot/expr/field address queries in one structure.
 */
export interface ExprAddressTable {
  /** ValueSlot → physical storage location */
  readonly slotLookup: ReadonlyMap<ValueSlot, SlotLookup>;
  /** ValueExprId (materialized field expression) → target ValueSlot */
  readonly fieldExprToSlot: ReadonlyMap<number, ValueSlot>;
  /** Scalar ValueExprId → arena scalar offset */
  readonly scalarExprToArenaOffset: ReadonlyMap<number, number>;
  /**
   * ValueSlot → arena descriptor (excludes sentinels with offset < 0).
   * [LAW:one-source-of-truth] Single lookup replacing all direct program.arenaLayout[slot] accesses.
   */
  readonly slotToArena: ReadonlyMap<ValueSlot, ArenaSlotDescriptor>;
}

const TABLE_CACHE = new WeakMap<CompiledProgramIR, ExprAddressTable>();

/**
 * Get (or build) the ExprAddressTable for a compiled program.
 * Cached per program identity — safe to call every frame.
 */
export function getExprAddressTable(program: CompiledProgramIR): ExprAddressTable {
  const cached = TABLE_CACHE.get(program);
  if (cached) return cached;

  // 1. Build slot lookup/type/arena maps from compiler-provided runtimeSlots.
  // [LAW:one-source-of-truth] Runtime address resolution reads one canonical table.
  const slotLookup = new Map<ValueSlot, SlotLookup>();
  const slotToArena = new Map<ValueSlot, ArenaSlotDescriptor>();
  for (const slotEntry of program.runtimeSlots) {
    slotLookup.set(slotEntry.slot, {
      storage: slotEntry.storage,
      offset: slotEntry.offset,
      stride: slotEntry.stride,
      slot: slotEntry.slot,
      type: slotEntry.type,
    });
    if (slotEntry.arena.offset >= 0) {
      slotToArena.set(slotEntry.slot, slotEntry.arena);
    }
  }

  // 2. Build fieldExprToSlot and scalar lookup maps from schedule steps
  const fieldExprToSlot = new Map<number, ValueSlot>();
  const scalarExprToArenaOffset = new Map<number, number>();
  const steps = (program.schedule as ScheduleIR).steps;
  for (const step of steps) {
    if (step.kind === 'materialize') {
      fieldExprToSlot.set(step.field as number, step.target);
      // [LAW:one-source-of-truth] Scalar materialization (SCALAR_INSTANCE_ID)
      // produces scalar-expression addressable slots for RenderAssembler/extract lookups.
      if (step.instanceId === SCALAR_INSTANCE_ID) {
        const lookup = slotLookup.get(step.target);
        const arenaDesc = slotToArena.get(step.target);
        if (arenaDesc) {
          scalarExprToArenaOffset.set(step.field as number, arenaDesc.offset);
        }
      }
    }
    if (step.kind === 'evalOne') {
      const arenaDesc = slotToArena.get(step.target);
      if (arenaDesc) {
        scalarExprToArenaOffset.set(step.expr as number, arenaDesc.offset);
      }
    }
  }

  const table: ExprAddressTable = {
    slotLookup,
    fieldExprToSlot,
    scalarExprToArenaOffset,
    slotToArena,
  };
  TABLE_CACHE.set(program, table);
  return table;
}

export function assertSlotExists(slotLookupMap: ReadonlyMap<ValueSlot, SlotLookup>, slot: ValueSlot, what: string): SlotLookup {
  const lookup = slotLookupMap.get(slot);
  if (!lookup) throw new Error('Missing slot lookup entry for ' + what + ' (slot ' + slot + ')');
  return lookup;
}

export function isNumericStorage(storage: SlotLookup['storage']): storage is 'f64' | 'f32' | 'i32' | 'u32' {
  return storage === 'f64' || storage === 'f32' || storage === 'i32' || storage === 'u32';
}

export function assertNumericStride(
  slotLookupMap: ReadonlyMap<ValueSlot, SlotLookup>,
  slot: ValueSlot,
  expectedStride: number,
  what: string,
): SlotLookup {
  const lookup = assertSlotExists(slotLookupMap, slot, what);
  if (!isNumericStorage(lookup.storage)) {
    throw new Error(what + ' must be numeric storage, got ' + lookup.storage);
  }
  if (lookup.stride !== expectedStride) {
    throw new Error(what + ' must have stride=' + expectedStride + ', got ' + lookup.stride);
  }
  return lookup;
}
