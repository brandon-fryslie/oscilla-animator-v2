/**
 * ExprAddressTable — single address-resolution structure per compiled program.
 *
 * [LAW:one-source-of-truth] All slot/expr/field address queries go through here.
 * WeakMap-cached per CompiledProgramIR (immutable after construction).
 *
 * Replaces the former three separate caches (SLOT_LOOKUP_CACHE,
 * FIELD_EXPR_SLOT_CACHE, SIG_TO_SLOT_CACHE) with one unified table
 * built in a single pass over slotMeta + schedule steps.
 */

import type { CompiledProgramIR } from '../compiler/ir/program';
import type { ValueSlot } from '../compiler/ir/Indices';
import { SCALAR_INSTANCE_ID } from '../compiler/ir/Indices';
import type { ScheduleIR } from '../compiler/backend/schedule-program';
import type { ArenaSlotDescriptor } from './ArenaValueStore';

/**
 * Slot lookup entry — maps a ValueSlot to its physical storage location.
 */
export interface SlotLookup {
  storage: 'f64' | 'f32' | 'i32' | 'u32' | 'object' | 'shape2d';
  offset: number;
  stride: number;
  slot: ValueSlot;
}

/**
 * Unified address table: all slot/expr/field address queries in one structure.
 */
export interface ExprAddressTable {
  /** ValueSlot → physical storage location */
  readonly slotLookup: ReadonlyMap<ValueSlot, SlotLookup>;
  /** FieldExprId → materialization target ValueSlot */
  readonly fieldExprToSlot: ReadonlyMap<number, ValueSlot>;
  /** Scalar ValueExprId → f64 physical offset */
  readonly scalarExprToF64Offset: ReadonlyMap<number, number>;
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

  // 1. Build slotLookup from slotMeta, and slotToArena from arenaLayout (excludes sentinels).
  // [LAW:one-source-of-truth] All per-slot arena lookups go through slotToArena — no direct
  // program.arenaLayout[slot] accesses in consumers.
  const slotLookup = new Map<ValueSlot, SlotLookup>();
  const slotToArena = new Map<ValueSlot, ArenaSlotDescriptor>();
  for (const meta of program.slotMeta) {
    if (meta.stride == null) {
      throw new Error('slotMeta missing required stride for slot ' + meta.slot);
    }
    slotLookup.set(meta.slot, {
      storage: meta.storage,
      offset: meta.offset,
      stride: meta.stride,
      slot: meta.slot,
    });
    const arenaDesc = program.arenaLayout[meta.slot as number];
    if (arenaDesc && arenaDesc.offset >= 0) {
      slotToArena.set(meta.slot, arenaDesc);
    }
  }

  // 2. Build fieldExprToSlot and scalar lookup maps from schedule steps
  const fieldExprToSlot = new Map<number, ValueSlot>();
  const scalarExprToF64Offset = new Map<number, number>();
  const scalarExprToArenaOffset = new Map<number, number>();
  const steps = (program.schedule as ScheduleIR).steps;
  for (const step of steps) {
    if (step.kind === 'materialize') {
      fieldExprToSlot.set(step.field as number, step.target);
      // [LAW:one-source-of-truth] Scalar materialization (SCALAR_INSTANCE_ID)
      // produces scalar-expression addressable slots for RenderAssembler/extract lookups.
      if (step.instanceId === SCALAR_INSTANCE_ID) {
        const lookup = slotLookup.get(step.target);
        if (lookup) {
          scalarExprToF64Offset.set(step.field as number, lookup.offset);
        }
        const arenaDesc = slotToArena.get(step.target);
        if (arenaDesc) {
          scalarExprToArenaOffset.set(step.field as number, arenaDesc.offset);
        }
      }
    }
    if (step.kind === 'evalValue' && step.target.storage === 'value') {
      const lookup = slotLookup.get(step.target.slot);
      if (lookup) {
        scalarExprToF64Offset.set(step.expr as number, lookup.offset);
      }
      const arenaDesc = slotToArena.get(step.target.slot);
      if (arenaDesc) {
        scalarExprToArenaOffset.set(step.expr as number, arenaDesc.offset);
      }
    }
  }

  const table: ExprAddressTable = {
    slotLookup,
    fieldExprToSlot,
    scalarExprToF64Offset,
    scalarExprToArenaOffset,
    slotToArena,
  };
  TABLE_CACHE.set(program, table);
  return table;
}

export function assertSlotExists(slotLookupMap: ReadonlyMap<ValueSlot, SlotLookup>, slot: ValueSlot, what: string): SlotLookup {
  const lookup = slotLookupMap.get(slot);
  if (!lookup) throw new Error('Missing slotMeta entry for ' + what + ' (slot ' + slot + ')');
  return lookup;
}

export function assertF64Stride(
  slotLookupMap: ReadonlyMap<ValueSlot, SlotLookup>,
  slot: ValueSlot,
  expectedStride: number,
  what: string,
): SlotLookup {
  const lookup = assertSlotExists(slotLookupMap, slot, what);
  if (lookup.storage !== 'f64') {
    throw new Error(what + ' must be f64 storage, got ' + lookup.storage);
  }
  if (lookup.stride !== expectedStride) {
    throw new Error(what + ' must have stride=' + expectedStride + ', got ' + lookup.stride);
  }
  return lookup;
}
