import { describe, it, expect } from 'vitest';
import {
  createRuntimeState,
  prepareStateWriteBank,
  commitStateWriteBank,
} from '../RuntimeState';

describe('RuntimeState state-bank ownership', () => {
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

