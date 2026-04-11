/**
 * Full payload roundtrip: PipelineInstallPayload → gpu({...}) source → PipelineInstallPayload.
 *
 * Tests payloadToSource produces source that, when evaluated via evalDsl(),
 * produces an identical payload. Also tests source stability (second trip
 * produces identical source).
 */

import { describe, test, expect } from 'vitest';
import { loadFixturePayload } from './fixture-helpers';
import { payloadToSource } from '../reverse-payload';
import { evalDsl } from '../../../payload-tester/dsl-eval';
import type { PipelineInstallPayload } from '../../rust/boundary-contract';

function assertPayloadRoundtrip(name: string): void {
  const payload = loadFixturePayload(name);
  const source = payloadToSource(payload);

  // Evaluate the source to produce a new payload
  const result = evalDsl(source);
  if (!result.ok) {
    throw new Error(`Payload roundtrip for '${name}' failed to compile:\n${result.error}\n\nGenerated source:\n${source}`);
  }

  // Payload equality
  expect(result.payload).toStrictEqual(payload);

  // Source stability: second trip produces identical source
  const source2 = payloadToSource(result.payload);
  expect(source2).toBe(source);
}

describe('GPU-IR payload roundtrip', () => {
  // Core fixtures
  test('instanced-write', () => assertPayloadRoundtrip('instanced-write'));
  test('for-loop-gradient', () => assertPayloadRoundtrip('for-loop-gradient'));
  test('hash-color', () => assertPayloadRoundtrip('hash-color'));
  test('varying-gradient', () => assertPayloadRoundtrip('varying-gradient'));
  test('sdf-circle', () => assertPayloadRoundtrip('sdf-circle'));
  test('spirograph-trace', () => assertPayloadRoundtrip('spirograph-trace'));

  // IR coverage fixtures
  test('conditional-ring', () => assertPayloadRoundtrip('conditional-ring'));
  test('search-break', () => assertPayloadRoundtrip('search-break'));
  test('bitfield-palette', () => assertPayloadRoundtrip('bitfield-palette'));
  test('scalar-accumulator', () => assertPayloadRoundtrip('scalar-accumulator'));

  // Texture fixtures
  test('texture-readwrite', () => assertPayloadRoundtrip('texture-readwrite'));

  // Atomic fixtures
  test('atomic-boids', () => assertPayloadRoundtrip('atomic-boids'));
  test('atomic-histogram', () => assertPayloadRoundtrip('atomic-histogram'));
});
