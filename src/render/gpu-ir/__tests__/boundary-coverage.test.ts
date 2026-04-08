/**
 * Boundary-coverage tests: exercise boundary-contract variants
 * NOT covered by existing fixtures.
 *
 * Each test verifies that compile.ts correctly passes through
 * a specific boundary-contract type variant end-to-end.
 */

import { describe, test, expect } from 'vitest';
import type {
  ComputePassSpec, RenderPassSpec, DrawCallSpec, PipelineStateSpec,
} from '../../rust/boundary-contract';
import {
  gpu, compute, render, draw, drawPrep, ortho,
  exact, wg, domain, texDispatch, domainSource, fsQuadSource, clearTarget,
  OPAQUE,
} from '../compile';
import { expandManifest } from '../manifest';
import { quad } from '../shapes';

// Ambient declarations — never called, walker parses fn.toString()
declare const $global: any;
declare const $thread: any;
declare const $domains: any;
declare function vec4(a: any, b: any, c: any, d: any): any;
declare function vertex(pos: any, varyings: any): any;
declare function fragment(outputs: any): any;

// Use OPAQUE from compile.ts where tests don't care about specific state

// ---------------------------------------------------------------------------
// Manifest coverage
// ---------------------------------------------------------------------------

describe('manifest coverage', () => {
  test('preserveStateOnRecompile is passed through', () => {
    const manifest = expandManifest({ preserveStateOnRecompile: true });
    expect(manifest.preserveStateOnRecompile).toBe(true);
  });

  test('preserveStateOnRecompile defaults to false', () => {
    const manifest = expandManifest({});
    expect(manifest.preserveStateOnRecompile).toBe(false);
  });

  test('texture specs pass through', () => {
    const manifest = expandManifest({
      textures: {
        tex_color: {
          dimension: '2d',
          width: { relativeTo: 'canvas', scale: 1 },
          height: { relativeTo: 'canvas', scale: 1 },
          format: 'rgba8unorm',
          usage: ['storage', 'sampled'],
        },
      },
    });
    expect(manifest.textures.tex_color).toStrictEqual({
      dimension: '2d',
      width: { relativeTo: 'canvas', scale: 1 },
      height: { relativeTo: 'canvas', scale: 1 },
      format: 'rgba8unorm',
      usage: ['storage', 'sampled'],
    });
  });

  test('sampler specs pass through', () => {
    const manifest = expandManifest({
      samplers: {
        linear_sampler: {
          magFilter: 'linear',
          minFilter: 'linear',
          addressModeU: 'repeat',
          addressModeV: 'clamp-to-edge',
        },
      },
    });
    expect(manifest.samplers.linear_sampler).toStrictEqual({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'repeat',
      addressModeV: 'clamp-to-edge',
    });
  });

  test('atomic field types in domains', () => {
    const manifest = expandManifest({
      domains: {
        grid: {
          capacity: 100,
          active: 'sys:active',
          fields: { cell: { 'atomic<u32>': 0 } },
        },
      },
      scalars: { 'sys:active': { u32: 100 } },
    });
    expect(manifest.domains.grid.fields.cell).toStrictEqual({
      type: 'atomic<u32>', clearValue: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// Dispatch mode coverage
// ---------------------------------------------------------------------------

describe('dispatch mode coverage', () => {
  test('Exact dispatch via helper', () => {
    const payload = gpu({
      roster: [
        compute('pass', exact(4, 2, 1), wg(64), () => {}),
      ],
    });
    const pass = payload.roster[0] as ComputePassSpec;
    expect(pass.dispatch).toStrictEqual({ mode: 'Exact', x: 4, y: 2, z: 1 });
    expect(pass.workgroupSize).toStrictEqual([64, 1, 1]);
  });

  test('Exact dispatch via object literal', () => {
    const payload = gpu({
      roster: [
        compute('pass', { mode: 'Exact', x: 8, y: 4, z: 2 }, [32, 1, 1], () => {}),
      ],
    });
    const pass = payload.roster[0] as ComputePassSpec;
    expect(pass.dispatch).toStrictEqual({ mode: 'Exact', x: 8, y: 4, z: 2 });
    expect(pass.workgroupSize).toStrictEqual([32, 1, 1]);
  });

  test('Domain dispatch via helper', () => {
    const payload = gpu({
      scalars: { 'sys:active': { u32: 64 } },
      domains: {
        dots: { capacity: 64, active: 'sys:active', fields: { x: 'f32' } },
      },
      roster: [
        compute('pass', domain('dots'), wg(64), () => {}),
      ],
    });
    const pass = payload.roster[0] as ComputePassSpec;
    expect(pass.dispatch).toStrictEqual({ mode: 'Domain', domainId: 'dots' });
  });

  test('Texture dispatch via helper', () => {
    const payload = gpu({
      textures: {
        tex: { dimension: '2d', width: 256, height: 256, format: 'rgba8unorm', usage: ['storage'] },
      },
      roster: [
        compute('pass', texDispatch('tex'), wg(8, 8), () => {}),
      ],
    });
    const pass = payload.roster[0] as ComputePassSpec;
    expect(pass.dispatch).toStrictEqual({ mode: 'Texture', textureId: 'tex' });
  });
});

// ---------------------------------------------------------------------------
// Draw source coverage
// ---------------------------------------------------------------------------

describe('draw source coverage', () => {
  test('FullScreenQuad source via helper', () => {
    const payload = gpu({

      roster: [
        render('pass', ortho(), clearTarget([0, 0, 0, 1]), [
          draw('fill', fsQuadSource(), OPAQUE, {
            vertex: (position: any) => {
              return vertex(vec4(position.x, position.y, 0.0, 1.0), {});
            },
            fragment: () => {
              return fragment({ color: vec4(1.0, 0.0, 0.0, 1.0) });
            },
          }),
        ]),
      ],
    });
    const renderPass = payload.roster.find(e => e.type === 'Render') as RenderPassSpec;
    expect(renderPass.drawCalls[0].source).toStrictEqual({ type: 'FullScreenQuad' });
  });

  test('Domain source with non-Topology sourceKind', () => {
    const payload = gpu({

      scalars: { 'sys:active': { u32: 1 } },
      domains: {
        pts: { capacity: 1, active: 'sys:active', fields: { x: 'f32' } },
      },
      shapes: { unit_quad: quad(0.03) },
      roster: [
        drawPrep('prep', 'sys:active', 6),
        render('pass', ortho(), clearTarget([0, 0, 0, 1]), [
          draw('fill',
            domainSource('pts', 'unit_quad', 'Parametric'),
            OPAQUE,
            {
              vertex: (position: any) => {
                return vertex(vec4(position.x, position.y, 0.0, 1.0), {});
              },
              fragment: () => {
                return fragment({ color: vec4(1.0, 0.0, 0.0, 1.0) });
              },
            },
          ),
        ]),
      ],
    });
    const renderPass = payload.roster.find(e => e.type === 'Render') as RenderPassSpec;
    const src = renderPass.drawCalls[0].source;
    expect(src).toStrictEqual({ type: 'Domain', domainId: 'pts', sourceKind: 'Parametric', shapeId: 'unit_quad' });
  });
});

// ---------------------------------------------------------------------------
// Pipeline state coverage
// ---------------------------------------------------------------------------

describe('pipeline state coverage', () => {
  test('non-default blend, cull, depth', () => {
    const state: PipelineStateSpec = {
      blendMode: 'alpha',
      cullMode: 'back',
      depthWrite: true,
      depthCompare: 'less',
    };
    const payload = gpu({

      roster: [
        render('pass', ortho(), clearTarget([0, 0, 0, 1]), [
          draw('fill', fsQuadSource(), state, {
            vertex: (position: any) => {
              return vertex(vec4(position.x, position.y, 0.0, 1.0), {});
            },
            fragment: () => {
              return fragment({ color: vec4(1.0, 0.0, 0.0, 1.0) });
            },
          }),
        ]),
      ],
    });
    const renderPass = payload.roster.find(e => e.type === 'Render') as RenderPassSpec;
    expect(renderPass.drawCalls[0].pipelineState).toStrictEqual(state);
  });

  test('stencil state passes through', () => {
    const state: PipelineStateSpec = {
      blendMode: 'opaque',
      cullMode: 'none',
      depthWrite: true,
      depthCompare: 'less',
      stencilReadMask: 0xFF,
      stencilWriteMask: 0xFF,
      stencilFront: {
        compare: 'always',
        failOp: 'keep',
        depthFailOp: 'keep',
        passOp: 'replace',
      },
      stencilBack: {
        compare: 'always',
        failOp: 'keep',
        depthFailOp: 'keep',
        passOp: 'keep',
      },
    };
    const payload = gpu({

      roster: [
        render('pass', ortho(), clearTarget([0, 0, 0, 1]), [
          draw('fill', fsQuadSource(), state, {
            vertex: (position: any) => {
              return vertex(vec4(position.x, position.y, 0.0, 1.0), {});
            },
            fragment: () => {
              return fragment({ color: vec4(1.0, 0.0, 0.0, 1.0) });
            },
          }),
        ]),
      ],
    });
    const renderPass = payload.roster.find(e => e.type === 'Render') as RenderPassSpec;
    expect(renderPass.drawCalls[0].pipelineState).toStrictEqual(state);
  });
});

// ---------------------------------------------------------------------------
// Render target coverage
// ---------------------------------------------------------------------------

describe('render target coverage', () => {
  test('multiple color targets', () => {
    const targets: RenderPassSpec['targets'] = {
      colors: [
        { textureId: 'canvas', loadOp: 'clear', clearColor: [0, 0, 0, 1] },
        { textureId: 'tex_albedo', loadOp: 'clear', clearColor: [0, 0, 0, 0] },
      ],
    };
    const payload = gpu({

      textures: {
        tex_albedo: { dimension: '2d', width: 512, height: 512, format: 'rgba8unorm', usage: ['render_attachment'] },
      },
      roster: [
        render('pass', ortho(), targets, [
          draw('fill', fsQuadSource(), OPAQUE, {
            vertex: (position: any) => {
              return vertex(vec4(position.x, position.y, 0.0, 1.0), {});
            },
            fragment: () => {
              return fragment({ color: vec4(1.0, 0.0, 0.0, 1.0) });
            },
          }),
        ]),
      ],
    });
    const renderPass = payload.roster.find(e => e.type === 'Render') as RenderPassSpec;
    expect(renderPass.targets.colors).toHaveLength(2);
    expect(renderPass.targets.colors[1].textureId).toBe('tex_albedo');
  });

  test('load op (no clear)', () => {
    const targets: RenderPassSpec['targets'] = {
      colors: [{ textureId: 'canvas', loadOp: 'load' }],
    };
    const payload = gpu({

      roster: [
        render('pass', ortho(), targets, [
          draw('fill', fsQuadSource(), OPAQUE, {
            vertex: (position: any) => {
              return vertex(vec4(position.x, position.y, 0.0, 1.0), {});
            },
            fragment: () => {
              return fragment({ color: vec4(1.0, 0.0, 0.0, 1.0) });
            },
          }),
        ]),
      ],
    });
    const renderPass = payload.roster.find(e => e.type === 'Render') as RenderPassSpec;
    expect(renderPass.targets.colors[0].loadOp).toBe('load');
    expect(renderPass.targets.colors[0].clearColor).toBeUndefined();
  });

  test('depth/stencil target', () => {
    const targets: RenderPassSpec['targets'] = {
      colors: [{ textureId: 'canvas', loadOp: 'clear', clearColor: [0, 0, 0, 1] }],
      depthStencil: {
        textureId: 'depth_tex',
        depth: { op: 'clear', value: 1.0 },
      },
    };
    const payload = gpu({

      textures: {
        depth_tex: { dimension: '2d', width: 512, height: 512, format: 'depth24plus', usage: ['render_attachment'] },
      },
      roster: [
        render('pass', ortho(), targets, [
          draw('fill', fsQuadSource(), OPAQUE, {
            vertex: (position: any) => {
              return vertex(vec4(position.x, position.y, 0.0, 1.0), {});
            },
            fragment: () => {
              return fragment({ color: vec4(1.0, 0.0, 0.0, 1.0) });
            },
          }),
        ]),
      ],
    });
    const renderPass = payload.roster.find(e => e.type === 'Render') as RenderPassSpec;
    expect(renderPass.targets.depthStencil).toStrictEqual({
      textureId: 'depth_tex',
      depth: { op: 'clear', value: 1.0 },
    });
  });
});
