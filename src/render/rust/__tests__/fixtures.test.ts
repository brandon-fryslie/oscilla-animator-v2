import { describe, expect, it } from 'vitest';
import {
  PAYLOAD_FIXTURES,
  isWgslPassFixture,
  isBoundaryContractFixture,
} from '../fixtures';
import {
  validateRawPayload,
  validateInstallPipelinePayloadV1,
  validatePublishFrameInputPayloadV1,
} from '../boundary-contract';

describe('payload fixtures', () => {
  it('provide unique fixture identifiers', () => {
    const ids = PAYLOAD_FIXTURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every fixture is exactly one kind', () => {
    for (const fixture of PAYLOAD_FIXTURES) {
      const isPass = isWgslPassFixture(fixture);
      const isBoundary = isBoundaryContractFixture(fixture);
      expect(isPass || isBoundary, `${fixture.id} must be one fixture kind`).toBe(true);
      expect(isPass && isBoundary, `${fixture.id} must not be both kinds`).toBe(false);
    }
  });

  it('WGSL-pass fixtures validate through boundary contract', () => {
    for (const fixture of PAYLOAD_FIXTURES) {
      if (!isWgslPassFixture(fixture)) continue;
      const result = validateRawPayload(fixture.passes);
      expect(result.valid, `${fixture.id}: ${!result.valid ? result.errors.join(', ') : ''}`).toBe(true);
    }
  });

  it('boundary-contract install payloads pass canonical validator', () => {
    for (const fixture of PAYLOAD_FIXTURES) {
      if (!isBoundaryContractFixture(fixture)) continue;
      const result = validateInstallPipelinePayloadV1(fixture.install);
      expect(result.valid, `${fixture.id} install: ${!result.valid ? result.errors.join(', ') : ''}`).toBe(true);
    }
  });

  it('boundary-contract frame payloads pass canonical validator', () => {
    for (const fixture of PAYLOAD_FIXTURES) {
      if (!isBoundaryContractFixture(fixture)) continue;
      const result = validatePublishFrameInputPayloadV1(fixture.frame);
      expect(result.valid, `${fixture.id} frame: ${!result.valid ? result.errors.join(', ') : ''}`).toBe(true);
    }
  });

  it('boundary-contract sink tables have materialId = 0', () => {
    // materialId is GPU draw-prep–owned. Fixtures must keep it 0.
    const SINK_TABLE_HEADER = 8;
    const SINK_TABLE_RECORD = 8;
    const MATERIAL_ID_OFFSET_IN_RECORD = 7;
    const materialIdOffset = SINK_TABLE_HEADER + MATERIAL_ID_OFFSET_IN_RECORD;
    for (const fixture of PAYLOAD_FIXTURES) {
      if (!isBoundaryContractFixture(fixture)) continue;
      const words = fixture.install.pipeline.sinkTableWords;
      expect(words[materialIdOffset], `${fixture.id} materialId`).toBe(0);
    }
  });
});
