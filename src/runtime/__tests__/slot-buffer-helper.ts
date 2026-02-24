import type { ValueSlot } from '../../types';
import type { RuntimeState } from '../RuntimeState';
import type { ArenaSlotDescriptor } from '../ArenaValueStore';
import { arenaEncodeFromAoS } from '../ArenaValueStore';
import type { RuntimeScalarArenaAddress } from '../../compiler/ir/program';

export type TestSlotBuffer = Float32Array | Uint8ClampedArray;

const slotBuffersByState = new WeakMap<RuntimeState, Map<ValueSlot, TestSlotBuffer>>();

function ensureSlotBufferMap(state: RuntimeState): Map<ValueSlot, TestSlotBuffer> {
  let buffers = slotBuffersByState.get(state);
  if (!buffers) {
    buffers = new Map<ValueSlot, TestSlotBuffer>();
    slotBuffersByState.set(state, buffers);
  }
  return buffers;
}

export function setTestSlotBuffer(state: RuntimeState, slot: ValueSlot, value: TestSlotBuffer): void {
  ensureSlotBufferMap(state).set(slot, value);
}

export function getTestSlotBuffer(
  state: RuntimeState,
  slot: ValueSlot,
): TestSlotBuffer | undefined {
  return ensureSlotBufferMap(state).get(slot);
}

export function buildSlotToArenaFromTestBuffers(
  state: RuntimeState,
  specs: ReadonlyArray<{ slot: ValueSlot; stride: number }>,
  startOffset: number = 32,
): ReadonlyMap<ValueSlot, ArenaSlotDescriptor> {
  // [LAW:one-source-of-truth] Tests mirror numeric slot payloads from one
  // canonical test buffer map into arena descriptors for render assembly.
  const slotToArena = new Map<ValueSlot, ArenaSlotDescriptor>();
  let offset = startOffset;
  for (const spec of specs) {
    const source = getTestSlotBuffer(state, spec.slot);
    if (!(source instanceof Float32Array || source instanceof Uint8ClampedArray)) {
      continue;
    }
    const data =
      source instanceof Float32Array
        ? source
        : Float32Array.from(source, (v) => v / 255);
    const laneCount = spec.stride > 0 ? Math.floor(data.length / spec.stride) : 0;
    const componentOffsets = new Array<number>(spec.stride);
    for (let c = 0; c < spec.stride; c++) componentOffsets[c] = c * laneCount;
    const desc: ArenaSlotDescriptor = {
      offset,
      stride: spec.stride,
      laneCount,
      length: data.length,
      componentOffsets,
    };
    arenaEncodeFromAoS(state.arena, desc, data);
    slotToArena.set(spec.slot, {
      ...desc,
    });
    offset += data.length;
  }
  return slotToArena;
}

export function buildScalarExprToArenaAddressFromOffsets(
  scalarExprToArenaOffset: ReadonlyMap<number, number>,
): ReadonlyMap<number, RuntimeScalarArenaAddress> {
  const scalarExprToArenaAddress = new Map<number, RuntimeScalarArenaAddress>();
  for (const [exprId, offset] of scalarExprToArenaOffset) {
    scalarExprToArenaAddress.set(exprId, {
      slot: offset as ValueSlot,
      arena: {
        offset,
        stride: 1,
        laneCount: 1,
        length: 1,
        packing: 'soa',
        laneStride: 1,
        componentStride: 1,
      },
      component: 0,
    });
  }
  return scalarExprToArenaAddress;
}
