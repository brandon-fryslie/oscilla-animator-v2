import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { buildPatch } from '../../graph';
import { compile } from '../compile';
import { requireInst } from '../../core/canonical-types';

function rg(pattern: string, scope: readonly string[], globs: readonly string[] = ['*.ts', '*.tsx']): string[] {
  try {
    const out = execFileSync(
      'rg',
      [
        '-n',
        '--no-heading',
        '--color',
        'never',
        ...globs.flatMap((glob) => ['--glob', glob]),
        pattern,
        ...scope,
      ],
      { encoding: 'utf8', cwd: process.cwd() },
    ).trim();
    return out ? out.split('\n').filter(Boolean) : [];
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 1) return [];
    throw error;
  }
}

function compileRenderProgram() {
  const patch = buildPatch((b) => {
    b.addBlock('InfiniteTimeRoot');

    const ellipse = b.addBlock('Ellipse');
    b.setPortDefault(ellipse, 'rx', 0.03);
    b.setPortDefault(ellipse, 'ry', 0.03);

    const array = b.addBlock('Array');
    b.setPortDefault(array, 'count', 12);

    const layout = b.addBlock('GridLayoutUV');
    b.setPortDefault(layout, 'rows', 3);
    b.setPortDefault(layout, 'cols', 4);

    const color = b.addBlock('Const');
    b.setConfig(color, 'value', { r: 0.2, g: 0.7, b: 0.9, a: 1.0 });
    const colorField = b.addBlock('Broadcast');
    b.wire(color, 'out', colorField, 'one');

    const render = b.addBlock('RenderInstances2D');
    b.wire(ellipse, 'shape', array, 'element');
    b.wire(array, 'elements', layout, 'elements');
    b.wire(layout, 'controlPoints', render, 'controlPoints');
    b.wire(colorField, 'field', render, 'color');
  });

  const result = compile(patch);
  if (result.kind !== 'ok') {
    throw new Error(result.errors.map((error) => `[${error.code}] ${error.message}`).join('\n'));
  }
  return result.program;
}

describe('no-legacy-types gate', () => {
  it('forbids production references to legacy expression aliases', () => {
    const matches = rg('\\b(SigExpr|FieldExpr|EventExpr|SigExprId|FieldExprId|EventExprId)\\b', ['src'], [
      '*.ts',
      '*.tsx',
      '!**/*.test.*',
      '!**/__tests__/**',
    ]);
    expect(matches).toEqual([]);
  });

  it('forbids production deriveKind() dispatch remnants', () => {
    const matches = rg('\\bderiveKind\\(', ['src'], [
      '*.ts',
      '*.tsx',
      '!**/*.test.*',
      '!**/__tests__/**',
    ]);
    expect(matches).toEqual([]);
  });

  it('enforces numeric-only runtime storage contract and SoA render lanes', () => {
    const program = compileRenderProgram();

    // [LAW:one-source-of-truth] Runtime slot ABI is numeric-only for the
    // compiler/runtime contract; no legacy object-shaped storage classes.
    expect(program.runtimeSlots.every((slot) => slot.storage === 'f32' || slot.storage === 'i32' || slot.storage === 'u32')).toBe(true);
    expect(program.slotMeta.every((slot) => slot.storage === 'f32' || slot.storage === 'i32' || slot.storage === 'u32')).toBe(true);

    for (const slot of program.runtimeSlots) {
      expect(slot.type.payload.kind).not.toBe('object');
    }

    // [LAW:dataflow-not-control-flow] Channel separation is canonical: either
    // slots are scalarized (stride=1) or explicitly SoA-packed.
    const nonSoaMultiComponentSlots = program.runtimeSlots.filter(
      (slot) =>
        requireInst(slot.type.extent.cardinality, 'cardinality').kind === 'many' &&
        slot.arena.stride > 1 &&
        slot.arena.packing !== 'soa',
    );
    expect(nonSoaMultiComponentSlots).toEqual([]);
  });
});
