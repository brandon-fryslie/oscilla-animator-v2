import { describe, expect, it } from 'vitest';
import {
  normalizeInstallPipelinePayloadV1,
  normalizePublishFrameInputPayloadV1,
} from '../boundary-contract';
import { PAYLOAD_FIXTURES } from '../fixtures';

describe('payload fixtures', () => {
  it('provide unique fixture identifiers', () => {
    const ids = PAYLOAD_FIXTURES.map((fixture) => fixture.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('normalize all fixture install/frame payloads through canonical boundary contract', () => {
    for (const fixture of PAYLOAD_FIXTURES) {
      const installValidation = normalizeInstallPipelinePayloadV1(fixture.install);
      const frameValidation = normalizePublishFrameInputPayloadV1(fixture.frame);

      expect(installValidation.valid, fixture.id).toBe(true);
      expect(frameValidation.valid, fixture.id).toBe(true);
    }
  });
});
