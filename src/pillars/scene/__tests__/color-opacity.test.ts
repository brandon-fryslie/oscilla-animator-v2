/**
 * Forbidden-pattern test for the opaque-color invariant (oscilla-pillars-scene-nt56.5).
 *
 * User-facing scene blocks describe color *intent* — one opaque color value —
 * never color-space channels. The channel layout (`hsl`/`rgb`/`rgba`) lives only
 * inside the ScenePlan `ColorBinding`, behind the seam (`hexColorBinding`). A
 * block or fixture that exposes a channel-style config key (`hue`, `saturation`,
 * `lightness`, `r`, `g`, `b`, …) has copied the backend layout into the API.
 *
 * [LAW:single-enforcer] One predicate decides what a channel-style key is, and it
 *   is applied to both surfaces an illegal key could appear on: the registered
 *   block config fields (the API) and every fixture patch's config (authored
 *   use). A new block or demo cannot reintroduce channels without failing here.
 * [LAW:one-source-of-truth] Color has one public abstraction; this test is the
 *   mechanical guard that keeps the channel layout from leaking back out of the
 *   seam into block APIs.
 */

import { describe, it, expect } from 'vitest';

import { ALL_SCENE_BLOCKS } from '../blocks';
import { SCENE_PLAN_DEMOS } from '../../fixtures/scene-demos';

/** Color-channel words that may not appear as part of a config key. */
const CHANNEL_WORDS = ['hue', 'saturation', 'lightness', 'chroma', 'luminance'];

/** Config keys that exactly name a color channel or space. */
const CHANNEL_KEYS = new Set([
  'h', 's', 'l', 'r', 'g', 'b', 'a',
  'red', 'green', 'blue', 'alpha',
  'sat', 'lum', 'hsl', 'rgb', 'rgba',
]);

/**
 * True when a config-field key exposes a color-space channel. A standalone
 * single-channel name (`s`, `rgb`) is illegal; so is any key built from a
 * channel word (`huePerTime`). Opaque color (`color`) and non-color params
 * (`rows`, `rotationPerTime`, `spacing`) are fine.
 */
function isChannelStyleColorKey(key: string): boolean {
  const k = key.toLowerCase();
  if (CHANNEL_KEYS.has(k)) return true;
  return CHANNEL_WORDS.some((word) => k.includes(word));
}

describe('opaque-color invariant — the predicate', () => {
  it('rejects channel keys and channel-word keys', () => {
    for (const key of ['hue', 'saturation', 'lightness', 'huePerTime', 'r', 'g', 'b', 'rgba']) {
      expect(isChannelStyleColorKey(key)).toBe(true);
    }
  });

  it('accepts the opaque color key and non-color params', () => {
    for (const key of ['color', 'rows', 'cols', 'spacing', 'rotationPerTime', 'factor', 'size']) {
      expect(isChannelStyleColorKey(key)).toBe(false);
    }
  });
});

describe('opaque-color invariant — no channel-style keys on block APIs', () => {
  for (const block of ALL_SCENE_BLOCKS) {
    it(`'${block.type}' config exposes no color channels`, () => {
      for (const field of block.catalog.configFields) {
        expect(
          isChannelStyleColorKey(field.key),
          `block '${block.type}' config field '${field.key}' is a color channel`,
        ).toBe(false);
      }
    });
  }
});

describe('opaque-color invariant — no channel-style keys in fixtures', () => {
  for (const [id, demo] of Object.entries(SCENE_PLAN_DEMOS)) {
    it(`demo '${id}' authors no color channels`, () => {
      for (const block of demo.makePatch().blocks) {
        for (const key of Object.keys(block.config)) {
          expect(
            isChannelStyleColorKey(key),
            `demo '${id}' block '${block.id}' config key '${key}' is a color channel`,
          ).toBe(false);
        }
      }
    });
  }
});
