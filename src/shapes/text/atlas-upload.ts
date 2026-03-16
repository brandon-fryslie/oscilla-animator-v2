/**
 * Atlas Upload — Pack MSDF atlas data for GPU storage buffer upload.
 *
 * Converts FontAtlasDescriptor texture data (RGBA u8 pixels) into the
 * packed u32 format consumed by the Rust renderer atlas storage buffer.
 *
 * Storage buffer layout: [0]=width, [1]=height, [2..]=packed RGBA pixels
 * where each pixel is a single u32: R | (G << 8) | (B << 16) | (A << 24).
 *
 * // [LAW:one-source-of-truth] This packing format matches the WGSL shader
 * // unpacking in DEFAULT_UBER_SHADER_WGSL fs_main Type5 branch.
 */

import type { FontAtlasDescriptor } from './types';

function validateAtlasDescriptor(atlas: FontAtlasDescriptor): void {
  const pixelCount = atlas.width * atlas.height;
  const expectedTextureBytes = pixelCount * 4;
  if (!Number.isInteger(atlas.width) || atlas.width <= 0) {
    throw new Error(`packAtlasForUpload: atlas.width must be a positive integer (received ${String(atlas.width)})`);
  }
  if (!Number.isInteger(atlas.height) || atlas.height <= 0) {
    throw new Error(`packAtlasForUpload: atlas.height must be a positive integer (received ${String(atlas.height)})`);
  }
  if (atlas.textureData.length !== expectedTextureBytes) {
    // [LAW:single-enforcer] Atlas packing owns descriptor-shape validation so
    // malformed atlas uploads fail once at the GPU upload boundary.
    throw new Error(
      `packAtlasForUpload: textureData length ${atlas.textureData.length} does not match width*height*4 ${expectedTextureBytes}`,
    );
  }
}

/**
 * Pack a FontAtlasDescriptor's texture data into a Uint32Array for GPU upload.
 *
 * @param atlas - Font atlas descriptor with RGBA u8 texture data
 * @returns Packed Uint32Array: [width, height, ...pixels]
 */
export function packAtlasForUpload(atlas: FontAtlasDescriptor): Uint32Array {
  validateAtlasDescriptor(atlas);
  const pixelCount = atlas.width * atlas.height;
  const result = new Uint32Array(2 + pixelCount);

  result[0] = atlas.width;
  result[1] = atlas.height;

  const tex = atlas.textureData;
  for (let i = 0; i < pixelCount; i++) {
    const base = i * 4;
    const r = tex[base]!;
    const g = tex[base + 1]!;
    const b = tex[base + 2]!;
    const a = tex[base + 3]!;
    result[2 + i] = r | (g << 8) | (b << 16) | (a << 24);
  }

  return result;
}
