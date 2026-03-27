import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  readBridgeMock: vi.fn(),
}));

vi.mock('../../../../services/runtime-boundary-dump-bridge', () => ({
  readRuntimeBoundaryDumpBridge: hoisted.readBridgeMock,
}));

import { copyBoundaryFixtureJsonFromBridge } from '../boundary-fixture-copy';

describe('copyBoundaryFixtureJsonFromBridge', () => {
  beforeEach(() => {
    hoisted.readBridgeMock.mockReset();
  });

  it('copies fixture JSON through the canonical bridge API', async () => {
    const copyFixtureJsonV1 = vi.fn(async () => '{"install":{},"frame":{}}');
    hoisted.readBridgeMock.mockReturnValue({ copyFixtureJsonV1 });

    const result = await copyBoundaryFixtureJsonFromBridge();

    expect(copyFixtureJsonV1).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      success: true,
      message: 'Copied boundary fixture JSON to clipboard',
    });
  });

  it('returns a deterministic failure when the bridge is unavailable', async () => {
    hoisted.readBridgeMock.mockReturnValue(null);

    const result = await copyBoundaryFixtureJsonFromBridge();

    expect(result.success).toBe(false);
    expect(result.message).toBe('Boundary fixture bridge is unavailable');
    expect(result.error).toBeInstanceOf(Error);
  });

  it('returns bridge copy errors as user-facing failures', async () => {
    const copyFixtureJsonV1 = vi.fn(async () => {
      throw new Error('clipboard denied');
    });
    hoisted.readBridgeMock.mockReturnValue({ copyFixtureJsonV1 });

    const result = await copyBoundaryFixtureJsonFromBridge();

    expect(copyFixtureJsonV1).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    expect(result.message).toBe('clipboard denied');
    expect(result.error).toBeInstanceOf(Error);
  });
});
