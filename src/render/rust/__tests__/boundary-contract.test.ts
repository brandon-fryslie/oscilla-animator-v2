import { describe, expect, it } from 'vitest';
import {
  normalizeInstallPipelinePayloadV1,
  normalizePublishFrameInputPayloadV1,
} from '../boundary-contract';

function makeInstallPayload() {
  return {
    type: 'INSTALL_PIPELINE_V1',
    pipeline: {
      passes: [
        {
          passId: 'p0',
          stage: 'compute',
          entryPoint: 'compute_main',
          wgsl: '@compute @workgroup_size(64, 1, 1) fn compute_main() {}',
        },
      ],
      sinkPointerMap: {
        '0:position': 'arena:slot:1',
        '0:color': 'arena:slot:2',
        '0:scale': 'arena:slot:3',
        '0:shape': 'arena:slot:4',
      },
      shapeBankWords: [1, 1, 0, 0, 0, 0, 0, 3, 0, 0, 0, 10, 0, 0, 0, 0],
      shapeBankWordCount: 16,
      topologyIdByHandle: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      sinkTableWords: new Array(42).fill(0),
      sinkTableWordCount: 42,
    },
  };
}

describe('boundary-contract', () => {
  it('normalizes INSTALL_PIPELINE_V1 payload into typed install planes', () => {
    const result = normalizeInstallPipelinePayloadV1(makeInstallPayload());
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.value.pipeline.passes).toHaveLength(1);
    expect(result.value.pipeline.shapeBankWords).toBeInstanceOf(Uint32Array);
    expect(result.value.pipeline.shapeBankWords.length).toBe(16);
    expect(result.value.pipeline.sinkTableWords).toBeInstanceOf(Uint32Array);
    expect(result.value.pipeline.sinkTableWords.length).toBe(42);
  });

  it('rejects malformed INSTALL_PIPELINE_V1 payloads with deterministic errors', () => {
    const result = normalizeInstallPipelinePayloadV1({
      type: 'INSTALL_PIPELINE_V1',
      pipeline: {
        passes: [],
        sinkPointerMap: {},
        shapeBankWords: [1, -2, 3],
        shapeBankWordCount: 99,
        topologyIdByHandle: [0],
        sinkTableWords: [1],
        sinkTableWordCount: 10,
      },
    });
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors.some((err) => err.includes('payload.pipeline.passes'))).toBe(true);
    expect(result.errors.some((err) => err.includes('shapeBankWordCount'))).toBe(true);
    expect(result.errors.some((err) => err.includes('sinkTableWordCount'))).toBe(true);
  });

  it('normalizes PUBLISH_FRAME_INPUT_V1 payload', () => {
    const result = normalizePublishFrameInputPayloadV1({
      type: 'PUBLISH_FRAME_INPUT_V1',
      frame: {
        width: 800,
        height: 600,
        zoom: 1,
        panX: 0,
        panY: 0,
        timeMs: 12.3,
        inputMouseX: 10,
        inputMouseY: 20,
        inputMouseButtons: 1,
        inputAudioLow: 0,
        inputAudioMid: 0,
        inputAudioHigh: 0,
        inputGaugeActive: 0,
      },
    });
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.value.frame.width).toBe(800);
    expect(result.value.frame.inputMouseButtons).toBe(1);
  });

  it('rejects invalid frame payload fields', () => {
    const result = normalizePublishFrameInputPayloadV1({
      type: 'PUBLISH_FRAME_INPUT_V1',
      frame: {
        width: 0,
        height: -1,
        zoom: 0,
        panX: 0,
        panY: 0,
        timeMs: Number.NaN,
        inputMouseX: 0,
        inputMouseY: 0,
        inputMouseButtons: -1,
        inputAudioLow: 0,
        inputAudioMid: 0,
        inputAudioHigh: 0,
        inputGaugeActive: 0,
      },
    });
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors.some((err) => err.includes('width'))).toBe(true);
    expect(result.errors.some((err) => err.includes('zoom'))).toBe(true);
    expect(result.errors.some((err) => err.includes('inputMouseButtons'))).toBe(true);
  });
});
