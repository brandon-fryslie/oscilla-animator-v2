# Shapes 5: Text/Glyph Hybrid Rendering - UNIMPLEMENTED Items

## Item 1: CPU/Worker Text Shaping Engine
**Spec says**: "CPU/worker performs shaping/layout" using a text shaping engine (like HarfBuzz) to convert characters into positioned glyphs. Handles UTF-8, complex scripts (Arabic, Devanagari), ligatures, kerning.
**Implementation**: No text shaping code exists anywhere in the codebase. Grep for MSDF, glyph, text_render, font_atlas, harfbuzz returns zero matches in `src/`.
**Gap**: Entire text shaping pipeline is missing.
**Classification**: UNIMPLEMENTED

## Item 2: MSDF Font Atlas System
**Spec says**: Font atlas with MSDF (Multi-channel Signed Distance Field) texture. Atlas is a 512x512 or 1024x1024 RGB texture per font. Glyph metrics stored in contiguous lookup table. Atlas is read-only once loaded.
**Implementation**: No font atlas system exists. No MSDF texture generation or loading. No glyph metrics storage.
**Gap**: Entire MSDF atlas system is missing.
**Classification**: UNIMPLEMENTED

## Item 3: Glyph-Run Instance Data
**Spec says**: Arena carries glyph-run instances and styling params. Per-glyph: glyph index + pen offset + style refs. CPU shapes runs then packs into upload buffers.
**Implementation**: No glyph-run data structures exist. No styling parameter channels.
**Gap**: Entire glyph-run system is missing.
**Classification**: UNIMPLEMENTED

## Item 4: MSDF Fragment Shader
**Spec says**: Fragment stage uses atlas metadata + MSDF evaluation for resolution-independent text rendering. Must handle: bilinear interpolation, screen-space derivative-based threshold adjustment for small scales, outline rendering, drop shadow.
**Implementation**: No MSDF fragment shader exists.
**Gap**: Entire MSDF shader is missing.
**Classification**: UNIMPLEMENTED

## Item 5: Shared Quad Topology for Glyphs
**Spec says**: "Shared quad topology in ShapeBank" - all glyphs share the same quad geometry, differentiated by UV coordinates and instance data.
**Implementation**: No shared glyph quad topology exists. The proxy quad concept needed here is similar to SDF Type 4 but with UV mapping to atlas regions.
**Gap**: No glyph quad topology.
**Classification**: UNIMPLEMENTED

## Item 6: UTF-8 Strictness and Replacement Character
**Spec says**: Hard Invariant 1: "Input string parser must strictly validate UTF-8. Invalid byte sequences must default to Unicode Replacement Character (U+FFFD)."
**Implementation**: No text input parsing exists.
**Gap**: No UTF-8 validation.
**Classification**: UNIMPLEMENTED

## Item 7: Glyph Quad Ratio (4N vertices, 6N indices)
**Spec says**: Hard Invariant 2: "For N visible glyphs, produce exactly 4N quad vertices and 6N quad indices."
**Implementation**: No glyph quad generation.
**Gap**: No glyph geometry generation.
**Classification**: UNIMPLEMENTED

## Item 8: UV Bound Adherence
**Spec says**: Hard Invariant 3: "All UV coordinates must fall strictly within [0.0, 1.0] range of the font atlas."
**Implementation**: No UV generation exists.
**Gap**: No UV system.
**Classification**: UNIMPLEMENTED

## Item 9: Atlas Immutability
**Spec says**: Hard Invariant 4: "Once a font's MSDF atlas is generated or loaded, the texture data is read-only."
**Implementation**: No atlas exists.
**Gap**: No atlas to be immutable.
**Classification**: UNIMPLEMENTED

## Item 10: Layout and Alignment
**Spec says**: Bounding box constraints (width, height, max lines), alignment (left/right/center/justify), direction (LTR/RTL), line height, character spacing.
**Implementation**: No text layout system exists.
**Gap**: Entire layout system missing.
**Classification**: UNIMPLEMENTED

## Item 11: Text Styling (Outline, Shadow, Glow)
**Spec says**: Styling parameters: fill color, outline width, outline color, drop shadow offset/softness, glow thresholds.
**Implementation**: No text styling parameters exist.
**Gap**: No text styling system.
**Classification**: UNIMPLEMENTED
