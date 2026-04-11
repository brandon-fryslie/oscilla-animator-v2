/**
 * src/pillars/block-dsl/presentation/storage-texture.ts
 *
 * Constructor for a 2D storage TextureSpec. Mirrors canvas-attachment's
 * pattern: a single value-constructor that returns a fully-formed boundary
 * contract value with no branching at the call site.
 *
 * The texture is created with usage `['storage', 'sampled']` so it can be
 * written by a compute pass (storage) and consumed by a downstream
 * material via textureSample (sampled). Format defaults to rgba8unorm —
 * the only format the current Materialize sink emits.
 *
 * This module is a leaf — it imports only types from the boundary
 * contract.
 */

import type { TextureSpec } from '../../../render/rust/boundary-contract';

export function makeStorageTexture2D(
  width: number,
  height: number,
  format: string = 'rgba8unorm',
): TextureSpec {
  return {
    dimension: '2d',
    width,
    height,
    format,
    usage: ['storage', 'sampled'],
  };
}
