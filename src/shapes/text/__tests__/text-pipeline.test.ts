/**
 * Type 5 Text Pipeline — Contract and Integration Tests
 *
 * Tests the text shaping, atlas generation, and Type5 ShapeBank layout
 * contracts for RECOVER-11.
 */

import { describe, expect, it } from 'vitest';
import { ShapeClass } from '../../types';
import { generateBuiltinAtlas, getBuiltinAtlas } from '../builtin-atlas';
import { shapeText } from '../shaping';
import { Type5ShapeBankWord, Type5ShapeBankFlag } from '../types';

describe('Type5TextHybrid shape class', () => {
  it('has ABI value 5', () => {
    expect(ShapeClass.Type5TextHybrid).toBe(5);
  });

  it('is distinct from Type1Rigid', () => {
    expect(ShapeClass.Type5TextHybrid).not.toBe(ShapeClass.Type1Rigid);
  });
});

describe('Type5 ShapeBank header layout', () => {
  it('shares generic header words 0–3', () => {
    expect(Type5ShapeBankWord.Kind).toBe(0);
    expect(Type5ShapeBankWord.TopologyMode).toBe(1);
    expect(Type5ShapeBankWord.Flags).toBe(2);
    expect(Type5ShapeBankWord.MaterialClass).toBe(3);
  });

  it('has Type5-specific UV words 4–7', () => {
    expect(Type5ShapeBankWord.UvMinX).toBe(4);
    expect(Type5ShapeBankWord.UvMinY).toBe(5);
    expect(Type5ShapeBankWord.UvMaxX).toBe(6);
    expect(Type5ShapeBankWord.UvMaxY).toBe(7);
  });

  it('has Type5-specific quad dimension words 8–9', () => {
    expect(Type5ShapeBankWord.QuadWidth).toBe(8);
    expect(Type5ShapeBankWord.QuadHeight).toBe(9);
  });

  it('has atlas metadata words 10–12', () => {
    expect(Type5ShapeBankWord.AtlasWidth).toBe(10);
    expect(Type5ShapeBankWord.AtlasHeight).toBe(11);
    expect(Type5ShapeBankWord.DistanceRange).toBe(12);
  });

  it('fits in 16 u32 words (same as ShapeBankHeaderV1)', () => {
    const maxWord = Math.max(...Object.values(Type5ShapeBankWord));
    expect(maxWord).toBeLessThan(16);
  });
});

describe('built-in MSDF font atlas', () => {
  it('generates a valid atlas descriptor', () => {
    const atlas = generateBuiltinAtlas();
    expect(atlas.width).toBeGreaterThan(0);
    expect(atlas.height).toBeGreaterThan(0);
    expect(atlas.distanceRange).toBeGreaterThan(0);
    expect(atlas.fontSize).toBeGreaterThan(0);
    expect(atlas.lineHeight).toBeGreaterThan(0);
    expect(atlas.textureData.length).toBe(atlas.width * atlas.height * 4);
  });

  it('contains metrics for basic ASCII printable characters', () => {
    const atlas = generateBuiltinAtlas();
    // Space through tilde
    for (let cp = 32; cp <= 126; cp++) {
      expect(atlas.glyphs.has(cp), `missing glyph for codepoint ${cp}`).toBe(true);
    }
  });

  it('glyph UVs are within [0, 1] range', () => {
    const atlas = generateBuiltinAtlas();
    for (const [_, metrics] of atlas.glyphs) {
      expect(metrics.u0).toBeGreaterThanOrEqual(0);
      expect(metrics.v0).toBeGreaterThanOrEqual(0);
      expect(metrics.u1).toBeLessThanOrEqual(1);
      expect(metrics.v1).toBeLessThanOrEqual(1);
      expect(metrics.u0).toBeLessThan(metrics.u1);
      expect(metrics.v0).toBeLessThan(metrics.v1);
    }
  });

  it('caches the singleton atlas', () => {
    const a = getBuiltinAtlas();
    const b = getBuiltinAtlas();
    expect(a).toBe(b);
  });

  it('texture data contains non-zero MSDF values for defined glyphs', () => {
    const atlas = generateBuiltinAtlas();
    // Check that 'A' (codepoint 65) has some non-zero pixels
    const metrics = atlas.glyphs.get(65)!;
    const startX = Math.floor(metrics.u0 * atlas.width);
    const startY = Math.floor(metrics.v0 * atlas.height);
    const endX = Math.floor(metrics.u1 * atlas.width);
    const endY = Math.floor(metrics.v1 * atlas.height);
    let hasNonZero = false;
    for (let y = startY; y < endY && !hasNonZero; y++) {
      for (let x = startX; x < endX && !hasNonZero; x++) {
        const offset = (y * atlas.width + x) * 4;
        if (atlas.textureData[offset] > 0 || atlas.textureData[offset + 1] > 0 || atlas.textureData[offset + 2] > 0) {
          hasNonZero = true;
        }
      }
    }
    expect(hasNonZero).toBe(true);
  });
});

describe('text shaping', () => {
  const atlas = generateBuiltinAtlas();

  it('shapes basic Latin text into positioned glyphs', () => {
    const result = shapeText('Hello', atlas);
    // 5 visible characters
    expect(result.glyphs.length).toBe(5);
    expect(result.totalAdvance).toBeGreaterThan(0);
  });

  it('produces glyph count matching spec AC 1.1 (non-whitespace only)', () => {
    // "Hello World\n" has 10 non-whitespace characters
    const result = shapeText('Hello World\n', atlas);
    expect(result.glyphs.length).toBe(10);
  });

  it('handles spaces via advance only (no glyph quad)', () => {
    const withSpace = shapeText('A B', atlas);
    // Only 'A' and 'B' produce visible glyphs
    expect(withSpace.glyphs.length).toBe(2);
    // The second glyph should be further right than just one advance
    expect(withSpace.glyphs[1]!.penX).toBeGreaterThan(withSpace.glyphs[0]!.penX + atlas.glyphs.get(65)!.advance);
  });

  it('handles newlines by resetting penX and advancing penY', () => {
    const result = shapeText('A\nB', atlas);
    expect(result.glyphs.length).toBe(2);
    const glyphA = result.glyphs[0]!;
    const glyphB = result.glyphs[1]!;
    // B should be on a new line (lower Y)
    expect(glyphB.penY).toBeLessThan(glyphA.penY);
    // B should be back at the left margin
    expect(glyphB.penX).toBeLessThanOrEqual(glyphA.penX + 0.01);
  });

  it('computes valid bounding box', () => {
    const result = shapeText('Hello', atlas);
    expect(result.boundsMinX).toBeLessThan(result.boundsMaxX);
    expect(result.boundsMinY).toBeLessThan(result.boundsMaxY);
  });

  it('returns empty run for empty string', () => {
    const result = shapeText('', atlas);
    expect(result.glyphs.length).toBe(0);
    expect(result.totalAdvance).toBe(0);
  });

  it('handles unknown characters gracefully', () => {
    // Unicode snowman (not in our basic Latin atlas)
    const result = shapeText('☃', atlas);
    // Should produce either a replacement glyph or skip
    expect(result.glyphs.length).toBeLessThanOrEqual(1);
  });
});

describe('Type5 flag constants', () => {
  it('HasGlyph is bit 0', () => {
    expect(Type5ShapeBankFlag.HasGlyph).toBe(1);
  });
});
