import { describe, expect, it } from 'vitest';

import { parseSchedulerPacket } from '../engine-telemetry';

function createValidPacket() {
  return {
    state: 'Running',
    heartbeat: {
      sequence: 3,
      state: 'Running',
      emittedAtMs: 120,
      frameCount: 12,
      loopCount: 15,
      meanTickMs: 1.5,
      stdDevTickMs: 0.2,
      sampleCount: 60,
      lastTickMs: 120,
      lastSuccessMs: 119,
      telemetry: {
        stageTimings: {
          inputMarshalMs: 0.1,
          simulationDispatchMs: 0.3,
          fluidPassChainMs: 0.0,
          drawPrepMs: 0.1,
          renderMs: 0.6,
          swapMs: 0.3,
          totalFrameMs: 1.4,
        },
        dispatchCounters: {
          computeDispatchCount: 3,
          computeWorkgroupCount: 9,
          activeLaneCount: 128,
          guardedLaneCount: 0,
        },
        resourceStats: {
          shapeBankWordCount: 256,
          sinkTableWordCount: 512,
          indexedRecordCount: 4,
          nonIndexedRecordCount: 2,
          totalInstanceCount: 128,
          canvasWidth: 1920,
          canvasHeight: 1080,
          pingPongIndex: 1,
        },
      },
    },
    events: [
      {
        severity: 'error',
        code: 'surface_lost',
        stage: 'swap',
        message: 'Surface lost',
        state: 'Lost',
        frameCount: 12,
        loopCount: 15,
        emittedAtMs: 120,
      },
    ],
  };
}

describe('parseSchedulerPacket', () => {
  it('parses valid scheduler packets', () => {
    const parsed = parseSchedulerPacket(createValidPacket());

    expect(parsed.state).toBe('Running');
    expect(parsed.heartbeat.type).toBe('SCHEDULER_HEARTBEAT');
    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0]?.type).toBe('RUNTIME_EVENT');
    expect(parsed.events[0]?.state).toBe('Lost');
  });

  it('throws explicit contract errors for malformed packets', () => {
    expect(() =>
      parseSchedulerPacket({
        ...createValidPacket(),
        heartbeat: {
          ...createValidPacket().heartbeat,
          telemetry: {
            ...createValidPacket().heartbeat.telemetry,
            stageTimings: {
              ...createValidPacket().heartbeat.telemetry.stageTimings,
              renderMs: 'bad-number',
            },
          },
        },
      }),
    ).toThrow(/Rust scheduler telemetry contract violation/);
  });
});
