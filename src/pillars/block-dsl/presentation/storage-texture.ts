import type { TextureSpec } from '../../block-api';

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
