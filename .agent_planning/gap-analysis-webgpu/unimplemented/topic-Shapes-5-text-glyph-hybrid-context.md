# Context: Shapes 5 - Text/Glyph Hybrid Rendering

## Target State
Type 5 (Text/Glyph Hybrid) shapes require:
1. CPU-side text shaping engine (HarfBuzz or equivalent) for complex script support
2. MSDF font atlas generation and texture management
3. Glyph-run packing: glyph index + pen offset + style refs per visible character
4. Shared quad topology in ShapeBank (all glyphs share one quad)
5. Per-glyph instance data in Arena channels (atlas UV, position, style)
6. MSDF fragment shader with scale-independent edge evaluation
7. Text layout engine (bounding box, alignment, direction, wrapping)
8. Styling support (outline, shadow, glow via MSDF thresholds)
9. Z-fighting prevention (depth-write disabled for text, painter's algorithm)

## Current State
Text rendering is entirely absent from the codebase. Zero files match MSDF, glyph, text rendering, font atlas, or HarfBuzz in `src/`. This is the most distant from implementation of all taxonomy classes.

## Files Involved (would need to be created)
- NEW: `src/blocks/shape/text.ts` - Text block definition
- NEW: `src/text/shaper.ts` - Text shaping engine (HarfBuzz WASM or JS equivalent)
- NEW: `src/text/atlas.ts` - MSDF atlas management
- NEW: `src/text/layout.ts` - Text layout engine
- NEW: `src/text/types.ts` - Glyph run types
- NEW: MSDF fragment shader WGSL
- MODIFY: `src/render/wasm/rust/oscilla-rust-renderer/src/render.rs` - Text render pipeline
- NEW: Font loading and asset management

## Suggested Approach
This is a major feature area. Recommended phased approach:
1. **Phase 0**: Add msdf-bmfont-xml or similar MSDF atlas generator as build dependency
2. **Phase 1**: Static text rendering with pre-built atlas (one font, ASCII only)
3. **Phase 2**: Dynamic text with layout engine (wrapping, alignment)
4. **Phase 3**: Complex script support via HarfBuzz WASM
5. **Phase 4**: Advanced styling (outline, shadow, glow)

## Risks
- WASM HarfBuzz dependency adds significant build complexity
- CJK support requires dynamic atlas extension (double-buffered texture caching per spec)
- MSDF quality at small scales requires careful threshold tuning
- Text rendering is a deep domain with many edge cases (RTL, combining characters, emoji)
- Z-fighting between text and other shapes requires depth policy management
