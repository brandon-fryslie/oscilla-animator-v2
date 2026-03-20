import { describe, expect, it } from 'vitest';
import { buildPatch } from '../../graph';
import { compile } from '../compile';
import { createConnectedPatchFragment } from '../partial';

function buildRenderConnectedExpressionPatch(expression: string) {
  return buildPatch((b) => {
    const time = b.addBlock('InfiniteTimeRoot');
    const expr = b.addBlock('Expression');
    b.setConfig(expr, 'expression', expression);
    b.wireCollect(time, 'tMs', expr, 'refs', 't');

    const array = b.addBlock('Array');
    b.setPortDefault(array, 'count', 4);
    const ellipse = b.addBlock('Ellipse');
    b.wire(ellipse, 'shape', array, 'element');
    const grid = b.addBlock('GridLayoutUV');
    b.wire(array, 'elements', grid, 'elements');
    const color = b.addBlock('Const');
    b.setConfig(color, 'value', { r: 1, g: 0, b: 0, a: 1 });
    const render = b.addBlock('RenderInstances2D');
    b.wire(grid, 'controlPoints', render, 'controlPoints');
    b.wire(color, 'out', render, 'color');
    b.wire(expr, 'out', render, 'scale');
  });
}

describe('expression compiler diagnostics', () => {
  it('preserves expression syntax error source spans through full compile', () => {
    const patch = buildRenderConnectedExpressionPatch('1 +');
    const result = compile(patch);

    expect(result.kind).toBe('error');
    if (result.kind !== 'error') {
      return;
    }

    const syntaxError = result.errors.find((error) => error.code === 'ExprSyntaxError');
    expect(syntaxError).toBeDefined();
    expect(syntaxError?.sourceSpan?.kind).toBe('blockParam');
    expect(syntaxError?.sourceSpan?.paramId).toBe('expression');
    expect(syntaxError?.sourceSpan?.range?.start).toBeGreaterThanOrEqual(0);
  });

  it('surfaces expression reassignment warnings through full compile', () => {
    const patch = buildRenderConnectedExpressionPatch('x = t\nx = t * 2\nx');
    const result = compile(patch);

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') {
      return;
    }

    const warning = result.warnings.find((entry) => entry.code === 'W_EXPR_VAR_REASSIGNED');
    expect(warning).toBeDefined();
    expect(warning?.sourceSpan?.kind).toBe('blockParam');
    expect(warning?.sourceSpan?.range?.start).toBeLessThan(warning?.sourceSpan?.range?.end ?? 0);
  });

  it('keeps downstream consumers in the connected fragment used for editor partial compile', () => {
    const patch = buildRenderConnectedExpressionPatch('t');
    const exprBlockId = Array.from(patch.blocks.values()).find((block) => block.type === 'Expression')!.id;
    const fragment = createConnectedPatchFragment(patch, [exprBlockId], [
      { blockId: exprBlockId, params: { expression: 't * 2' } },
    ]);

    const fragmentTypes = Array.from(fragment.blocks.values()).map((block) => block.type);
    expect(fragmentTypes).toContain('Expression');
    expect(fragmentTypes).toContain('RenderInstances2D');
    expect(fragmentTypes).toContain('InfiniteTimeRoot');
  });
});
