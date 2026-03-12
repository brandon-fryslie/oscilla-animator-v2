import { describe, expect, it } from 'vitest';
import {
  PATH_RENDER_WGSL,
  shaderEncodesViewToClipAspectCorrection,
  shaderUsesCanonicalVpMTransformChain,
} from '../shaders';

describe('PATH_RENDER_WGSL transform contract', () => {
  it('uses the canonical VP * (M * p_local) chain', () => {
    expect(shaderUsesCanonicalVpMTransformChain(PATH_RENDER_WGSL)).toBe(true);
    expect(PATH_RENDER_WGSL).toContain('fn build_model_matrix');
    expect(PATH_RENDER_WGSL).toContain('fn build_view_projection_matrix');
  });

  it('keeps aspect correction in the view->clip stage', () => {
    expect(shaderEncodesViewToClipAspectCorrection(PATH_RENDER_WGSL)).toBe(true);
  });

  it('does not rely on legacy inline finalPx/ndc projection variables', () => {
    expect(PATH_RENDER_WGSL.includes('let finalPx =')).toBe(false);
    expect(PATH_RENDER_WGSL.includes('let ndc =')).toBe(false);
  });
});
