/**
 * Round-trip contract for the pure pillar-patch wire format.
 *
 * [LAW:behavior-not-structure] Assert the meaning: every authored demo patch
 *   survives serialize → deserialize unchanged, and an unreadable blob becomes a
 *   typed failure rather than a thrown exception or a partial patch.
 */

import { describe, it, expect } from 'vitest';

import { SCENE_PLAN_DEMOS } from '../fixtures/scene-demos';
import {
  PILLAR_PATCH_FORMAT_VERSION,
  deserializePillarPatch,
  serializePillarPatch,
} from '../persistence';

describe('pillar-patch serialization', () => {
  it('round-trips every authored demo patch with no loss', () => {
    for (const [id, demo] of Object.entries(SCENE_PLAN_DEMOS)) {
      const patch = demo.makePatch();
      const result = deserializePillarPatch(serializePillarPatch(patch));
      expect(result.ok, `${id} should deserialize`).toBe(true);
      if (result.ok) {
        expect(result.patch, `${id} should round-trip unchanged`).toEqual(patch);
      }
    }
  });

  it('writes a versioned envelope', () => {
    const patch = SCENE_PLAN_DEMOS['grid-of-squares'].makePatch();
    const envelope = JSON.parse(serializePillarPatch(patch)) as { version: number };
    expect(envelope.version).toBe(PILLAR_PATCH_FORMAT_VERSION);
  });

  it('fails on a non-JSON string instead of throwing', () => {
    const result = deserializePillarPatch('{ not json');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not valid JSON/);
  });

  it('fails on valid JSON that is not a patch envelope', () => {
    const result = deserializePillarPatch(JSON.stringify({ hello: 'world' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/envelope/);
  });

  it('rejects an envelope from an unknown future version', () => {
    const patch = SCENE_PLAN_DEMOS['grid-of-squares'].makePatch();
    const futureBlob = JSON.stringify({ version: PILLAR_PATCH_FORMAT_VERSION + 1, patch });
    const result = deserializePillarPatch(futureBlob);
    expect(result.ok).toBe(false);
  });

  it('rejects a patch with a structurally invalid block', () => {
    // `kind` is an enum; an arbitrary string is not a legal PillarKind.
    const bad = JSON.stringify({
      version: PILLAR_PATCH_FORMAT_VERSION,
      patch: {
        blocks: [{ id: 'b0', kind: 'not-a-kind', type: 'InstanceGrid', config: {} }],
        edges: [],
      },
    });
    const result = deserializePillarPatch(bad);
    expect(result.ok).toBe(false);
  });
});
