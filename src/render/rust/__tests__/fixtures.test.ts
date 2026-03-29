import { describe, expect, it } from 'vitest';
import {
  PAYLOAD_FIXTURES,
  isWgslPassFixture,
  isBoundaryContractFixture,
} from '../fixtures';
import { validateRawPayload } from '../boundary-contract';

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

  it('boundary-contract fixtures have well-formed install + frame payloads', () => {
    for (const fixture of PAYLOAD_FIXTURES) {
      if (!isBoundaryContractFixture(fixture)) continue;
      expect(fixture.install.type).toBe('INSTALL_PIPELINE_V1');
      expect(fixture.install.pipeline.passes.length).toBeGreaterThan(0);
      expect(fixture.frame.type).toBe('PUBLISH_FRAME_INPUT_V1');
      expect(fixture.frame.frame.width).toBeGreaterThan(0);
    }
  });

  it('boundary-contract sink tables have materialId = 0', () => {
    // [Review comment] materialId is GPU draw-prep–owned. Fixtures must keep it 0.
    const SINK_TABLE_MATERIAL_ID_OFFSET = 15; // 8 header + 7 record fields
    for (const fixture of PAYLOAD_FIXTURES) {
      if (!isBoundaryContractFixture(fixture)) continue;
      const words = fixture.install.pipeline.sinkTableWords;
      expect(words[SINK_TABLE_MATERIAL_ID_OFFSET], `${fixture.id} materialId`).toBe(0);
    }
  });
});
