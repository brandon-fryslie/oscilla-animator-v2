import { describe, it, expect } from 'vitest';
import { buildPatch } from '../../graph/Patch';
import { compile } from '../compile';
import { requireInst } from '../../core/canonical-types';
import type { ValueExpr } from '../ir/value-expr';

function cardKind(expr: ValueExpr): 'zero' | 'one' | 'many' {
  return requireInst(expr.type.extent.cardinality, 'cardinality').kind;
}

describe('ValueExpr cardinality invariants', () => {
  it('kernel/map/zip cardinality matches field inputs', () => {
    const patch = buildPatch((b) => {
      const time = b.addBlock('InfiniteTimeRoot');

      const ellipse = b.addBlock('Ellipse');
      b.setPortDefault(ellipse, 'rx', 0.03);
      b.setPortDefault(ellipse, 'ry', 0.03);

      const array = b.addBlock('Array');
      b.setPortDefault(array, 'count', 4);
      b.wire(ellipse, 'shape', array, 'element');

      const normalize = b.addBlock('Lens_NormalizeRange');

      const minSig = b.addBlock('Const');
      b.setConfig(minSig, 'value', 0.0);
      const maxSig = b.addBlock('Const');
      b.setConfig(maxSig, 'value', 1.0);

      // Field input to NormalizeRange (this historically produced kernelZip nodes typed as signal).
      // Route through Mask using a TIME signal to ensure we don't accidentally
      // materialize time as a field via kernelZip (must broadcast / zipSig instead).
      const mask = b.addBlock('Mask');
      b.wire(array, 't', mask, 'in');
      b.wire(time, 'tMs', mask, 'mask');
      b.wire(mask, 'out', normalize, 'in');
      b.wire(minSig, 'out', normalize, 'min');
      b.wire(maxSig, 'out', normalize, 'max');

      // Use the result in the render pipeline so it can't be pruned.
      const construct = b.addBlock('Construct');
      b.wire(normalize, 'out', construct, 'x');
      b.wire(array, 't', construct, 'y');
      const zSig = b.addBlock('Const');
      b.setConfig(zSig, 'value', 0.0);
      b.wire(zSig, 'out', construct, 'z');

      const colorSig = b.addBlock('Const');
      b.setConfig(colorSig, 'value', { r: 1, g: 0.5, b: 0.2, a: 1 });
      const colorField = b.addBlock('Broadcast');
      b.wire(colorSig, 'out', colorField, 'signal');

      const render = b.addBlock('RenderInstances2D');
      b.wire(construct, 'out', render, 'pos');
      b.wire(colorField, 'field', render, 'color');
    });

    const result = compile(patch);
    if (result.kind === 'error') {
      // Print errors for debugging since this test is asserting a compile-time invariant.
      console.error(result.errors);
    }
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const nodes = result.program.valueExprs.nodes;

    for (let i = 0; i < nodes.length; i++) {
      const expr = nodes[i];
      if (!expr) continue;

      if (expr.kind === 'intrinsic') {
        expect(cardKind(expr)).toBe('many');
        continue;
      }

      if (expr.kind !== 'kernel') continue;

      const out = cardKind(expr);

      switch (expr.kernelKind) {
        case 'map': {
          const input = cardKind(nodes[expr.input as number]);
          if (out === 'many') expect(input).toBe('many');
          if (out !== 'many') expect(input).not.toBe('many');
          break;
        }
        case 'zip': {
          const anyMany = expr.inputs.some((id) => cardKind(nodes[id as number]) === 'many');
          if (out === 'many') {
            // runtime materialization for zip() requires all inputs be fields
            expect(anyMany).toBe(true);
            for (const id of expr.inputs) {
              expect(cardKind(nodes[id as number])).toBe('many');
            }
          } else {
            // zip() in signal evaluation must not consume fields
            expect(anyMany).toBe(false);
          }
          break;
        }
        case 'broadcast': {
          expect(out).toBe('many');
          expect(cardKind(nodes[expr.signal as number])).not.toBe('many');
          break;
        }
        case 'zipSig': {
          expect(out).toBe('many');
          expect(cardKind(nodes[expr.field as number])).toBe('many');
          for (const id of expr.signals) {
            expect(cardKind(nodes[id as number])).not.toBe('many');
          }
          break;
        }
        case 'reduce': {
          expect(out).toBe('one');
          expect(cardKind(nodes[expr.field as number])).toBe('many');
          break;
        }
        case 'pathDerivative': {
          expect(out).toBe('many');
          expect(cardKind(nodes[expr.field as number])).toBe('many');
          break;
        }
        default: {
          const _exhaustive: never = expr;
          void _exhaustive;
        }
      }
    }
  });
});
