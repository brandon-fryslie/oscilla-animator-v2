/**
 * Test helpers for loading typed DSL fixtures by name.
 */

import type { PipelineInstallPayload } from '../../rust/boundary-contract';
import { PAYLOAD_FIXTURES } from '../../rust/fixtures';

const fixtureMap = new Map<string, PipelineInstallPayload>(
  PAYLOAD_FIXTURES.map(f => [f.id, f.payload]),
);

export function loadFixturePayload(name: string): PipelineInstallPayload {
  const payload = fixtureMap.get(name);
  if (!payload) throw new Error(`Fixture not found: ${name}`);
  return payload;
}
