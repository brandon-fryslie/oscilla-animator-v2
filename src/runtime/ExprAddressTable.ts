/**
 * ExprAddressTable — single address-resolution structure per compiled program.
 *
 * [LAW:one-source-of-truth] All slot/expr/field address queries go through here.
 * The table is compiler-emitted and consumed as-is at runtime.
 */

import type {
  CompiledProgramIR,
  RuntimeAddressTableIR,
  RuntimeSlotLookupEntry,
} from '../compiler/ir/program';
import type { ValueSlot } from '../compiler/ir/Indices';
import type { ArenaSlotDescriptor } from './ArenaValueStore';
export type SlotLookup = RuntimeSlotLookupEntry;
export type ExprAddressTable = RuntimeAddressTableIR;

/**
 * Get the precomputed ExprAddressTable for a compiled program.
 * [LAW:single-enforcer] Runtime does not derive address tables operationally.
 */
export function getExprAddressTable(program: CompiledProgramIR): ExprAddressTable {
  if (!program.runtimeAddressTable) {
    throw new Error(
      'Missing precomputed runtimeAddressTable on CompiledProgramIR; legacy metadata-based runtime address derivation is forbidden',
    );
  }
  return program.runtimeAddressTable;
}

export function assertSlotExists(slotLookupMap: ReadonlyMap<ValueSlot, SlotLookup>, slot: ValueSlot, what: string): SlotLookup {
  const lookup = slotLookupMap.get(slot);
  if (!lookup) throw new Error('Missing slot lookup entry for ' + what + ' (slot ' + slot + ')');
  return lookup;
}

export function isNumericStorage(storage: SlotLookup['storage']): storage is 'f32' | 'i32' | 'u32' {
  return storage === 'f32' || storage === 'i32' || storage === 'u32';
}

export function assertNumericStride(
  slotLookupMap: ReadonlyMap<ValueSlot, SlotLookup>,
  slot: ValueSlot,
  expectedStride: number,
  what: string,
): SlotLookup {
  const lookup = assertSlotExists(slotLookupMap, slot, what);
  if (!isNumericStorage(lookup.storage)) {
    throw new Error(what + ' must use canonical numeric storage, got ' + lookup.storage);
  }
  if (lookup.stride !== expectedStride) {
    throw new Error(what + ' must have stride=' + expectedStride + ', got ' + lookup.stride);
  }
  return lookup;
}

/**
 * Resolve canonical SoA arena index for a slot lane/component.
 */
export function resolveSoaArenaIndex(
  slotToArena: ReadonlyMap<ValueSlot, ArenaSlotDescriptor>,
  slot: ValueSlot,
  lane: number,
  component: number,
): number {
  const arenaDesc = slotToArena.get(slot);
  if (!arenaDesc) {
    throw new Error('Missing arena descriptor for slot ' + slot);
  }
  return arenaDesc.offset + component * arenaDesc.laneCount + lane;
}
