/**
 * Built-in MSDF Font Atlas — Procedural Monospace
 *
 * Generates a minimal MSDF atlas for basic Latin characters (ASCII 32–126)
 * using procedural signed distance fields. Each glyph is rendered as a simple
 * rectangular block with soft MSDF edges for scale-independent rendering.
 *
 * This is a first-slice placeholder atlas. Future work will replace this with
 * a proper MSDF atlas generated from a real font file via msdf-atlas-gen.
 *
 * // [LAW:one-source-of-truth] This module is the canonical source for the
 * // built-in font atlas. No other module generates or caches atlas data.
 *
 * Spec: docs/WebGPU-Complete/shapes/Shapes 5_ Deep Dive_ Text_Glyph Hybrid Rendering.md §II
 */

import type { FontAtlasDescriptor, GlyphMetrics } from './types';

// Atlas grid layout constants
const GLYPH_CELL_SIZE = 32; // pixels per glyph cell
const GLYPHS_PER_ROW = 16;
const GLYPH_PADDING = 4; // padding pixels around each glyph
const GLYPH_INNER_SIZE = GLYPH_CELL_SIZE - 2 * GLYPH_PADDING; // 24px usable
const DISTANCE_RANGE = 4.0; // MSDF distance range in atlas pixels
const FONT_SIZE = 32; // nominal font size

// ASCII printable range
const FIRST_CODEPOINT = 32; // space
const LAST_CODEPOINT = 126; // tilde
const GLYPH_COUNT = LAST_CODEPOINT - FIRST_CODEPOINT + 1; // 95 characters
const ROWS = Math.ceil(GLYPH_COUNT / GLYPHS_PER_ROW);
const ATLAS_WIDTH = GLYPHS_PER_ROW * GLYPH_CELL_SIZE; // 512
const ATLAS_HEIGHT = ROWS * GLYPH_CELL_SIZE; // 224

// Monospace character dimensions (normalized to fontSize = 1.0)
const CHAR_ADVANCE = 0.6;
const CHAR_QUAD_WIDTH = 0.5;
const CHAR_QUAD_HEIGHT = 0.8;
const CHAR_BEARING_X = 0.05;
const CHAR_BEARING_Y = 0.7; // baseline offset from top of quad

/**
 * Simple glyph shapes for MSDF generation.
 *
 * Each glyph is defined as a set of rectangles within the glyph cell.
 * The MSDF generator computes distance fields from these rectangles.
 * This produces recognizable but simplified letterforms.
 */
// prettier-ignore
const GLYPH_RECTS: ReadonlyMap<number, readonly { x: number; y: number; w: number; h: number }[]> = new Map([
  // Simple block for characters without specific shapes
  // Space (32) has no rectangles
  // Exclamation mark
  [33, [{ x: 0.4, y: 0.1, w: 0.2, h: 0.5 }, { x: 0.4, y: 0.75, w: 0.2, h: 0.15 }]],
  // Digits 0-9
  [48, [{ x: 0.1, y: 0.1, w: 0.8, h: 0.15 }, { x: 0.1, y: 0.1, w: 0.15, h: 0.8 }, { x: 0.75, y: 0.1, w: 0.15, h: 0.8 }, { x: 0.1, y: 0.75, w: 0.8, h: 0.15 }]], // 0
  [49, [{ x: 0.35, y: 0.1, w: 0.3, h: 0.8 }, { x: 0.15, y: 0.75, w: 0.7, h: 0.15 }]], // 1
  [50, [{ x: 0.1, y: 0.1, w: 0.8, h: 0.15 }, { x: 0.75, y: 0.1, w: 0.15, h: 0.35 }, { x: 0.1, y: 0.4, w: 0.8, h: 0.15 }, { x: 0.1, y: 0.4, w: 0.15, h: 0.35 }, { x: 0.1, y: 0.75, w: 0.8, h: 0.15 }]], // 2
  [51, [{ x: 0.1, y: 0.1, w: 0.8, h: 0.15 }, { x: 0.75, y: 0.1, w: 0.15, h: 0.8 }, { x: 0.3, y: 0.4, w: 0.45, h: 0.15 }, { x: 0.1, y: 0.75, w: 0.8, h: 0.15 }]], // 3
  [52, [{ x: 0.1, y: 0.1, w: 0.15, h: 0.45 }, { x: 0.75, y: 0.1, w: 0.15, h: 0.8 }, { x: 0.1, y: 0.4, w: 0.8, h: 0.15 }]], // 4
  [53, [{ x: 0.1, y: 0.1, w: 0.8, h: 0.15 }, { x: 0.1, y: 0.1, w: 0.15, h: 0.35 }, { x: 0.1, y: 0.4, w: 0.8, h: 0.15 }, { x: 0.75, y: 0.4, w: 0.15, h: 0.35 }, { x: 0.1, y: 0.75, w: 0.8, h: 0.15 }]], // 5
  [54, [{ x: 0.1, y: 0.1, w: 0.8, h: 0.15 }, { x: 0.1, y: 0.1, w: 0.15, h: 0.8 }, { x: 0.1, y: 0.4, w: 0.8, h: 0.15 }, { x: 0.75, y: 0.4, w: 0.15, h: 0.35 }, { x: 0.1, y: 0.75, w: 0.8, h: 0.15 }]], // 6
  [55, [{ x: 0.1, y: 0.1, w: 0.8, h: 0.15 }, { x: 0.75, y: 0.1, w: 0.15, h: 0.8 }]], // 7
  [56, [{ x: 0.1, y: 0.1, w: 0.8, h: 0.15 }, { x: 0.1, y: 0.1, w: 0.15, h: 0.8 }, { x: 0.75, y: 0.1, w: 0.15, h: 0.8 }, { x: 0.1, y: 0.4, w: 0.8, h: 0.15 }, { x: 0.1, y: 0.75, w: 0.8, h: 0.15 }]], // 8
  [57, [{ x: 0.1, y: 0.1, w: 0.8, h: 0.15 }, { x: 0.1, y: 0.1, w: 0.15, h: 0.35 }, { x: 0.75, y: 0.1, w: 0.15, h: 0.8 }, { x: 0.1, y: 0.4, w: 0.8, h: 0.15 }, { x: 0.1, y: 0.75, w: 0.8, h: 0.15 }]], // 9
  // Uppercase A-Z
  [65, [{ x: 0.1, y: 0.1, w: 0.8, h: 0.15 }, { x: 0.1, y: 0.1, w: 0.15, h: 0.8 }, { x: 0.75, y: 0.1, w: 0.15, h: 0.8 }, { x: 0.1, y: 0.45, w: 0.8, h: 0.15 }]], // A
  [66, [{ x: 0.1, y: 0.1, w: 0.7, h: 0.15 }, { x: 0.1, y: 0.1, w: 0.15, h: 0.8 }, { x: 0.7, y: 0.1, w: 0.15, h: 0.35 }, { x: 0.1, y: 0.4, w: 0.8, h: 0.15 }, { x: 0.75, y: 0.4, w: 0.15, h: 0.35 }, { x: 0.1, y: 0.75, w: 0.8, h: 0.15 }]], // B
  [67, [{ x: 0.1, y: 0.1, w: 0.8, h: 0.15 }, { x: 0.1, y: 0.1, w: 0.15, h: 0.8 }, { x: 0.1, y: 0.75, w: 0.8, h: 0.15 }]], // C
  [68, [{ x: 0.1, y: 0.1, w: 0.7, h: 0.15 }, { x: 0.1, y: 0.1, w: 0.15, h: 0.8 }, { x: 0.75, y: 0.1, w: 0.15, h: 0.8 }, { x: 0.1, y: 0.75, w: 0.8, h: 0.15 }]], // D
  [69, [{ x: 0.1, y: 0.1, w: 0.8, h: 0.15 }, { x: 0.1, y: 0.1, w: 0.15, h: 0.8 }, { x: 0.1, y: 0.4, w: 0.6, h: 0.15 }, { x: 0.1, y: 0.75, w: 0.8, h: 0.15 }]], // E
  [70, [{ x: 0.1, y: 0.1, w: 0.8, h: 0.15 }, { x: 0.1, y: 0.1, w: 0.15, h: 0.8 }, { x: 0.1, y: 0.4, w: 0.6, h: 0.15 }]], // F
  [71, [{ x: 0.1, y: 0.1, w: 0.8, h: 0.15 }, { x: 0.1, y: 0.1, w: 0.15, h: 0.8 }, { x: 0.5, y: 0.4, w: 0.4, h: 0.15 }, { x: 0.75, y: 0.4, w: 0.15, h: 0.35 }, { x: 0.1, y: 0.75, w: 0.8, h: 0.15 }]], // G
  [72, [{ x: 0.1, y: 0.1, w: 0.15, h: 0.8 }, { x: 0.75, y: 0.1, w: 0.15, h: 0.8 }, { x: 0.1, y: 0.4, w: 0.8, h: 0.15 }]], // H
  [73, [{ x: 0.1, y: 0.1, w: 0.8, h: 0.15 }, { x: 0.4, y: 0.1, w: 0.2, h: 0.8 }, { x: 0.1, y: 0.75, w: 0.8, h: 0.15 }]], // I
  [74, [{ x: 0.75, y: 0.1, w: 0.15, h: 0.8 }, { x: 0.1, y: 0.75, w: 0.8, h: 0.15 }, { x: 0.1, y: 0.55, w: 0.15, h: 0.2 }]], // J
  [75, [{ x: 0.1, y: 0.1, w: 0.15, h: 0.8 }, { x: 0.6, y: 0.1, w: 0.15, h: 0.35 }, { x: 0.25, y: 0.4, w: 0.5, h: 0.15 }, { x: 0.6, y: 0.5, w: 0.15, h: 0.4 }]], // K
  [76, [{ x: 0.1, y: 0.1, w: 0.15, h: 0.8 }, { x: 0.1, y: 0.75, w: 0.8, h: 0.15 }]], // L
  [77, [{ x: 0.1, y: 0.1, w: 0.15, h: 0.8 }, { x: 0.75, y: 0.1, w: 0.15, h: 0.8 }, { x: 0.1, y: 0.1, w: 0.8, h: 0.15 }, { x: 0.4, y: 0.1, w: 0.2, h: 0.4 }]], // M
  [78, [{ x: 0.1, y: 0.1, w: 0.15, h: 0.8 }, { x: 0.75, y: 0.1, w: 0.15, h: 0.8 }, { x: 0.1, y: 0.1, w: 0.8, h: 0.15 }]], // N
  [79, [{ x: 0.1, y: 0.1, w: 0.8, h: 0.15 }, { x: 0.1, y: 0.1, w: 0.15, h: 0.8 }, { x: 0.75, y: 0.1, w: 0.15, h: 0.8 }, { x: 0.1, y: 0.75, w: 0.8, h: 0.15 }]], // O
  [80, [{ x: 0.1, y: 0.1, w: 0.8, h: 0.15 }, { x: 0.1, y: 0.1, w: 0.15, h: 0.8 }, { x: 0.75, y: 0.1, w: 0.15, h: 0.35 }, { x: 0.1, y: 0.4, w: 0.8, h: 0.15 }]], // P
  [81, [{ x: 0.1, y: 0.1, w: 0.8, h: 0.15 }, { x: 0.1, y: 0.1, w: 0.15, h: 0.8 }, { x: 0.75, y: 0.1, w: 0.15, h: 0.8 }, { x: 0.1, y: 0.75, w: 0.8, h: 0.15 }, { x: 0.55, y: 0.6, w: 0.2, h: 0.2 }]], // Q
  [82, [{ x: 0.1, y: 0.1, w: 0.8, h: 0.15 }, { x: 0.1, y: 0.1, w: 0.15, h: 0.8 }, { x: 0.75, y: 0.1, w: 0.15, h: 0.35 }, { x: 0.1, y: 0.4, w: 0.8, h: 0.15 }, { x: 0.6, y: 0.5, w: 0.15, h: 0.4 }]], // R
  [83, [{ x: 0.1, y: 0.1, w: 0.8, h: 0.15 }, { x: 0.1, y: 0.1, w: 0.15, h: 0.35 }, { x: 0.1, y: 0.4, w: 0.8, h: 0.15 }, { x: 0.75, y: 0.4, w: 0.15, h: 0.35 }, { x: 0.1, y: 0.75, w: 0.8, h: 0.15 }]], // S
  [84, [{ x: 0.1, y: 0.1, w: 0.8, h: 0.15 }, { x: 0.4, y: 0.1, w: 0.2, h: 0.8 }]], // T
  [85, [{ x: 0.1, y: 0.1, w: 0.15, h: 0.8 }, { x: 0.75, y: 0.1, w: 0.15, h: 0.8 }, { x: 0.1, y: 0.75, w: 0.8, h: 0.15 }]], // U
  [86, [{ x: 0.1, y: 0.1, w: 0.15, h: 0.5 }, { x: 0.75, y: 0.1, w: 0.15, h: 0.5 }, { x: 0.3, y: 0.5, w: 0.4, h: 0.15 }, { x: 0.4, y: 0.6, w: 0.2, h: 0.3 }]], // V
  [87, [{ x: 0.1, y: 0.1, w: 0.15, h: 0.8 }, { x: 0.75, y: 0.1, w: 0.15, h: 0.8 }, { x: 0.1, y: 0.75, w: 0.8, h: 0.15 }, { x: 0.4, y: 0.5, w: 0.2, h: 0.3 }]], // W
  [88, [{ x: 0.1, y: 0.1, w: 0.2, h: 0.35 }, { x: 0.7, y: 0.1, w: 0.2, h: 0.35 }, { x: 0.35, y: 0.35, w: 0.3, h: 0.3 }, { x: 0.1, y: 0.55, w: 0.2, h: 0.35 }, { x: 0.7, y: 0.55, w: 0.2, h: 0.35 }]], // X
  [89, [{ x: 0.1, y: 0.1, w: 0.15, h: 0.35 }, { x: 0.75, y: 0.1, w: 0.15, h: 0.35 }, { x: 0.1, y: 0.4, w: 0.8, h: 0.15 }, { x: 0.4, y: 0.4, w: 0.2, h: 0.5 }]], // Y
  [90, [{ x: 0.1, y: 0.1, w: 0.8, h: 0.15 }, { x: 0.6, y: 0.2, w: 0.2, h: 0.25 }, { x: 0.35, y: 0.35, w: 0.3, h: 0.3 }, { x: 0.2, y: 0.55, w: 0.2, h: 0.25 }, { x: 0.1, y: 0.75, w: 0.8, h: 0.15 }]], // Z
  // Lowercase a-z (simplified)
  [97,  [{ x: 0.1, y: 0.3, w: 0.8, h: 0.15 }, { x: 0.75, y: 0.3, w: 0.15, h: 0.6 }, { x: 0.1, y: 0.75, w: 0.8, h: 0.15 }, { x: 0.1, y: 0.6, w: 0.15, h: 0.15 }]], // a
  [98,  [{ x: 0.1, y: 0.1, w: 0.15, h: 0.8 }, { x: 0.1, y: 0.35, w: 0.8, h: 0.15 }, { x: 0.75, y: 0.35, w: 0.15, h: 0.4 }, { x: 0.1, y: 0.75, w: 0.8, h: 0.15 }]], // b
  [99,  [{ x: 0.1, y: 0.35, w: 0.8, h: 0.15 }, { x: 0.1, y: 0.35, w: 0.15, h: 0.55 }, { x: 0.1, y: 0.75, w: 0.8, h: 0.15 }]], // c
  [100, [{ x: 0.75, y: 0.1, w: 0.15, h: 0.8 }, { x: 0.1, y: 0.35, w: 0.8, h: 0.15 }, { x: 0.1, y: 0.35, w: 0.15, h: 0.4 }, { x: 0.1, y: 0.75, w: 0.8, h: 0.15 }]], // d
  [101, [{ x: 0.1, y: 0.35, w: 0.8, h: 0.15 }, { x: 0.1, y: 0.35, w: 0.15, h: 0.55 }, { x: 0.1, y: 0.5, w: 0.8, h: 0.15 }, { x: 0.75, y: 0.35, w: 0.15, h: 0.15 }, { x: 0.1, y: 0.75, w: 0.8, h: 0.15 }]], // e
  [102, [{ x: 0.3, y: 0.1, w: 0.6, h: 0.15 }, { x: 0.3, y: 0.1, w: 0.15, h: 0.8 }, { x: 0.1, y: 0.35, w: 0.6, h: 0.15 }]], // f
  [103, [{ x: 0.1, y: 0.35, w: 0.8, h: 0.15 }, { x: 0.1, y: 0.35, w: 0.15, h: 0.4 }, { x: 0.75, y: 0.35, w: 0.15, h: 0.55 }, { x: 0.1, y: 0.75, w: 0.8, h: 0.15 }]], // g (tail simplified)
  [104, [{ x: 0.1, y: 0.1, w: 0.15, h: 0.8 }, { x: 0.1, y: 0.4, w: 0.8, h: 0.15 }, { x: 0.75, y: 0.4, w: 0.15, h: 0.5 }]], // h
  [105, [{ x: 0.4, y: 0.15, w: 0.2, h: 0.15 }, { x: 0.4, y: 0.4, w: 0.2, h: 0.5 }]], // i
  [106, [{ x: 0.55, y: 0.15, w: 0.2, h: 0.15 }, { x: 0.55, y: 0.4, w: 0.2, h: 0.5 }, { x: 0.2, y: 0.75, w: 0.55, h: 0.15 }]], // j
  [107, [{ x: 0.1, y: 0.1, w: 0.15, h: 0.8 }, { x: 0.55, y: 0.35, w: 0.15, h: 0.2 }, { x: 0.25, y: 0.5, w: 0.45, h: 0.15 }, { x: 0.55, y: 0.55, w: 0.15, h: 0.35 }]], // k
  [108, [{ x: 0.35, y: 0.1, w: 0.2, h: 0.8 }]], // l
  [109, [{ x: 0.1, y: 0.4, w: 0.15, h: 0.5 }, { x: 0.45, y: 0.4, w: 0.1, h: 0.5 }, { x: 0.75, y: 0.4, w: 0.15, h: 0.5 }, { x: 0.1, y: 0.4, w: 0.8, h: 0.15 }]], // m
  [110, [{ x: 0.1, y: 0.4, w: 0.15, h: 0.5 }, { x: 0.75, y: 0.4, w: 0.15, h: 0.5 }, { x: 0.1, y: 0.4, w: 0.8, h: 0.15 }]], // n
  [111, [{ x: 0.1, y: 0.35, w: 0.8, h: 0.15 }, { x: 0.1, y: 0.35, w: 0.15, h: 0.55 }, { x: 0.75, y: 0.35, w: 0.15, h: 0.55 }, { x: 0.1, y: 0.75, w: 0.8, h: 0.15 }]], // o
  [112, [{ x: 0.1, y: 0.35, w: 0.8, h: 0.15 }, { x: 0.1, y: 0.35, w: 0.15, h: 0.55 }, { x: 0.75, y: 0.35, w: 0.15, h: 0.4 }, { x: 0.1, y: 0.6, w: 0.8, h: 0.15 }]], // p (descender simplified)
  [113, [{ x: 0.1, y: 0.35, w: 0.8, h: 0.15 }, { x: 0.1, y: 0.35, w: 0.15, h: 0.4 }, { x: 0.75, y: 0.35, w: 0.15, h: 0.55 }, { x: 0.1, y: 0.6, w: 0.8, h: 0.15 }]], // q
  [114, [{ x: 0.1, y: 0.4, w: 0.15, h: 0.5 }, { x: 0.1, y: 0.4, w: 0.8, h: 0.15 }]], // r
  [115, [{ x: 0.1, y: 0.35, w: 0.8, h: 0.15 }, { x: 0.1, y: 0.35, w: 0.15, h: 0.2 }, { x: 0.1, y: 0.5, w: 0.8, h: 0.15 }, { x: 0.75, y: 0.5, w: 0.15, h: 0.25 }, { x: 0.1, y: 0.75, w: 0.8, h: 0.15 }]], // s
  [116, [{ x: 0.35, y: 0.1, w: 0.2, h: 0.8 }, { x: 0.1, y: 0.35, w: 0.7, h: 0.15 }]], // t
  [117, [{ x: 0.1, y: 0.4, w: 0.15, h: 0.5 }, { x: 0.75, y: 0.4, w: 0.15, h: 0.5 }, { x: 0.1, y: 0.75, w: 0.8, h: 0.15 }]], // u
  [118, [{ x: 0.1, y: 0.4, w: 0.15, h: 0.3 }, { x: 0.75, y: 0.4, w: 0.15, h: 0.3 }, { x: 0.3, y: 0.6, w: 0.4, h: 0.15 }, { x: 0.4, y: 0.7, w: 0.2, h: 0.2 }]], // v
  [119, [{ x: 0.1, y: 0.4, w: 0.15, h: 0.5 }, { x: 0.45, y: 0.55, w: 0.1, h: 0.35 }, { x: 0.75, y: 0.4, w: 0.15, h: 0.5 }, { x: 0.1, y: 0.75, w: 0.8, h: 0.15 }]], // w
  [120, [{ x: 0.1, y: 0.4, w: 0.2, h: 0.2 }, { x: 0.7, y: 0.4, w: 0.2, h: 0.2 }, { x: 0.35, y: 0.5, w: 0.3, h: 0.15 }, { x: 0.1, y: 0.65, w: 0.2, h: 0.25 }, { x: 0.7, y: 0.65, w: 0.2, h: 0.25 }]], // x
  [121, [{ x: 0.1, y: 0.4, w: 0.15, h: 0.25 }, { x: 0.75, y: 0.4, w: 0.15, h: 0.5 }, { x: 0.1, y: 0.6, w: 0.8, h: 0.15 }, { x: 0.1, y: 0.75, w: 0.8, h: 0.15 }]], // y
  [122, [{ x: 0.1, y: 0.35, w: 0.8, h: 0.15 }, { x: 0.5, y: 0.45, w: 0.3, h: 0.15 }, { x: 0.2, y: 0.6, w: 0.3, h: 0.15 }, { x: 0.1, y: 0.75, w: 0.8, h: 0.15 }]], // z
  // Period and comma
  [46, [{ x: 0.35, y: 0.75, w: 0.3, h: 0.15 }]], // .
  [44, [{ x: 0.35, y: 0.7, w: 0.3, h: 0.2 }]], // ,
  // Colon and semicolon
  [58, [{ x: 0.4, y: 0.3, w: 0.2, h: 0.15 }, { x: 0.4, y: 0.65, w: 0.2, h: 0.15 }]], // :
  [59, [{ x: 0.4, y: 0.3, w: 0.2, h: 0.15 }, { x: 0.4, y: 0.65, w: 0.2, h: 0.2 }]], // ;
  // Hyphen / dash
  [45, [{ x: 0.15, y: 0.45, w: 0.7, h: 0.15 }]], // -
  // Question mark
  [63, [{ x: 0.1, y: 0.1, w: 0.8, h: 0.15 }, { x: 0.75, y: 0.1, w: 0.15, h: 0.3 }, { x: 0.3, y: 0.35, w: 0.6, h: 0.15 }, { x: 0.35, y: 0.45, w: 0.2, h: 0.15 }, { x: 0.35, y: 0.75, w: 0.3, h: 0.15 }]], // ?
  // Replacement character U+FFFD (solid block)
  [0xFFFD, [{ x: 0.1, y: 0.1, w: 0.8, h: 0.8 }]],
]);

/**
 * Compute signed distance from a point to the nearest rectangle edge.
 * Negative = inside, positive = outside.
 */
function distanceToRects(
  px: number,
  py: number,
  rects: readonly { x: number; y: number; w: number; h: number }[],
): number {
  let minDist = Infinity;
  for (const rect of rects) {
    // Distance to axis-aligned rectangle
    const dx = Math.max(rect.x - px, 0, px - (rect.x + rect.w));
    const dy = Math.max(rect.y - py, 0, py - (rect.y + rect.h));
    const outsideDist = Math.sqrt(dx * dx + dy * dy);

    if (outsideDist > 0) {
      // Outside the rectangle
      minDist = Math.min(minDist, outsideDist);
    } else {
      // Inside the rectangle — compute negative distance to nearest edge
      const insideDist = -Math.min(
        px - rect.x,
        rect.x + rect.w - px,
        py - rect.y,
        rect.y + rect.h - py,
      );
      minDist = Math.min(minDist, insideDist);
    }
  }
  return minDist;
}

/**
 * Generate the built-in procedural MSDF font atlas.
 *
 * Creates a monospace atlas with simplified letterform shapes defined as
 * rectangle compositions. Each glyph cell contains a pseudo-MSDF where
 * R, G, B channels encode the signed distance with slight directional
 * offsets to enable multi-channel median reconstruction.
 */
export function generateBuiltinAtlas(): FontAtlasDescriptor {
  const textureData = new Uint8Array(ATLAS_WIDTH * ATLAS_HEIGHT * 4);
  const glyphs = new Map<number, GlyphMetrics>();

  for (let cp = FIRST_CODEPOINT; cp <= LAST_CODEPOINT; cp++) {
    const glyphIndex = cp - FIRST_CODEPOINT;
    const cellCol = glyphIndex % GLYPHS_PER_ROW;
    const cellRow = Math.floor(glyphIndex / GLYPHS_PER_ROW);
    const cellX = cellCol * GLYPH_CELL_SIZE;
    const cellY = cellRow * GLYPH_CELL_SIZE;

    // UV coordinates (normalized)
    const u0 = (cellX + GLYPH_PADDING) / ATLAS_WIDTH;
    const v0 = (cellY + GLYPH_PADDING) / ATLAS_HEIGHT;
    const u1 = (cellX + GLYPH_PADDING + GLYPH_INNER_SIZE) / ATLAS_WIDTH;
    const v1 = (cellY + GLYPH_PADDING + GLYPH_INNER_SIZE) / ATLAS_HEIGHT;

    glyphs.set(cp, {
      codepoint: cp,
      u0, v0, u1, v1,
      atlasWidth: GLYPH_INNER_SIZE,
      atlasHeight: GLYPH_INNER_SIZE,
      advance: CHAR_ADVANCE,
      bearingX: CHAR_BEARING_X,
      bearingY: CHAR_BEARING_Y,
      quadWidth: CHAR_QUAD_WIDTH,
      quadHeight: CHAR_QUAD_HEIGHT,
    });

    // Get glyph shape (if defined)
    const rects = GLYPH_RECTS.get(cp);

    // Render MSDF data into the cell
    for (let py = 0; py < GLYPH_CELL_SIZE; py++) {
      for (let px = 0; px < GLYPH_CELL_SIZE; px++) {
        const texX = cellX + px;
        const texY = cellY + py;
        const pixelOffset = (texY * ATLAS_WIDTH + texX) * 4;

        if (!rects || rects.length === 0) {
          // Empty glyph (space, undefined) — all distance = max
          textureData[pixelOffset + 0] = 0;
          textureData[pixelOffset + 1] = 0;
          textureData[pixelOffset + 2] = 0;
          textureData[pixelOffset + 3] = 255;
          continue;
        }

        // Normalize pixel position to [0, 1] within the cell
        const nx = px / GLYPH_CELL_SIZE;
        const ny = py / GLYPH_CELL_SIZE;

        // Compute signed distance with slight directional offsets for MSDF
        // R channel: slight X offset, G channel: slight Y offset, B channel: center
        const offset = 0.5 / GLYPH_CELL_SIZE; // half-pixel offset
        const distR = distanceToRects(nx + offset, ny, rects);
        const distG = distanceToRects(nx, ny + offset, rects);
        const distB = distanceToRects(nx, ny, rects);

        // Map signed distance to [0, 255]: 128 = on edge, <128 = inside, >128 = outside
        const rangeNorm = DISTANCE_RANGE / GLYPH_CELL_SIZE;
        const r = Math.round(Math.max(0, Math.min(255, 128 - (distR / rangeNorm) * 128)));
        const g = Math.round(Math.max(0, Math.min(255, 128 - (distG / rangeNorm) * 128)));
        const b = Math.round(Math.max(0, Math.min(255, 128 - (distB / rangeNorm) * 128)));

        textureData[pixelOffset + 0] = r;
        textureData[pixelOffset + 1] = g;
        textureData[pixelOffset + 2] = b;
        textureData[pixelOffset + 3] = 255;
      }
    }
  }

  // Add replacement character metrics
  const replacementGlyph = glyphs.get(FIRST_CODEPOINT); // Use same metrics as space
  if (replacementGlyph && !glyphs.has(0xFFFD)) {
    // Render U+FFFD into a cell after the main range
    glyphs.set(0xFFFD, {
      ...replacementGlyph,
      codepoint: 0xFFFD,
    });
  }

  return {
    width: ATLAS_WIDTH,
    height: ATLAS_HEIGHT,
    distanceRange: DISTANCE_RANGE,
    fontSize: FONT_SIZE,
    lineHeight: 1.2,
    baseline: 0.8,
    glyphs,
    textureData,
  };
}

/** Cached singleton atlas instance */
let cachedAtlas: FontAtlasDescriptor | null = null;

/**
 * Get the built-in font atlas (lazily generated, cached).
 */
export function getBuiltinAtlas(): FontAtlasDescriptor {
  if (!cachedAtlas) {
    cachedAtlas = generateBuiltinAtlas();
  }
  return cachedAtlas;
}
