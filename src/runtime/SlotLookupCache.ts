/**
 * Slot Lookup Cache - Shared slot lookup utilities
 *
 * Extracted from ScheduleExecutor.ts so both executeFrame() and
 * executeFrameStepped() use the same caches.
 *
 * These WeakMap-cached functions avoid per-frame Map allocation by
 * caching lookup tables keyed on the (immutable) CompiledProgramIR.
 */

import type { CompiledProgramIR, ValueSlot } from '../compiler/ir/program';
import type { ScheduleIR } from '../compiler/backend/schedule-program';

/**
 * Slot lookup cache entry — maps a ValueSlot to its physical storage location.
 */
export interface SlotLookup {
  storage: 'f64' | 'f32' | 'i32' | 'u32' | 'object' | 'shape2d';
  offset: number;
  stride: number;
  slot: ValueSlot;
}

// Cache slot lookup tables per compiled program to avoid per-frame Map allocation.
const SLOT_LOOKUP_CACHE = new WeakMap<CompiledProgramIR, Map<ValueSlot, SlotLookup>>();

// Cache fieldExprId->slot mapping per program (deterministic per schedule).
const FIELD_EXPR_SLOT_CACHE = new WeakMap<CompiledProgramIR, Map<number, ValueSlot>>();

// Cache signalExprId->slot mapping per program (deterministic per schedule).
const SIG_TO_SLOT_CACHE = new WeakMap<CompiledProgramIR, Map<number, number>>();

export function getSlotLookupMap(program: CompiledProgramIR): Map<ValueSlot, SlotLookup> {
  const cached = SLOT_LOOKUP_CACHE.get(program);
  if (cached) return cached;
  const map = new Map<ValueSlot, SlotLookup>();
  for (const meta of program.slotMeta) {
    if (meta.stride == null) {
      throw new Error(`slotMeta missing required stride for slot ${meta.slot}`);
    }
    map.set(meta.slot, {
      storage: meta.storage,
      offset: meta.offset,
      stride: meta.stride,
      slot: meta.slot,
    });
  }
  SLOT_LOOKUP_CACHE.set(program, map);
  return map;
}

export function getFieldExprToSlotMap(program: CompiledProgramIR): Map<number, ValueSlot> {
  const cached = FIELD_EXPR_SLOT_CACHE.get(program);
  if (cached) return cached;
  const map = new Map<number, ValueSlot>();
  const steps = (program.schedule as ScheduleIR).steps;
  for (const s of steps) {
    if (s.kind === 'materialize') {
      map.set(s.field as number, s.target);
    }
  }
  FIELD_EXPR_SLOT_CACHE.set(program, map);
  return map;
}

export function getSigToSlotMap(
  program: CompiledProgramIR,
  slotLookupMap: Map<ValueSlot, SlotLookup>
): Map<number, number> {
  const cached = SIG_TO_SLOT_CACHE.get(program);
  if (cached) return cached;
  const map = new Map<number, number>();
  const steps = (program.schedule as ScheduleIR).steps;
  for (const step of steps) {
    if (step.kind === 'evalValue' && step.target.storage === 'value') {
      const lookup = slotLookupMap.get(step.target.slot);
      if (lookup) {
        // Map ValueExprId -> physical f64 offset (not slot id)
        map.set(step.expr as number, lookup.offset);
      }
    }
  }
  SIG_TO_SLOT_CACHE.set(program, map);
  return map;
}

export function assertSlotExists(slotLookupMap: Map<ValueSlot, SlotLookup>, slot: ValueSlot, what: string): SlotLookup {
  const lookup = slotLookupMap.get(slot);
  if (!lookup) throw new Error(`Missing slotMeta entry for ${what} (slot ${slot})`);
  return lookup;
}

export function assertF64Stride(
  slotLookupMap: Map<ValueSlot, SlotLookup>,
  slot: ValueSlot,
  expectedStride: number,
  what: string,
): SlotLookup {
  const lookup = assertSlotExists(slotLookupMap, slot, what);
  if (lookup.storage !== 'f64') {
    throw new Error(`${what} must be f64 storage, got ${lookup.storage}`);
  }
  if (lookup.stride !== expectedStride) {
    throw new Error(`${what} must have stride=${expectedStride}, got ${lookup.stride}`);
  }
  return lookup;
}
