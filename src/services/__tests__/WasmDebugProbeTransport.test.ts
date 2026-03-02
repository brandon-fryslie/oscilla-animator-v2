import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FLOAT, canonicalScalar } from '../../core/canonical-types';
import { valueSlot } from '../../types';
import {
  createWasmDebugProbeTransport,
} from '../WasmDebugProbeTransport';

const mocks = vi.hoisted(() => ({
  initDebugProbeWasm: vi.fn(async () => {}),
  debug_probe_command: vi.fn(),
  debug_probe_poll_packed_runtime_packet: vi.fn<
    (capturedAtMs: number, snapshot: { runtimeFrameId: number; slotMeta: Uint32Array; componentOffsets: Uint32Array; slotValues: Float32Array }) => unknown
  >(() => null),
}));

vi.mock('../wasm/oscilla_debug_probe', () => ({
  initDebugProbeWasm: mocks.initDebugProbeWasm,
  debug_probe_command: mocks.debug_probe_command,
  debug_probe_poll_packed_runtime_packet: mocks.debug_probe_poll_packed_runtime_packet,
}));

function makeRuntimeView() {
  const slot = valueSlot(7);
  const program = {
    runtimeAddressTable: {
      slotLookup: new Map([
        [slot, {
          storage: 'f32',
          offset: 7,
          stride: 1,
          slot,
          type: canonicalScalar(FLOAT),
          arena: { offset: 7, stride: 1, laneCount: 1, length: 1 },
        }],
      ]),
      fieldExprToSlot: new Map(),
      scalarExprToArenaAddress: new Map(),
      slotToArena: new Map([[slot, { offset: 7, stride: 1, laneCount: 1, length: 1 }]]),
    },
  };
  const state = {
    arena: new Float32Array([0, 0, 0, 0, 0, 0, 0, 64]),
    cache: { frameId: 12 },
  };

  return {
    slot,
    runtimeView: () => ({
      program: program as any,
      state: state as any,
    }),
  };
}

describe('WasmDebugProbeTransport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes wasm module and forwards control commands', async () => {
    const { slot, runtimeView } = makeRuntimeView();
    const transport = await createWasmDebugProbeTransport(runtimeView);

    transport.debugCommand({
      kind: 'set_subscriptions',
      subscriptions: [{
        targetId: slot as number,
        slotId: slot,
        sampleKind: 'scalar',
        componentMask: 0b0001,
        priority: 0,
      }],
    });

    expect(mocks.initDebugProbeWasm).toHaveBeenCalledTimes(1);
    expect(mocks.debug_probe_command).toHaveBeenCalledTimes(1);
    expect(mocks.debug_probe_command.mock.calls[0][0]).toMatchObject({ kind: 'set_subscriptions' });
  });

  it('forwards runtime slot snapshots to wasm for Rust-owned extraction', async () => {
    const { slot, runtimeView } = makeRuntimeView();
    mocks.debug_probe_poll_packed_runtime_packet.mockReturnValueOnce({
      version: 1,
      sequence: 2,
      capturedAtMs: 1010,
      runtimeFrameId: 12,
      sampleCount: 1,
      packetFlags: 0,
      samples: [],
    });

    const transport = await createWasmDebugProbeTransport(runtimeView);
    transport.debugCommand({
      kind: 'set_subscriptions',
      subscriptions: [{
        targetId: slot as number,
        slotId: slot,
        sampleKind: 'scalar',
        componentMask: 0b0001,
        priority: 0,
      }],
    });

    const packet = transport.debugPollPacket(1010);
    expect(packet).toMatchObject({ runtimeFrameId: 12, sequence: 2 });

    expect(mocks.debug_probe_poll_packed_runtime_packet).toHaveBeenCalledTimes(1);
    const [capturedAtMs, snapshot] = mocks.debug_probe_poll_packed_runtime_packet.mock.calls[0] as [number, {
      runtimeFrameId: number;
      slotMeta: Uint32Array;
      componentOffsets: Uint32Array;
      slotValues: Float32Array;
    }];
    expect(capturedAtMs).toBe(1010);
    expect(snapshot.runtimeFrameId).toBe(12);
    expect(Array.from(snapshot.slotMeta)).toEqual([slot as number, 1, 1, 1, 0, 1, 1, 0, 0, 0]);
    expect(Array.from(snapshot.componentOffsets)).toEqual([]);
    expect(Array.from(snapshot.slotValues)).toEqual([64]);
  });
});
