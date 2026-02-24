import { describe, expect, it } from 'vitest';
import { createInitialState, migrateState } from '../StateMigration';
import type { StateMapping } from '../../compiler/ir/types';
import { stableStateId } from '../../compiler/ir/types';
import { instanceId } from '../../core/ids';
import type { MappingState } from '../ContinuityState';

describe('StateMigration', () => {
  it('initializes scalar and field mappings from one state contract', () => {
    const mappings: StateMapping[] = [
      {
        stateId: stableStateId('b0', 'scalar'),
        slotStart: 0,
        laneCount: 1,
        stride: 1,
        initial: [3],
      },
      {
        stateId: stableStateId('b1', 'field'),
        slotStart: 1,
        laneCount: 2,
        stride: 2,
        initial: [7, 9],
        instanceId: instanceId('inst_0'),
      },
    ];

    const state = createInitialState(5, mappings);
    expect(Array.from(state)).toEqual([3, 7, 9, 7, 9]);
  });

  it('migrates scalar values by stable state id when slot moves', () => {
    const oldMappings: StateMapping[] = [
      {
        stateId: stableStateId('b0', 'delay'),
        slotStart: 0,
        laneCount: 1,
        stride: 1,
        initial: [0],
      },
    ];
    const newMappings: StateMapping[] = [
      {
        stateId: stableStateId('b0', 'delay'),
        slotStart: 4,
        laneCount: 1,
        stride: 1,
        initial: [0],
      },
    ];

    const oldState = new Float32Array([42]);
    const newState = new Float32Array(6);
    const result = migrateState(oldState, newState, oldMappings, newMappings, () => null);

    expect(result.scalarsMigrated).toBe(1);
    expect(newState[4]).toBe(42);
  });

  it('migrates field values using lane mapping', () => {
    const oldMappings: StateMapping[] = [
      {
        stateId: stableStateId('b1', 'slew'),
        slotStart: 0,
        laneCount: 3,
        stride: 1,
        initial: [0],
        instanceId: instanceId('inst_0'),
      },
    ];
    const newMappings: StateMapping[] = [
      {
        stateId: stableStateId('b1', 'slew'),
        slotStart: 0,
        laneCount: 3,
        stride: 1,
        initial: [0],
        instanceId: instanceId('inst_0'),
      },
    ];
    const remap: MappingState = { newToOld: new Int32Array([2, 0, 1]) };

    const oldState = new Float32Array([10, 20, 30]);
    const newState = new Float32Array(3);
    const result = migrateState(oldState, newState, oldMappings, newMappings, () => remap);

    expect(result.fieldsMigrated).toBe(1);
    expect(Array.from(newState)).toEqual([30, 10, 20]);
  });

  it('reinitializes when lane semantics change from scalar to field', () => {
    const oldMappings: StateMapping[] = [
      {
        stateId: stableStateId('b2', 'state'),
        slotStart: 0,
        laneCount: 1,
        stride: 1,
        initial: [0],
      },
    ];
    const newMappings: StateMapping[] = [
      {
        stateId: stableStateId('b2', 'state'),
        slotStart: 0,
        laneCount: 2,
        stride: 1,
        initial: [5],
        instanceId: instanceId('inst_1'),
      },
    ];

    const oldState = new Float32Array([99]);
    const newState = new Float32Array(2);
    const result = migrateState(oldState, newState, oldMappings, newMappings, () => null);

    expect(result.initialized).toBe(1);
    expect(Array.from(newState)).toEqual([5, 5]);
  });

  it('treats instance-scoped laneCount=1 state as field', () => {
    const oldMappings: StateMapping[] = [
      {
        stateId: stableStateId('b3', 'state'),
        slotStart: 0,
        laneCount: 1,
        stride: 1,
        initial: [0],
        instanceId: instanceId('inst_2'),
      },
    ];
    const newMappings: StateMapping[] = [
      {
        stateId: stableStateId('b3', 'state'),
        slotStart: 0,
        laneCount: 1,
        stride: 1,
        initial: [0],
        instanceId: instanceId('inst_2'),
      },
    ];
    const remap: MappingState = { newToOld: new Int32Array([0]) };

    const oldState = new Float32Array([77]);
    const newState = new Float32Array(1);
    const result = migrateState(oldState, newState, oldMappings, newMappings, () => remap);

    expect(result.fieldsMigrated).toBe(1);
    expect(result.scalarsMigrated).toBe(0);
    expect(newState[0]).toBe(77);
  });
});
