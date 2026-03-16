/**
 * Type 5 Text/Glyph Hybrid Module
 *
 * Public API for text rendering pipeline: font atlas, text shaping,
 * and Type5 ShapeBank layout constants.
 */

export type {
  GlyphMetrics,
  FontAtlasDescriptor,
  ShapedGlyph,
  GlyphRunResult,
} from './types';
export { Type5ShapeBankWord, Type5ShapeBankFlag } from './types';
export { shapeText } from './shaping';
export { getBuiltinAtlas, generateBuiltinAtlas } from './builtin-atlas';
export { packAtlasForUpload } from './atlas-upload';
