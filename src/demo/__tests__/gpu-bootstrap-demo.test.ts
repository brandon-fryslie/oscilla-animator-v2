import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { registerAllBlocks } from '../../blocks/all';
import { compile } from '../../compiler/compile';
import { ShapeClass } from '../../shapes/types';
import { deserializePatchFromHCL } from '../../patch-dsl';
import type { StepRender } from '../../compiler/ir/types';
import { GPU_BOOTSTRAP_DEMO_FILENAME } from '../hcl-demos';

registerAllBlocks();

function readBootstrapDemo(): string {
  return readFileSync(join(process.cwd(), 'src', 'demo', 'hcl', GPU_BOOTSTRAP_DEMO_FILENAME), 'utf8');
}

describe('GPU bootstrap demo', () => {
  it('compiles the canonical triangle demo through the Type 1 WebGPU path', () => {
    const parsed = deserializePatchFromHCL(readBootstrapDemo());
    expect(parsed.errors).toEqual([]);

    const result = compile(parsed.patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    expect(result.program.drawPrepProgram.sinks).toHaveLength(1);
    expect(result.program.drawPrepProgram.sinks[0]).toMatchObject({
      shapeClass: ShapeClass.Type1Rigid,
      drawMode: 'nonIndexed',
      instanceCountMode: 'static',
      staticInstanceCount: 1,
    });

    const renderStep = result.program.schedule.steps.find((step): step is StepRender => step.kind === 'render');
    expect(renderStep).toBeDefined();
    expect(renderStep?.shape.k).toBe('slot');
    expect(renderStep?.scale.k).toBe('slot');
    expect(renderStep?.rotationSlot).toBeDefined();
  });
});
