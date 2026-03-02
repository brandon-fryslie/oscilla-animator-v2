import { describe, expect, it } from 'vitest';
import { FLOAT, canonicalScalar } from '../../core/canonical-types';
import { valueSlot } from '../../types';
import {
  DEBUG_PACKET_FLAG_SUBSCRIPTION_INVALID,
  type DebugProbeSubscription,
} from '../DebugProbeProtocol';
import { LocalDebugProbeTransport } from '../LocalDebugProbeTransport';

function makeRuntime() {
  const slot = valueSlot(3);
  const program = {
    runtimeAddressTable: {
      slotLookup: new Map([
        [slot, {
          storage: 'f32',
          offset: 3,
          stride: 1,
          slot,
          type: canonicalScalar(FLOAT),
          arena: { offset: 3, stride: 1, laneCount: 1, length: 1 },
        }],
      ]),
      fieldExprToSlot: new Map(),
      scalarExprToArenaAddress: new Map(),
      slotToArena: new Map([[slot, { offset: 3, stride: 1, laneCount: 1, length: 1 }]]),
    },
  };
  const state = {
    arena: new Float32Array([0, 0, 0, 41]),
    cache: { frameId: 9 },
  };

  return { slot, program, state };
}

describe('LocalDebugProbeTransport', () => {
  it('returns null when no subscriptions are configured', () => {
    const { program, state } = makeRuntime();
    const transport = new LocalDebugProbeTransport(() => ({
      program: program as any,
      state: state as any,
    }));

    const packet = transport.debugPollPacket(1000);
    expect(packet).toBeNull();
  });

  it('emits scalar packet samples for configured subscriptions', () => {
    const { slot, program, state } = makeRuntime();
    const transport = new LocalDebugProbeTransport(() => ({
      program: program as any,
      state: state as any,
    }));

    const subscriptions: DebugProbeSubscription[] = [{
      targetId: slot as number,
      slotId: slot,
      sampleKind: 'scalar',
      componentMask: 0b0001,
      priority: 0,
    }];
    transport.debugCommand({ kind: 'set_subscriptions', subscriptions });

    const packet = transport.debugPollPacket(1234);
    expect(packet).toBeTruthy();
    if (!packet) {
      throw new Error('Expected debug probe packet');
    }
    expect(packet.runtimeFrameId).toBe(9);
    expect(packet.sampleCount).toBe(1);
    expect(packet.samples[0]).toMatchObject({
      slotId: slot,
      payloadKind: 'scalar',
      values: [41],
    });
  });

  it('sets subscription_invalid when a configured slot has no lookup entry', () => {
    const { slot, program, state } = makeRuntime();
    const missingSlot = valueSlot(99);
    const transport = new LocalDebugProbeTransport(() => ({
      program: program as any,
      state: state as any,
    }));

    transport.debugCommand({
      kind: 'set_subscriptions',
      subscriptions: [
        {
          targetId: slot as number,
          slotId: slot,
          sampleKind: 'scalar',
          componentMask: 0b0001,
          priority: 0,
        },
        {
          targetId: missingSlot as number,
          slotId: missingSlot,
          sampleKind: 'scalar',
          componentMask: 0b0001,
          priority: 0,
        },
      ],
    });

    const packet = transport.debugPollPacket(2000);
    expect(packet).toBeTruthy();
    if (!packet) {
      throw new Error('Expected debug probe packet');
    }
    expect((packet.packetFlags & DEBUG_PACKET_FLAG_SUBSCRIPTION_INVALID) !== 0).toBe(true);
    expect(packet.samples.length).toBe(1);
  });

  it('emits lane-window packet samples for tracked field subscriptions', () => {
    const fieldSlot = valueSlot(5);
    const transport = new LocalDebugProbeTransport(() => ({
      program: {
        runtimeAddressTable: {
          slotLookup: new Map([
            [fieldSlot, {
              storage: 'f32',
              offset: 0,
              stride: 2,
              slot: fieldSlot,
              type: canonicalScalar(FLOAT),
              arena: { offset: 0, stride: 2, laneCount: 2, length: 4 },
            }],
          ]),
          fieldExprToSlot: new Map(),
          scalarExprToArenaAddress: new Map(),
          slotToArena: new Map([[fieldSlot, { offset: 0, stride: 2, laneCount: 2, length: 4 }]]),
        },
      } as any,
      state: {
        arena: new Float32Array([10, 20, 30, 40]),
        cache: { frameId: 3 },
      } as any,
    }));

    transport.debugCommand({
      kind: 'set_subscriptions',
      subscriptions: [{
        targetId: fieldSlot as number,
        slotId: fieldSlot,
        sampleKind: 'lane_window',
        componentMask: 0b0011,
        priority: 0,
        laneWindow: { start: 0, count: 2 },
      }],
    });

    const packet = transport.debugPollPacket(3000);
    expect(packet).toBeTruthy();
    if (!packet) {
      throw new Error('Expected lane-window packet');
    }
    expect(packet.samples).toEqual([
      expect.objectContaining({
        slotId: fieldSlot,
        payloadKind: 'lane_window',
        stride: 2,
        laneCount: 2,
        values: [10, 30, 20, 40],
      }),
    ]);
  });
});
