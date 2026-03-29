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
import {
  DRAW_PREP_SINK_TABLE_HEADER_WORDS,
  DRAW_PREP_SINK_TABLE_RECORD_WORDS,
  DrawPrepSinkTableHeaderWord,
  DrawPrepSinkTableRecordWord,
} from '../../../runtime/DrawPrepSinkTable';

// Expected fixture counts. Update these when adding/removing fixtures.
const EXPECTED_WGSL_PASS_COUNT = 3;
const EXPECTED_BOUNDARY_CONTRACT_COUNT = 0; // None yet — WGSL must come from Rust side

describe('payload fixtures', () => {
  it('contain expected fixture counts per kind', () => {
    const wgslCount = PAYLOAD_FIXTURES.filter(isWgslPassFixture).length;
    const boundaryCount = PAYLOAD_FIXTURES.filter(isBoundaryContractFixture).length;
    expect(wgslCount, 'WGSL-pass fixture count').toBe(EXPECTED_WGSL_PASS_COUNT);
    expect(boundaryCount, 'boundary-contract fixture count').toBe(EXPECTED_BOUNDARY_CONTRACT_COUNT);
    expect(wgslCount + boundaryCount, 'total must equal PAYLOAD_FIXTURES length').toBe(PAYLOAD_FIXTURES.length);
  });

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

  it('boundary-contract sink tables have materialId = 0 for every record', () => {
    // materialId is GPU draw-prep–owned. Fixtures must keep it 0.
    for (const fixture of PAYLOAD_FIXTURES) {
      if (!isBoundaryContractFixture(fixture)) continue;
      const words = fixture.install.pipeline.sinkTableWords;
      const totalRecords = words[DrawPrepSinkTableHeaderWord.TotalRecordCount];
      for (let i = 0; i < totalRecords; i++) {
        const base = DRAW_PREP_SINK_TABLE_HEADER_WORDS + i * DRAW_PREP_SINK_TABLE_RECORD_WORDS;
        const materialId = words[base + DrawPrepSinkTableRecordWord.MaterialId];
        expect(materialId, `${fixture.id} record[${i}] materialId`).toBe(0);
      }
    }
  });
});
