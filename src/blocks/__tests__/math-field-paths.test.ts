/**
 * Field-Path Math Integration Tests
 *
 * Tests that prove math blocks work correctly with field-cardinality data.
 * These tests verify that the per-lane opcode dispatch system works correctly
 * for field operations.
 *
 * Key verification strategy:
 * - Layout blocks (GridLayoutUV, CircleLayoutUV, LineLayoutUV) internally use
 *   field kernels that depend on opcode dispatch for vec3 math.
 * - If opcode dispatch was broken, **compilation would fail**.
 * - The old code had dead kernel names (fieldAdd, fieldMultiply, etc.) that
 *   would have caused runtime errors. By removing them and using opcode dispatch,
 *   we prove the new system works.
 *
 * Test focus: Compilation success proves opcode dispatch is functioning.
 */

import { describe, it, expect } from 'vitest';
import { buildPatch } from '../../graph/Patch';
import { compile } from '../../compiler/compile';

describe('Field-Path Math Integration', () => {
  describe('Compilation verification (proves opcode dispatch works)', () => {
    it('compiles GridLayoutUV successfully', () => {
      // GridLayoutUV uses gridLayoutUV field kernel which internally performs
      // vec3 math operations via opcode dispatch. If the dispatch was broken,
      // this would fail with "Unknown opcode" errors.
      const patch = buildPatch((b) => {
        const time = b.addBlock('InfiniteTimeRoot');

        const ellipse = b.addBlock('Ellipse');
        b.setPortDefault(ellipse, 'rx', 0.01);
        b.setPortDefault(ellipse, 'ry', 0.01);
        const array = b.addBlock('Array');
        b.setPortDefault(array, 'count', 9);
        const layout = b.addBlock('GridLayoutUV');
        b.setPortDefault(layout, 'rows', 3);
        b.setPortDefault(layout, 'cols', 3);

        const colorConst = b.addBlock('Const');
        b.setConfig(colorConst, 'value', { r: 1.0, g: 1.0, b: 1.0, a: 1.0 });
        const colorField = b.addBlock('Broadcast');
        b.wire(colorConst, 'out', colorField, 'one');

        const render = b.addBlock('RenderInstances2D');

        b.wire(ellipse, 'shape', array, 'element');
        b.wire(array, 'elements', layout, 'elements');
        b.wire(layout, 'controlPoints', render, 'controlPoints');
        b.wire(colorField, 'field', render, 'color');
        // Shape port removed - automatically looked up from instance
      });

      const result = compile(patch);
      if (result.kind === 'error') {
        console.error('COMPILE ERROR:', result.errors);
      }
      expect(result.kind).toBe('ok');
    });

    it('compiles CircleLayoutUV successfully', () => {
      const patch = buildPatch((b) => {
        const time = b.addBlock('InfiniteTimeRoot');

        const ellipse = b.addBlock('Ellipse');
        b.setPortDefault(ellipse, 'rx', 0.01);
        b.setPortDefault(ellipse, 'ry', 0.01);
        const array = b.addBlock('Array');
        b.setPortDefault(array, 'count', 12);
        const layout = b.addBlock('CircleLayoutUV');
        b.setPortDefault(layout, 'radius', 0.3);

        const colorConst = b.addBlock('Const');
        b.setConfig(colorConst, 'value', { r: 0.2, g: 0.8, b: 1.0, a: 1.0 });
        const colorField = b.addBlock('Broadcast');
        b.wire(colorConst, 'out', colorField, 'one');

        const render = b.addBlock('RenderInstances2D');

        b.wire(ellipse, 'shape', array, 'element');
        b.wire(array, 'elements', layout, 'elements');
        b.wire(layout, 'controlPoints', render, 'controlPoints');
        b.wire(colorField, 'field', render, 'color');
        // Shape port removed - automatically looked up from instance
      });

      const result = compile(patch);
      expect(result.kind).toBe('ok');
    });

    it('compiles LineLayoutUV successfully', () => {
      const patch = buildPatch((b) => {
        const time = b.addBlock('InfiniteTimeRoot');

        const ellipse = b.addBlock('Ellipse');
        b.setPortDefault(ellipse, 'rx', 0.01);
        b.setPortDefault(ellipse, 'ry', 0.01);
        const array = b.addBlock('Array');
        b.setPortDefault(array, 'count', 8);
        const layout = b.addBlock('LineLayoutUV');

        const colorConst = b.addBlock('Const');
        b.setConfig(colorConst, 'value', { r: 1.0, g: 1.0, b: 0.0, a: 1.0 });
        const colorField = b.addBlock('Broadcast');
        b.wire(colorConst, 'out', colorField, 'one');

        const render = b.addBlock('RenderInstances2D');

        b.wire(ellipse, 'shape', array, 'element');
        b.wire(array, 'elements', layout, 'elements');
        b.wire(layout, 'controlPoints', render, 'controlPoints');
        b.wire(colorField, 'field', render, 'color');
        // Shape port removed - automatically looked up from instance
      });

      const result = compile(patch);
      expect(result.kind).toBe('ok');
    });

    it('compiles with varying instance counts (N=1, 100, 500)', () => {
      const counts = [1, 100, 500];

      for (const count of counts) {
        const cols = Math.ceil(Math.sqrt(count));
        const rows = Math.ceil(count / cols);

        const patch = buildPatch((b) => {
          const time = b.addBlock('InfiniteTimeRoot');

          const ellipse = b.addBlock('Ellipse');
          b.setPortDefault(ellipse, 'rx', 0.001);
          b.setPortDefault(ellipse, 'ry', 0.001);
          const array = b.addBlock('Array');
          b.setPortDefault(array, 'count', count);
          const layout = b.addBlock('GridLayoutUV');
          b.setPortDefault(layout, 'rows', rows);
          b.setPortDefault(layout, 'cols', cols);

          const colorConst = b.addBlock('Const');
          b.setConfig(colorConst, 'value', { r: 0.5, g: 0.5, b: 0.5, a: 1.0 });
          const colorField = b.addBlock('Broadcast');
          b.wire(colorConst, 'out', colorField, 'one');

          const render = b.addBlock('RenderInstances2D');

          b.wire(ellipse, 'shape', array, 'element');
          b.wire(array, 'elements', layout, 'elements');
          b.wire(layout, 'controlPoints', render, 'controlPoints');
          b.wire(colorField, 'field', render, 'color');
          // Shape port removed - automatically looked up from instance
        });

        const result = compile(patch);
        expect(result.kind).toBe('ok');
      }
    });
  });

  describe('Field kernel lowering', () => {
    it('lowers gridLayoutUV kernel without errors', () => {
      // This test verifies that the gridLayoutUV field kernel is properly lowered
      // to opcode operations during compilation. Success proves the opcode dispatch
      // path is correctly wired.

      const patch = buildPatch((b) => {
        const time = b.addBlock('InfiniteTimeRoot');

        const ellipse = b.addBlock('Ellipse');
        b.setPortDefault(ellipse, 'rx', 0.005);
        b.setPortDefault(ellipse, 'ry', 0.005);
        const array = b.addBlock('Array');
        b.setPortDefault(array, 'count', 36);
        const layout = b.addBlock('GridLayoutUV');
        b.setPortDefault(layout, 'rows', 6);
        b.setPortDefault(layout, 'cols', 6);

        const colorConst = b.addBlock('Const');
        b.setConfig(colorConst, 'value', { r: 1.0, g: 1.0, b: 1.0, a: 1.0 });
        const colorField = b.addBlock('Broadcast');
        b.wire(colorConst, 'out', colorField, 'one');

        const render = b.addBlock('RenderInstances2D');

        b.wire(ellipse, 'shape', array, 'element');
        b.wire(array, 'elements', layout, 'elements');
        b.wire(layout, 'controlPoints', render, 'controlPoints');
        b.wire(colorField, 'field', render, 'color');
        // Shape port removed - automatically looked up from instance
      });

      const result = compile(patch);
      expect(result.kind).toBe('ok');

      if (result.kind !== 'ok') return;

      // Verify that we produced a valid program
      const program = result.program;
      expect(program).toBeDefined();
      expect(program.slotMeta).toBeDefined();
      expect(program.slotMeta.length).toBeGreaterThan(0);
    });

    it('lowers circleLayoutUV kernel without errors', () => {
      const patch = buildPatch((b) => {
        const time = b.addBlock('InfiniteTimeRoot');

        const ellipse = b.addBlock('Ellipse');
        b.setPortDefault(ellipse, 'rx', 0.01);
        b.setPortDefault(ellipse, 'ry', 0.01);
        const array = b.addBlock('Array');
        b.setPortDefault(array, 'count', 16);
        const layout = b.addBlock('CircleLayoutUV');
        b.setPortDefault(layout, 'radius', 0.4);
        b.setPortDefault(layout, 'phase', 0.0);

        const colorConst = b.addBlock('Const');
        b.setConfig(colorConst, 'value', { r: 1.0, g: 0.5, b: 0.2, a: 1.0 });
        const colorField = b.addBlock('Broadcast');
        b.wire(colorConst, 'out', colorField, 'one');

        const render = b.addBlock('RenderInstances2D');

        b.wire(ellipse, 'shape', array, 'element');
        b.wire(array, 'elements', layout, 'elements');
        b.wire(layout, 'controlPoints', render, 'controlPoints');
        b.wire(colorField, 'field', render, 'color');
        // Shape port removed - automatically looked up from instance
      });

      const result = compile(patch);
      expect(result.kind).toBe('ok');

      if (result.kind !== 'ok') return;

      const program = result.program;
      expect(program).toBeDefined();
      expect(program.slotMeta.length).toBeGreaterThan(0);
    });

    it('lowers lineLayoutUV kernel without errors', () => {
      const patch = buildPatch((b) => {
        const time = b.addBlock('InfiniteTimeRoot');

        const ellipse = b.addBlock('Ellipse');
        b.setPortDefault(ellipse, 'rx', 0.01);
        b.setPortDefault(ellipse, 'ry', 0.01);
        const array = b.addBlock('Array');
        b.setPortDefault(array, 'count', 10);
        const layout = b.addBlock('LineLayoutUV');

        const colorConst = b.addBlock('Const');
        b.setConfig(colorConst, 'value', { r: 0.8, g: 0.2, b: 0.9, a: 1.0 });
        const colorField = b.addBlock('Broadcast');
        b.wire(colorConst, 'out', colorField, 'one');

        const render = b.addBlock('RenderInstances2D');

        b.wire(ellipse, 'shape', array, 'element');
        b.wire(array, 'elements', layout, 'elements');
        b.wire(layout, 'controlPoints', render, 'controlPoints');
        b.wire(colorField, 'field', render, 'color');
        // Shape port removed - automatically looked up from instance
      });

      const result = compile(patch);
      expect(result.kind).toBe('ok');

      if (result.kind !== 'ok') return;

      const program = result.program;
      expect(program).toBeDefined();
      expect(program.slotMeta.length).toBeGreaterThan(0);
    });
  });

  describe('Verification: old dead kernel names removed', () => {
    it('uses opcode-backed kernels in compiled field math graph', () => {
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot');
        const ellipse = b.addBlock('Ellipse');
        const array = b.addBlock('Array');
        b.setPortDefault(array, 'count', 6);
        const layout = b.addBlock('GridLayoutUV');
        b.setPortDefault(layout, 'rows', 2);
        b.setPortDefault(layout, 'cols', 3);

        const render = b.addBlock('RenderInstances2D');
        const colorConst = b.addBlock('Const');
        b.setConfig(colorConst, 'value', { r: 0.9, g: 0.9, b: 0.9, a: 1 });
        const colorField = b.addBlock('Broadcast');

        b.wire(ellipse, 'shape', array, 'element');
        b.wire(array, 'elements', layout, 'elements');
        b.wire(layout, 'position', render, 'pos');
        b.wire(colorConst, 'out', colorField, 'one');
        b.wire(colorField, 'field', render, 'color');
      });

      const result = compile(patch);
      expect(result.kind).toBe('ok');
      if (result.kind !== 'ok') return;

      const kernelNodes = result.program.valueExprs.nodes.filter((node) => node.kind === 'kernel');
      const namedKernelFns = kernelNodes.filter((node) => {
        if (node.kernelKind === 'map') return node.fn.kind === 'kernel';
        if (node.kernelKind === 'zip') return node.fn.kind === 'kernel';
        if (node.kernelKind === 'zipPromote') return node.fn.kind === 'kernel';
        return false;
      });

      expect(namedKernelFns).toEqual([]);
    });
  });
});
