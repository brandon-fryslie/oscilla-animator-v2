/**
 * Perspective Camera demo - compile test (HCL source)
 */
import { describe, it, expect } from 'vitest';
import { deserializePatchFromHCL } from '../../patch-dsl/index';
import { compile } from '../../compiler/compile';
import { registerAllBlocks } from '../../blocks/all';
import { getHclDemo } from '../hcl-demos';
registerAllBlocks();

const demo = getHclDemo('perspective-camera.hcl');
if (!demo) {
  throw new Error('Missing HCL demo: perspective-camera.hcl');
}
const hcl = demo.hcl;

describe('perspective camera demo (HCL)', () => {
  it('deserializes without errors', () => {
    const result = deserializePatchFromHCL(hcl);
    expect(result.errors).toEqual([]);
  });

  it('compiles without errors', () => {
    const { patch, errors } = deserializePatchFromHCL(hcl);
    expect(errors).toEqual([]);

    const result = compile(patch);
    if (result.kind === 'error') {
      const msgs = result.errors.map(e => e.message);
      throw new Error(`Compilation failed:\n${msgs.join('\n')}`);
    }
    expect(result.kind).toBe('ok');
  });
});
