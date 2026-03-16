/**
 * Text Shaping — CPU-side glyph positioning for Type 5 text.
 *
 * For the first slice (S06), this implements basic Latin left-to-right
 * text shaping without complex script support (HarfBuzz). Each character
 * maps directly to a glyph via codepoint lookup, and positioning uses
 * simple advance-width accumulation.
 *
 * // [LAW:one-source-of-truth] Text shaping is CPU-side (spec Section I).
 * // The output is a GlyphRunResult consumed by Type5 materialization.
 *
 * Spec: docs/WebGPU-Complete/shapes/Shapes 5_ Deep Dive_ Text_Glyph Hybrid Rendering.md §I
 */

import type { FontAtlasDescriptor, GlyphRunResult, ShapedGlyph, GlyphMetrics } from './types';

// Unicode replacement character for invalid/missing glyphs
// Spec §III invariant 1: "Invalid byte sequences must default to U+FFFD"
const REPLACEMENT_CODEPOINT = 0xFFFD;

/**
 * Shape a UTF-8 text string into positioned glyphs.
 *
 * Basic Latin LTR shaping: codepoint → metrics lookup → advance accumulation.
 * Missing glyphs fall back to the replacement character or are skipped.
 *
 * @param text - Input text string (UTF-8)
 * @param atlas - Font atlas descriptor with per-glyph metrics
 * @returns Shaped glyph run with positions and bounding box
 */
export function shapeText(text: string, atlas: FontAtlasDescriptor): GlyphRunResult {
  const glyphs: ShapedGlyph[] = [];
  let penX = 0;
  let penY = 0;
  let boundsMinX = Infinity;
  let boundsMinY = Infinity;
  let boundsMaxX = -Infinity;
  let boundsMaxY = -Infinity;

  for (let i = 0; i < text.length; i++) {
    const codepoint = text.codePointAt(i)!;

    // Skip non-visible whitespace (space is handled via advance, no glyph quad)
    if (codepoint === 0x0A) {
      // Newline: advance pen to next line
      penX = 0;
      penY -= atlas.lineHeight;
      continue;
    }

    // Handle surrogate pairs
    if (codepoint > 0xFFFF) {
      i++; // Skip second code unit of surrogate pair
    }

    // Look up glyph metrics; fall back to replacement character
    let metrics: GlyphMetrics | undefined = atlas.glyphs.get(codepoint);
    if (!metrics) {
      metrics = atlas.glyphs.get(REPLACEMENT_CODEPOINT);
    }
    if (!metrics) {
      // No replacement glyph available — skip entirely
      continue;
    }

    // Space characters contribute advance but no visible quad
    if (codepoint === 0x20) {
      penX += metrics.advance;
      continue;
    }

    // Compute glyph quad position
    const glyphX = penX + metrics.bearingX;
    const glyphY = penY + metrics.bearingY - metrics.quadHeight;

    // Update bounding box
    boundsMinX = Math.min(boundsMinX, glyphX);
    boundsMinY = Math.min(boundsMinY, glyphY);
    boundsMaxX = Math.max(boundsMaxX, glyphX + metrics.quadWidth);
    boundsMaxY = Math.max(boundsMaxY, glyphY + metrics.quadHeight);

    glyphs.push({
      codepoint,
      penX: glyphX,
      penY: glyphY,
      metrics,
    });

    penX += metrics.advance;
  }

  return {
    glyphs,
    totalAdvance: penX,
    boundsMinX: isFinite(boundsMinX) ? boundsMinX : 0,
    boundsMinY: isFinite(boundsMinY) ? boundsMinY : 0,
    boundsMaxX: isFinite(boundsMaxX) ? boundsMaxX : 0,
    boundsMaxY: isFinite(boundsMaxY) ? boundsMaxY : 0,
  };
}
