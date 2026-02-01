/**
 * IO Blocks Tests
 *
 * Tests for ExternalInput, ExternalGate, and ExternalVec2 blocks.
 */

import { describe, it, expect } from 'vitest';
import { FLOAT, INT, BOOL, VEC2, VEC3, COLOR,  CAMERA_PROJECTION } from '../../core/canonical-types';
import {
  getBlockDefinition,
  requireBlockDef,
  getBlockTypesByCategory,
  getAllBlockTypes,
} from '../registry';

// Import blocks to register them
import '../io-blocks';

describe('IO Blocks - Registry', () => {
  it('registers ExternalInput block', () => {
    const def = getBlockDefinition('ExternalInput');
    expect(def).toBeDefined();
    expect(def!.type).toBe('ExternalInput');
    expect(def!.category).toBe('io');
    expect(def!.capability).toBe('io');
  });

  it('registers ExternalGate block', () => {
    const def = getBlockDefinition('ExternalGate');
    expect(def).toBeDefined();
    expect(def!.type).toBe('ExternalGate');
    expect(def!.category).toBe('io');
    expect(def!.capability).toBe('io');
  });

  it('registers ExternalVec2 block', () => {
    const def = getBlockDefinition('ExternalVec2');
    expect(def).toBeDefined();
    expect(def!.type).toBe('ExternalVec2');
    expect(def!.category).toBe('io');
    expect(def!.capability).toBe('io');
  });

  it('includes all three blocks in io category', () => {
    const ioBlocks = getBlockTypesByCategory('io');
    const ioTypes = ioBlocks.map(b => b.type);

    expect(ioTypes).toContain('ExternalInput');
    expect(ioTypes).toContain('ExternalGate');
    expect(ioTypes).toContain('ExternalVec2');
  });

  it('includes all three blocks in getAllBlockTypes', () => {
    const allTypes = getAllBlockTypes();

    expect(allTypes).toContain('ExternalInput');
    expect(allTypes).toContain('ExternalGate');
    expect(allTypes).toContain('ExternalVec2');
  });
});

describe('ExternalInput Block', () => {
  const def = requireBlockDef('ExternalInput');

  it('has correct metadata', () => {
    expect(def.label).toBe('External Input');
    expect(def.description).toContain('external channel');
    expect(def.form).toBe('primitive');
  });

  it('has channel config input with default value', () => {
    expect(def.inputs.channel).toBeDefined();
    expect(def.inputs.channel.value).toBe('mouse.x');
    expect(def.inputs.channel.exposedAsPort).toBe(false);
  });

  it('has value output with float type', () => {
    expect(def.outputs.value).toBeDefined();
    expect(def.outputs.value.type.payload).toBe(FLOAT);
  });

  it('is cardinality-generic with preserve mode', () => {
    expect(def.cardinality).toBeDefined();
    expect(def.cardinality!.cardinalityMode).toBe('preserve');
    expect(def.cardinality!.laneCoupling).toBe('laneLocal');
    expect(def.cardinality!.broadcastPolicy).toBe('allowZipSig');
  });

  it('lower function produces sigExternal with correct channel', () => {
    // Mock context
    const mockB = {
      sigExternal: (channel: string, type: any) => {
        expect(channel).toBe('test.channel');
        return 'sig1' as any;
      },
      allocSlot: () => 'slot1' as any,
    };
    const ctx = {
      b: mockB,
      outTypes: [{ payload: FLOAT, unit: '#' }],
      blockIdx: 0,
      blockType: 'ExternalInput',
      instanceId: 'test',
      inTypes: [],
      seedConstId: 0,
    } as any;

    const result = def.lower({
      ctx,
      inputs: [],
      inputsById: {},
      config: { channel: 'test.channel' },
    });

    expect(result.outputsById.value).toBeDefined();
  });

  it('lower function uses default channel when config missing', () => {
    const mockB = {
      sigExternal: (channel: string, type: any) => {
        expect(channel).toBe('mouse.x');
        return 'sig1' as any;
      },
      allocSlot: () => 'slot1' as any,
    };
    const ctx = {
      b: mockB,
      outTypes: [{ payload: FLOAT, unit: '#' }],
      blockIdx: 0,
      blockType: 'ExternalInput',
      instanceId: 'test',
      inTypes: [],
      seedConstId: 0,
    } as any;

    def.lower({
      ctx,
      inputs: [],
      inputsById: {},
      config: {},
    });
  });
});

describe('ExternalGate Block', () => {
  const def = requireBlockDef('ExternalGate');

  it('has correct metadata', () => {
    expect(def.label).toBe('External Gate');
    expect(def.description).toContain('gate');
    expect(def.description).toContain('threshold');
    expect(def.form).toBe('primitive');
  });

  it('has channel and threshold config inputs', () => {
    expect(def.inputs.channel).toBeDefined();
    expect(def.inputs.channel.value).toBe('mouse.x');
    expect(def.inputs.channel.exposedAsPort).toBe(false);

    expect(def.inputs.threshold).toBeDefined();
    expect(def.inputs.threshold.value).toBe(0.5);
    expect(def.inputs.threshold.exposedAsPort).toBe(false);
  });

  it('has gate output with float type', () => {
    expect(def.outputs.gate).toBeDefined();
    expect(def.outputs.gate.type.payload).toBe(FLOAT);
  });

  it('is cardinality-generic', () => {
    expect(def.cardinality).toBeDefined();
    expect(def.cardinality!.cardinalityMode).toBe('preserve');
  });

  it('lower function implements >= using 1 - (threshold > input)', () => {
    let externalCalled = false;
    let constCalls: any[] = [];
    let zipCalls: Array<{ inputs: any[]; opcode: string }> = [];

    const mockB = {
      sigExternal: (channel: string, type: any) => {
        externalCalled = true;
        expect(channel).toBe('gate.input');
        return 'sig_input' as any;
      },
      sigConst: (value: any, type: any) => {
        // sigConst now receives ConstValue objects, e.g. { kind: 'float', value: 0.7 }
        constCalls.push(value);
        return `sig_const_${value.value}` as any;
      },
      sigZip: (inputs: any[], fn: any, type: any) => {
        zipCalls.push({ inputs, opcode: fn.opcode });
        return `sig_zip_${zipCalls.length}` as any;
      },
      allocSlot: () => 'slot1' as any,
      opcode: (opcode: string) => ({ kind: 'opcode' as const, opcode }),
    };
    const ctx = {
      b: mockB,
      outTypes: [{ payload: FLOAT, unit: '#' }],
      blockIdx: 0,
      blockType: 'ExternalGate',
      instanceId: 'test',
      inTypes: [],
      seedConstId: 0,
    } as any;

    const result = def.lower({
      ctx,
      inputs: [],
      inputsById: {},
      config: { channel: 'gate.input', threshold: 0.7 },
    });

    expect(externalCalled).toBe(true);
    // sigConst now receives ConstValue objects
    expect(constCalls.map(c => c.value)).toEqual([0.7, 1]); // threshold const, then 1 const
    expect(zipCalls).toHaveLength(2);
    expect(zipCalls[0].opcode).toBe('gt'); // threshold > input
    expect(zipCalls[1].opcode).toBe('sub'); // 1 - result
    expect(result.outputsById.gate).toBeDefined();
  });

  it('lower function uses default threshold', () => {
    const mockB = {
      sigExternal: () => 'sig1' as any,
      sigConst: (value: any) => {
        // sigConst now receives ConstValue objects
        if (value.value !== 1) {
          expect(value.value).toBe(0.5); // default threshold
        }
        return `const_${value.value}` as any;
      },
      sigZip: () => 'sig3' as any,
      allocSlot: () => 'slot1' as any,
      opcode: (opcode: string) => ({ kind: 'opcode' as const, opcode }),
    };
    const ctx = {
      b: mockB,
      outTypes: [{ payload: FLOAT, unit: '#' }],
      blockIdx: 0,
      blockType: 'ExternalGate',
      instanceId: 'test',
      inTypes: [],
      seedConstId: 0,
    } as any;

    def.lower({
      ctx,
      inputs: [],
      inputsById: {},
      config: { channel: 'test' },
    });
  });
});

describe('ExternalVec2 Block', () => {
  const def = requireBlockDef('ExternalVec2');

  it('has correct metadata', () => {
    expect(def.label).toBe('External Vec2');
    expect(def.description).toContain('vec2');
    expect(def.form).toBe('primitive');
  });

  it('has channelBase config input', () => {
    expect(def.inputs.channelBase).toBeDefined();
    expect(def.inputs.channelBase.value).toBe('mouse');
    expect(def.inputs.channelBase.exposedAsPort).toBe(false);
  });

  it('has position output with vec2 type', () => {
    expect(def.outputs.position).toBeDefined();
    expect(def.outputs.position.type.payload).toBe(VEC2);
  });

  it('is cardinality-generic', () => {
    expect(def.cardinality).toBeDefined();
    expect(def.cardinality!.cardinalityMode).toBe('preserve');
  });

  it('lower function reads .x and .y channels', () => {
    const externalCalls: string[] = [];
    let stridedWriteCalled = false;

    const mockB = {
      sigExternal: (channel: string, type: any) => {
        externalCalls.push(channel);
        return `sig_${channel}` as any;
      },
      allocSlot: (stride: number) => {
        expect(stride).toBe(2); // vec2 has stride 2
        return 'slot1' as any;
      },
      stepSlotWriteStrided: (slot: any, components: any[]) => {
        stridedWriteCalled = true;
        expect(components).toHaveLength(2);
        expect(slot).toBe('slot1');
      },
    };
    const ctx = {
      b: mockB,
      outTypes: [{ payload: VEC2, unit: '#' }],
      blockIdx: 0,
      blockType: 'ExternalVec2',
      instanceId: 'test',
      inTypes: [],
      seedConstId: 0,
    } as any;

    const result = def.lower({
      ctx,
      inputs: [],
      inputsById: {},
      config: { channelBase: 'gamepad' },
    });

    expect(externalCalls).toEqual(['gamepad.x', 'gamepad.y']);
    expect(stridedWriteCalled).toBe(true);
    expect(result.outputsById.position).toBeDefined();
  });

  it('lower function uses default channelBase', () => {
    const externalCalls: string[] = [];

    const mockB = {
      sigExternal: (channel: string) => {
        externalCalls.push(channel);
        return `sig_${channel}` as any;
      },
      allocSlot: () => 'slot1' as any,
      stepSlotWriteStrided: () => {},
    };
    const ctx = {
      b: mockB,
      outTypes: [{ payload: VEC2, unit: '#' }],
      blockIdx: 0,
      blockType: 'ExternalVec2',
      instanceId: 'test',
      inTypes: [],
      seedConstId: 0,
    } as any;

    def.lower({
      ctx,
      inputs: [],
      inputsById: {},
      config: {},
    });

    expect(externalCalls).toEqual(['mouse.x', 'mouse.y']);
  });
});
