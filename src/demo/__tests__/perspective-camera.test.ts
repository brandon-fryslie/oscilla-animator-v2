/**
 * Perspective Camera demo - compile test (HCL source)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { deserializePatchFromHCL } from '../../patch-dsl/index';
import { compile } from '../../compiler/compile';
import '../../blocks/all';

const hcl = readFileSync(join(__dirname, '../hcl/perspective-camera.hcl'), 'utf-8');

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
