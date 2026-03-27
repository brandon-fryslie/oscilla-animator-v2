import { describe, expect, it } from 'vitest';
import {
  PAYLOAD_FIXTURES,
  isNagaModuleFixture,
  isBoundaryContractFixture,
} from '../fixtures';
import { validateNagaModulePayload } from '../boundary-contract';

describe('payload fixtures', () => {
  it('provide unique fixture identifiers', () => {
    const ids = PAYLOAD_FIXTURES.map((fixture) => fixture.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every fixture is either a NagaModule or BoundaryContract fixture', () => {
    for (const fixture of PAYLOAD_FIXTURES) {
      const isNaga = isNagaModuleFixture(fixture);
      const isBoundary = isBoundaryContractFixture(fixture);
      expect(isNaga || isBoundary, `${fixture.id} must be one fixture kind`).toBe(true);
      expect(isNaga && isBoundary, `${fixture.id} must not be both kinds`).toBe(false);
    }
  });

  it('NagaModule fixtures have valid module payloads', () => {
    for (const fixture of PAYLOAD_FIXTURES) {
      if (!isNagaModuleFixture(fixture)) continue;
      const result = validateNagaModulePayload(fixture.module);
      expect(result.valid, `${fixture.id}: ${!result.valid ? result.errors.join(', ') : ''}`).toBe(true);
    }
  });

  it('BoundaryContract fixtures have well-formed install + frame payloads', () => {
    for (const fixture of PAYLOAD_FIXTURES) {
      if (!isBoundaryContractFixture(fixture)) continue;
      expect(fixture.install.type).toBe('INSTALL_PIPELINE_V1');
      expect(fixture.install.pipeline.passes.length).toBeGreaterThan(0);
      expect(fixture.frame.type).toBe('PUBLISH_FRAME_INPUT_V1');
      expect(fixture.frame.frame.width).toBeGreaterThan(0);
    }
  });
});
