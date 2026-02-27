import { describe, it, expect } from 'vitest';
import {
  createRuntimeState,
  prepareArenaWriteBank,
  commitArenaWriteBank,
  prepareStateWriteBank,
  commitStateWriteBank,
} from '../RuntimeState';

describe('RuntimeState state-bank ownership', () => {
  it('allocates explicit read/write arena banks and toggles parity on swap', () => {
    const state = createRuntimeState(0, 0, 0, 0, 0, 6, 0);
    expect(state.arenaRead).toBeDefined();
    expect(state.arenaWrite).toBeDefined();
    expect(state.arenaRead).not.toBe(state.arenaWrite);
    expect(state.arena).toBe(state.arenaRead);
    expect(state.arenaParity).toBe(0);

    state.arenaRead![0] = 3;
    state.arenaRead![1] = 4;
    prepareArenaWriteBank(state);

    expect(state.arena).toBe(state.arenaWrite);
    expect(Array.from(state.arenaWrite!.subarray(0, 2))).toEqual([3, 4]);

    state.arena[0] = 9;
    const previousRead = state.arenaRead;
    const previousWrite = state.arenaWrite;
    commitArenaWriteBank(state);

    expect(state.arenaParity).toBe(1);
    expect(state.arenaRead).toBe(previousWrite);
    expect(state.arenaWrite).toBe(previousRead);
    expect(state.arena).toBe(state.arenaRead);
    expect(state.arena[0]).toBe(9);
  });

  it('allocates explicit read/write banks for persistent state', () => {
    const state = createRuntimeState(
      0, // slotCount (compat arg)
      4, // stateSlotCount
      0, // eventSlotCount
      0, // eventExprCount
      0, // valueExprCount
      10, // arenaTotalFloats
      0, // shape2dSlotCount
    );

    expect(state.state.length).toBe(4);
    expect(state.stateWrite?.length).toBe(4);
    expect(state.stateWrite).toBeDefined();
    expect(state.stateWrite).not.toBe(state.state);
    expect(state.stateArena.bankLength).toBe(4);
    expect(state.stateArena.length).toBe(8);
    expect(state.stateArena.readOffset).toBe(10);
    expect(state.stateArena.writeOffset).toBe(14);
  });

  it('prepares and commits phase-2 state writes via bank swap', () => {
    const state = createRuntimeState(0, 3, 0, 0, 0, 5, 0);
    state.state[0] = 1;
    state.state[1] = 2;
    state.state[2] = 3;

    const initialReadOffset = state.stateArena.readOffset;
    const initialWriteOffset = state.stateArena.writeOffset;

    prepareStateWriteBank(state);
    expect(Array.from(state.stateWrite ?? [])).toEqual([1, 2, 3]);

    state.stateWrite![1] = 99;
    commitStateWriteBank(state);

    expect(Array.from(state.state)).toEqual([1, 99, 3]);
    expect(state.stateWrite?.[1]).toBe(2);
    expect(state.stateArena.readOffset).toBe(initialWriteOffset);
    expect(state.stateArena.writeOffset).toBe(initialReadOffset);
  });
});
