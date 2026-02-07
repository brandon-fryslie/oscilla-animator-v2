/**
 * Tests for exprToBlock mapping in DebugIndexIR.
 *
 * Verifies that compiled programs track which block emitted each ValueExpr,
 * enabling provenance tracing from expressions back to source blocks.
 */

import { describe, it, expect } from 'vitest';
import { buildPatch } from '../../graph';
import { compile } from '../compile';

/**
 * Helper: compile a patch and assert success.
 */
function compileOk(patch: ReturnType<typeof buildPatch>) {
  const result = compile(patch);
  if (result.kind === 'error') {
    throw new Error(
      `Compilation failed:\n${result.errors.map((e) => `  [${e.kind}] ${e.message}`).join('\n')}`
    );
  }
  return result.program;
}

describe('exprToBlock mapping', () => {
  it('populates exprToBlock for a simple patch', () => {
    // Build a minimal patch: TimeRoot + Ellipse + Array + GridLayout + Render
    const patch = buildPatch((b) => {
      const time = b.addBlock('InfiniteTimeRoot');
      b.setPortDefault(time, 'periodAMs', 1000);

      const ellipse = b.addBlock('Ellipse');
      b.setPortDefault(ellipse, 'rx', 0.03);
      b.setPortDefault(ellipse, 'ry', 0.03);

      const array = b.addBlock('Array');
      b.setPortDefault(array, 'count', 4);

      const layout = b.addBlock('GridLayoutUV');
      b.setPortDefault(layout, 'rows', 2);
      b.setPortDefault(layout, 'cols', 2);

      const colorSig = b.addBlock('Const');
      b.setConfig(colorSig, 'value', { r: 1, g: 0.5, b: 0.2, a: 1 });
      const colorField = b.addBlock('Broadcast');

      const render = b.addBlock('RenderInstances2D');

      b.wire(ellipse, 'shape', array, 'element');
      b.wire(array, 'elements', layout, 'elements');
      b.wire(colorSig, 'out', colorField, 'signal');
      b.wire(layout, 'position', render, 'pos');
      b.wire(colorField, 'field', render, 'color');
    });

    const program = compileOk(patch);

    // exprToBlock must exist and be populated
    expect(program.debugIndex.exprToBlock).toBeDefined();
    expect(program.debugIndex.exprToBlock.size).toBeGreaterThan(0);
  });

  it('maps expressions to valid block IDs in blockMap', () => {
    const patch = buildPatch((b) => {
      const time = b.addBlock('InfiniteTimeRoot');
      b.setPortDefault(time, 'periodAMs', 1000);

      const ellipse = b.addBlock('Ellipse');
      b.setPortDefault(ellipse, 'rx', 0.03);
      b.setPortDefault(ellipse, 'ry', 0.03);

      const array = b.addBlock('Array');
      b.setPortDefault(array, 'count', 4);

      const layout = b.addBlock('GridLayoutUV');
      b.setPortDefault(layout, 'rows', 2);
      b.setPortDefault(layout, 'cols', 2);

      const colorSig = b.addBlock('Const');
      b.setConfig(colorSig, 'value', { r: 1, g: 0.5, b: 0.2, a: 1 });
      const colorField = b.addBlock('Broadcast');

      const render = b.addBlock('RenderInstances2D');

      b.wire(ellipse, 'shape', array, 'element');
      b.wire(array, 'elements', layout, 'elements');
      b.wire(colorSig, 'out', colorField, 'signal');
      b.wire(layout, 'position', render, 'pos');
      b.wire(colorField, 'field', render, 'color');
    });

    const program = compileOk(patch);

    // Collect all string IDs known to blockMap
    const validStringIds = new Set(program.debugIndex.blockMap.values());

    // Every BlockId in exprToBlock must appear as a value in blockMap
    for (const [_exprId, blockId] of program.debugIndex.exprToBlock) {
      // blockId is a string block ID (like "block_0"), which should be in blockMap values
      const asString = blockId as string;
      expect(validStringIds.has(asString)).toBe(true);
    }
  });

  it('covers a significant portion of valueExprs', () => {
    const patch = buildPatch((b) => {
      const time = b.addBlock('InfiniteTimeRoot');
      b.setPortDefault(time, 'periodAMs', 1000);

      const ellipse = b.addBlock('Ellipse');
      b.setPortDefault(ellipse, 'rx', 0.03);
      b.setPortDefault(ellipse, 'ry', 0.03);

      const array = b.addBlock('Array');
      b.setPortDefault(array, 'count', 4);

      const layout = b.addBlock('GridLayoutUV');
      b.setPortDefault(layout, 'rows', 2);
      b.setPortDefault(layout, 'cols', 2);

      const colorSig = b.addBlock('Const');
      b.setConfig(colorSig, 'value', { r: 1, g: 0.5, b: 0.2, a: 1 });
      const colorField = b.addBlock('Broadcast');

      const render = b.addBlock('RenderInstances2D');

      b.wire(ellipse, 'shape', array, 'element');
      b.wire(array, 'elements', layout, 'elements');
      b.wire(colorSig, 'out', colorField, 'signal');
      b.wire(layout, 'position', render, 'pos');
      b.wire(colorField, 'field', render, 'color');
    });

    const program = compileOk(patch);

    const totalExprs = program.valueExprs.nodes.length;
    const mappedExprs = program.debugIndex.exprToBlock.size;

    // At least some expressions should be mapped.
    // Not all expressions get mapped because the dedup cache in pushExpr
    // may return an existing ID without re-recording the block context.
    // But block-emitted expressions should form the majority.
    expect(mappedExprs).toBeGreaterThan(0);
    expect(mappedExprs / totalExprs).toBeGreaterThan(0.3);
  });

  it('maps multiple blocks to different expressions', () => {
    const patch = buildPatch((b) => {
      const time = b.addBlock('InfiniteTimeRoot');
      b.setPortDefault(time, 'periodAMs', 1000);

      const constA = b.addBlock('Const');
      b.setConfig(constA, 'value', 1);
      const constB = b.addBlock('Const');
      b.setConfig(constB, 'value', 2);

      const add = b.addBlock('Add');
      b.wire(constA, 'out', add, 'a');
      b.wire(constB, 'out', add, 'b');
    });

    const program = compileOk(patch);

    // Collect unique block IDs from the mapping
    const uniqueBlocks = new Set(program.debugIndex.exprToBlock.values());

    // Multiple blocks should appear in the mapping
    expect(uniqueBlocks.size).toBeGreaterThan(1);
  });
});

describe('exprProvenance mapping', () => {
  it('populates exprProvenance for a patch with default sources', () => {
    // Array's "count" input has a default source (Const block).
    // When unconnected, normalization creates a derived block _ds_<blockId>_count.
    // The provenance map should resolve that derived block back to the Array block's "count" port.
    const patch = buildPatch((b) => {
      const time = b.addBlock('InfiniteTimeRoot');
      b.setPortDefault(time, 'periodAMs', 1000);

      const ellipse = b.addBlock('Ellipse');
      b.setPortDefault(ellipse, 'rx', 0.03);
      b.setPortDefault(ellipse, 'ry', 0.03);

      const array = b.addBlock('Array');
      b.setPortDefault(array, 'count', 4);
      // count input is NOT wired — triggers default source materialization

      const layout = b.addBlock('GridLayoutUV');
      b.setPortDefault(layout, 'rows', 2);
      b.setPortDefault(layout, 'cols', 2);

      const colorSig = b.addBlock('Const');
      b.setConfig(colorSig, 'value', { r: 1, g: 0.5, b: 0.2, a: 1 });
      const colorField = b.addBlock('Broadcast');

      const render = b.addBlock('RenderInstances2D');

      b.wire(ellipse, 'shape', array, 'element');
      b.wire(array, 'elements', layout, 'elements');
      b.wire(colorSig, 'out', colorField, 'signal');
      b.wire(layout, 'position', render, 'pos');
      b.wire(colorField, 'field', render, 'color');
    });

    const program = compileOk(patch);

    // exprProvenance must exist and be populated
    expect(program.debugIndex.exprProvenance).toBeDefined();
    expect(program.debugIndex.exprProvenance!.size).toBeGreaterThan(0);
  });

  it('resolves default source derived blocks to user-visible targets', () => {
    const patch = buildPatch((b) => {
      const time = b.addBlock('InfiniteTimeRoot');
      b.setPortDefault(time, 'periodAMs', 1000);

      const ellipse = b.addBlock('Ellipse');
      b.setPortDefault(ellipse, 'rx', 0.03);
      b.setPortDefault(ellipse, 'ry', 0.03);

      const array = b.addBlock('Array');
      b.setPortDefault(array, 'count', 4);

      const layout = b.addBlock('GridLayoutUV');
      b.setPortDefault(layout, 'rows', 2);
      b.setPortDefault(layout, 'cols', 2);

      const colorSig = b.addBlock('Const');
      b.setConfig(colorSig, 'value', { r: 1, g: 0.5, b: 0.2, a: 1 });
      const colorField = b.addBlock('Broadcast');

      const render = b.addBlock('RenderInstances2D');

      b.wire(ellipse, 'shape', array, 'element');
      b.wire(array, 'elements', layout, 'elements');
      b.wire(colorSig, 'out', colorField, 'signal');
      b.wire(layout, 'position', render, 'pos');
      b.wire(colorField, 'field', render, 'color');
    });

    const program = compileOk(patch);
    const provenance = program.debugIndex.exprProvenance!;

    // Find entries with defaultSource userTarget
    const defaultSourceEntries = [...provenance.values()].filter(
      (p) => p.userTarget?.kind === 'defaultSource'
    );

    // At least one default source should exist (Array's count, etc.)
    expect(defaultSourceEntries.length).toBeGreaterThan(0);

    // Every defaultSource entry should have a valid targetPortName
    for (const entry of defaultSourceEntries) {
      expect(entry.userTarget!.kind).toBe('defaultSource');
      if (entry.userTarget!.kind === 'defaultSource') {
        expect(typeof entry.userTarget!.targetPortName).toBe('string');
        expect(entry.userTarget!.targetPortName.length).toBeGreaterThan(0);
      }
    }
  });

  it('marks user blocks with null userTarget', () => {
    const patch = buildPatch((b) => {
      const time = b.addBlock('InfiniteTimeRoot');
      b.setPortDefault(time, 'periodAMs', 1000);

      const constA = b.addBlock('Const');
      b.setConfig(constA, 'value', 1);
      const constB = b.addBlock('Const');
      b.setConfig(constB, 'value', 2);

      const add = b.addBlock('Add');
      b.wire(constA, 'out', add, 'a');
      b.wire(constB, 'out', add, 'b');
    });

    const program = compileOk(patch);
    const provenance = program.debugIndex.exprProvenance!;

    // User blocks should have null userTarget
    const userEntries = [...provenance.values()].filter(
      (p) => p.userTarget === null
    );
    expect(userEntries.length).toBeGreaterThan(0);
  });
});
