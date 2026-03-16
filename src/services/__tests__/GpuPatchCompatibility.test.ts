import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { registerAllBlocks } from '../../blocks/all';
import { getBlockDefinition } from '../../blocks/registry';
import { deserializePatchFromHCL } from '../../patch-dsl';
import { verifyGpuPatchCompatibility } from '../GpuPatchCompatibility';

registerAllBlocks();

function readDemo(filename: string): string {
  return readFileSync(join(process.cwd(), 'src', 'demo', 'hcl', filename), 'utf8');
}

describe('GPU patch compatibility', () => {
  it('marks the bootstrap path blocks as verified and legacy render block as unverified', () => {
    expect(getBlockDefinition('InfiniteTimeRoot')?.gpuVerified).toBe(true);
    expect(getBlockDefinition('Const')?.gpuVerified).toBe(true);
    expect(getBlockDefinition('GpuTriangleRigid')?.gpuVerified).toBe(true);
    expect(getBlockDefinition('WebGPUType1Sink')?.gpuVerified).toBe(true);
    expect(getBlockDefinition('RenderInstances2D')?.gpuVerified).toBe(false);
  });

  it('accepts the canonical GPU bootstrap demo', () => {
    const parsed = deserializePatchFromHCL(readDemo('gpu-bootstrap-triangle.hcl'));
    expect(parsed.errors).toEqual([]);
    expect(verifyGpuPatchCompatibility(parsed.patch)).toEqual({
      ok: true,
      unknownBlockTypes: [],
      unverifiedBlockTypes: [],
    });
  });

  it('rejects legacy demos that still depend on unverified blocks', () => {
    const parsed = deserializePatchFromHCL(readDemo('simple.hcl'));
    expect(parsed.errors).toEqual([]);
    const verification = verifyGpuPatchCompatibility(parsed.patch);
    expect(verification.ok).toBe(false);
    expect(verification.unknownBlockTypes).toEqual([]);
    expect(verification.unverifiedBlockTypes).toEqual(
      expect.arrayContaining(['Array', 'CircleLayoutUV', 'Ellipse', 'MakeColorOKLCH', 'MakeShape2D', 'RenderInstances2D', 'ShapeWobble2D']),
    );
  });
});
