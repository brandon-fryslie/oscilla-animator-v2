/**
 * Type 5 Text/Glyph Hybrid — Contract Types
 *
 * // [LAW:one-source-of-truth] These types define the canonical data contracts
 * // for the Type 5 text rendering pipeline. Font atlas, glyph metrics, and
 * // shaped glyph runs all flow through these definitions.
 *
 * Spec: docs/current/webgpu-specs/shapes/Shapes 5_ Deep Dive_ Text_Glyph Hybrid Rendering.md
 */

// =============================================================================
// Font Atlas
// =============================================================================

/**
 * GlyphMetrics — Per-glyph atlas and layout metadata.
 *
 * UV coordinates are normalized [0, 1] within the atlas texture.
 * Advance and bearing are in normalized units relative to fontSize = 1.0.
 */
export interface GlyphMetrics {
  /** Codepoint this glyph represents */
  readonly codepoint: number;
  /** Atlas UV — left edge (normalized 0..1) */
  readonly u0: number;
  /** Atlas UV — top edge (normalized 0..1) */
  readonly v0: number;
  /** Atlas UV — right edge (normalized 0..1) */
  readonly u1: number;
  /** Atlas UV — bottom edge (normalized 0..1) */
  readonly v1: number;
  /** Glyph width in atlas pixels */
  readonly atlasWidth: number;
  /** Glyph height in atlas pixels */
  readonly atlasHeight: number;
  /** Horizontal advance (normalized) */
  readonly advance: number;
  /** Horizontal bearing (normalized) — offset from pen to glyph left edge */
  readonly bearingX: number;
  /** Vertical bearing (normalized) — offset from baseline to glyph top edge */
  readonly bearingY: number;
  /** Glyph quad width (normalized) */
  readonly quadWidth: number;
  /** Glyph quad height (normalized) */
  readonly quadHeight: number;
}

/**
 * FontAtlasDescriptor — Describes a loaded MSDF font atlas.
 *
 * The atlas texture is an RGBA image where RGB channels encode multi-channel
 * signed distance values. The alpha channel may carry additional distance data
 * or be set to 1.0.
 */
export interface FontAtlasDescriptor {
  /** Atlas texture width in pixels */
  readonly width: number;
  /** Atlas texture height in pixels */
  readonly height: number;
  /** Distance field range in atlas pixels (for MSDF threshold computation) */
  readonly distanceRange: number;
  /** Font size used to generate the atlas (for normalization) */
  readonly fontSize: number;
  /** Line height (normalized) */
  readonly lineHeight: number;
  /** Baseline offset from top of line (normalized) */
  readonly baseline: number;
  /** Per-glyph metrics indexed by codepoint */
  readonly glyphs: ReadonlyMap<number, GlyphMetrics>;
  /** Atlas texture data as RGBA u8 (width * height * 4 bytes) */
  readonly textureData: Uint8Array;
}

// =============================================================================
// Glyph Run (CPU-Shaped Output)
// =============================================================================

/**
 * ShapedGlyph — One positioned glyph in a shaped run.
 *
 * Produced by CPU-side text shaping; consumed by the Type5 materialization
 * pipeline that writes ShapeBank entries and arena fields.
 */
export interface ShapedGlyph {
  /** Codepoint of this glyph */
  readonly codepoint: number;
  /** Pen X offset from the text origin (normalized to fontSize) */
  readonly penX: number;
  /** Pen Y offset from the text origin (normalized to fontSize) */
  readonly penY: number;
  /** Metrics reference for atlas UV lookup */
  readonly metrics: GlyphMetrics;
}

/**
 * GlyphRunResult — Output of CPU text shaping.
 *
 * Contains the positioned glyphs and the overall bounding box.
 */
export interface GlyphRunResult {
  /** Ordered list of shaped glyphs */
  readonly glyphs: readonly ShapedGlyph[];
  /** Total advance width of the run (normalized) */
  readonly totalAdvance: number;
  /** Bounding box: min X (normalized) */
  readonly boundsMinX: number;
  /** Bounding box: min Y (normalized) */
  readonly boundsMinY: number;
  /** Bounding box: max X (normalized) */
  readonly boundsMaxX: number;
  /** Bounding box: max Y (normalized) */
  readonly boundsMaxY: number;
}

// =============================================================================
// Type5 ShapeBank Header Layout
// =============================================================================

/**
 * Type5ShapeBankWord — Word offsets for Type5 (text/glyph) ShapeBank entries.
 *
 * Shares words 0–3 with the generic ShapeBankHeaderV1 layout (Kind,
 * TopologyMode, Flags, MaterialClass). Words 4–15 are Type5-specific:
 * glyph UV rect, quad dimensions, and atlas metadata.
 *
 * // [LAW:one-type-per-behavior] Type5 header has a different layout from Type1
 * // because text glyphs carry UV data, not control-point arena addresses.
 */
export const Type5ShapeBankWord = {
  // --- Shared with generic header (words 0–3) ---
  Kind: 0,
  TopologyMode: 1,
  Flags: 2,
  MaterialClass: 3,

  // --- Type5-specific (words 4–15) ---
  /** UV min X (f32 bitcast to u32) */
  UvMinX: 4,
  /** UV min Y (f32 bitcast to u32) */
  UvMinY: 5,
  /** UV max X (f32 bitcast to u32) */
  UvMaxX: 6,
  /** UV max Y (f32 bitcast to u32) */
  UvMaxY: 7,
  /** Glyph quad width in normalized units (f32 bitcast to u32) */
  QuadWidth: 8,
  /** Glyph quad height in normalized units (f32 bitcast to u32) */
  QuadHeight: 9,
  /** Atlas texture width in pixels (u32) */
  AtlasWidth: 10,
  /** Atlas texture height in pixels (u32) */
  AtlasHeight: 11,
  /** Distance field range in atlas pixels (f32 bitcast to u32) */
  DistanceRange: 12,
  /** Reserved */
  Reserved13: 13,
  /** Reserved */
  Reserved14: 14,
  /** Reserved */
  Reserved15: 15,
} as const;

/**
 * Type5 flag bits stored in Type5ShapeBankWord.Flags.
 */
export const Type5ShapeBankFlag = {
  /** Glyph has a valid atlas entry (not a .notdef fallback) */
  HasGlyph: 1 << 0,
} as const;
