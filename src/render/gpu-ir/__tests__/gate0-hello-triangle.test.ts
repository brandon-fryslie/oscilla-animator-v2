/**
 * Gate 0: hello-triangle round-trip.
 *
 * DSL-authored fixture must produce a PipelineInstallPayload
 * that deep-equals the hand-written helloTriangle fixture.
 */

import { describe, test, expect } from 'vitest';
import { helloTriangle } from '../../rust/fixtures/hello-triangle';
import { gpu, compute, drawPrep, render, draw, exact, wg } from '../compile';
import { tri as triShape } from '../shapes';

// Ambient declarations for symbols referenced in arrow function source strings.
// These are never called — the walker parses fn.toString(), not executes it.
declare const $global: any;
declare const $scalar: any;
declare const $domains: any;
declare function sin(x: any): any;
declare function u32(x: any): any;
declare function vec4(a: any, b: any, c: any, d: any): any;
declare function vertex(pos: any, varyings: any): any;
declare function fragment(outputs: any): any;

const helloTriangleDSL = gpu({
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:tri_active': { u32: 1 } },
  domains: {
    tri: { capacity: 1, active: 'sys:tri_active', fields: {
      color_r: 'f32', color_g: 'f32', color_b: 'f32',
    }},
  },
  shapes: { unit_triangle: triShape([0.0, 0.5, -0.5, -0.5, 0.5, -0.5]) },

  roster: [
    compute('eval_color', exact(1), wg(1), () => {
      const time = $global.time;
      $domains.tri.color_r[0] = sin(time) * 0.5 + 0.5;
      $domains.tri.color_g[0] = sin(time + 2.094) * 0.5 + 0.5;
      $domains.tri.color_b[0] = sin(time + 4.189) * 0.5 + 0.5;
      $domains.tri.$active = u32(1);
    }),
    drawPrep('prep_tri', 'sys:tri_active', 3),
    render('draw', { clear: [0, 0, 0, 1] }, [
      draw('tri_fill', 'tri', 'unit_triangle', {}, {
        vertex: (position: any) => {
          return vertex(vec4(position.x, position.y, 0.0, 1.0), {});
        },
        fragment: () => {
          const r = $domains.tri.color_r[0];
          const g = $domains.tri.color_g[0];
          const b = $domains.tri.color_b[0];
          return fragment({ color: vec4(r, g, b, 1.0) });
        },
      }),
    ]),
  ],
});

describe('GPU-IR DSL', () => {
  test('Gate 0: hello-triangle round-trip', () => {
    expect(helloTriangleDSL).toStrictEqual(helloTriangle);
  });
});
