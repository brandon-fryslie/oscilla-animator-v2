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
  exact, wg, domain, texDispatch, domainSource, fsQuadSource, clearTarget, clearTexture,
  depthOnlyTarget,
  OPAQUE, DEPTH_TEST,
} from '../compile';
import { expandManifest } from '../manifest';
import { quad } from '../shapes';

// Ambient declarations — never called, walker parses fn.toString()
declare const $global: any;
declare const $thread: any;
declare const $domains: any;
declare const $vertex: any;
declare function vec4(a: any, b: any, c: any, d: any): any;
declare function vec2i(a: any, b: any): any;
declare function i32(a: any): any;
declare function u32(a: any): any;
declare function textureLoad(textureId: string, coords: any, mipLevel?: any): any;
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

  test('texture specs resolve relative dimensions during manifest expansion', () => {
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
      width: 800,
      height: 600,
      format: 'rgba8unorm',
      usage: ['storage', 'sampled'],
    });
  });

  test('texture mip/sample fields pass through', () => {
    const manifest = expandManifest({
      textures: {
        mip_tex: {
          dimension: '2d',
          width: 256,
          height: 256,
          mipLevelCount: 4,
          sampleCount: 1,
          format: 'rgba8unorm',
          usage: ['render_attachment', 'sampled'],
        },
      },
    });
    expect(manifest.textures.mip_tex).toStrictEqual({
      dimension: '2d',
      width: 256,
      height: 256,
      mipLevelCount: 4,
      sampleCount: 1,
      format: 'rgba8unorm',
      usage: ['render_attachment', 'sampled'],
    });
  });

  test('texture array dimensions pass through', () => {
    const manifest = expandManifest({
      textures: {
        array_tex: {
          dimension: '2d-array',
          width: 64,
          height: 64,
          depthOrArrayLayers: 4,
          format: 'rgba8unorm',
          usage: ['sampled'],
        },
        cube_array_tex: {
          dimension: 'cube-array',
          width: 32,
          height: 32,
          depthOrArrayLayers: 12,
          format: 'rgba8unorm',
          usage: ['sampled'],
        },
      },
    });
    expect(manifest.textures.array_tex.dimension).toBe('2d-array');
    expect(manifest.textures.array_tex.depthOrArrayLayers).toBe(4);
    expect(manifest.textures.cube_array_tex.dimension).toBe('cube-array');
    expect(manifest.textures.cube_array_tex.depthOrArrayLayers).toBe(12);
  });

  test('offscreen render pass sampleCount derives from texture spec', () => {
    const payload = gpu({
      textures: {
        msaa_tex: {
          dimension: '2d',
          width: 256,
          height: 256,
          sampleCount: 4,
          format: 'rgba8unorm',
          usage: ['render_attachment', 'sampled'],
        },
      },
      roster: [
        render('paint_msaa', ortho(), clearTexture('msaa_tex', [0, 0, 0, 1]), [
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
    expect(renderPass.sampleCount).toBe(4);
  });

  test('textureLoad mipLevel passes through', () => {
    const payload = gpu({
      textures: {
        tex: {
          dimension: '2d',
          width: 16,
          height: 16,
          format: 'rgba8unorm',
          usage: ['render_attachment', 'sampled'],
        },
      },
      roster: [
        render('pass', ortho(), clearTarget([0, 0, 0, 1]), [
          draw('fill', fsQuadSource(), OPAQUE, {
            vertex: (position: any) => {
              return vertex(vec4(position.x, position.y, 0.0, 1.0), {});
            },
            fragment: () => {
              return fragment({ color: textureLoad('tex', vec2i(i32(0), i32(0)), i32(2)) });
            },
          }),
        ]),
      ],
    });
    const renderPass = payload.roster.find(e => e.type === 'Render') as RenderPassSpec;
    const returnStmt = renderPass.drawCalls[0].fragmentAst.find(stmt => stmt.type === 'ReturnFragment');
    expect(returnStmt).toBeDefined();
    if (!returnStmt || returnStmt.type !== 'ReturnFragment') throw new Error('ReturnFragment missing');
    expect(returnStmt.outputs.color).toStrictEqual({
      type: 'TextureLoad',
      textureId: 'tex',
      coords: {
        type: 'Construct',
        dataType: 'vec2<i32>',
        args: [
          { type: 'LiteralI32', value: 0 },
          { type: 'LiteralI32', value: 0 },
        ],
      },
      mipLevel: { type: 'LiteralI32', value: 2 },
    });
  });

  test('sampler specs pass through', () => {
    const manifest = expandManifest({
      samplers: {
        linear_sampler: {
          magFilter: 'linear',
          minFilter: 'linear',
          mipmapFilter: 'linear',
          addressModeU: 'repeat',
          addressModeV: 'clamp-to-edge',
          addressModeW: 'mirror-repeat',
          lodMinClamp: 0,
          lodMaxClamp: 4,
          compare: 'less-equal',
          maxAnisotropy: 1,
        },
      },
    });
    expect(manifest.samplers.linear_sampler).toStrictEqual({
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear',
      addressModeU: 'repeat',
      addressModeV: 'clamp-to-edge',
      addressModeW: 'mirror-repeat',
      lodMinClamp: 0,
      lodMaxClamp: 4,
      compare: 'less-equal',
      maxAnisotropy: 1,
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
  test.each([
    'never',
    'less-equal',
    'greater-equal',
    'not-equal',
  ] as const)('extended depth compare %s passes through', (depthCompare) => {
    const state: PipelineStateSpec = {
      blendMode: 'opaque',
      cullMode: 'none',
      depthWrite: true,
      depthCompare,
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
    expect(renderPass.drawCalls[0].pipelineState.depthCompare).toBe(depthCompare);
  });

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

  test('depth bias fields pass through', () => {
    const state: PipelineStateSpec = {
      blendMode: 'opaque',
      cullMode: 'back',
      depthWrite: true,
      depthCompare: 'less-equal',
      depthBias: 2,
      depthBiasSlopeScale: 1.5,
      depthBiasClamp: 0.25,
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

  test('primitive state fields pass through', () => {
    const state: PipelineStateSpec = {
      blendMode: 'opaque',
      cullMode: 'back',
      frontFace: 'cw',
      polygonMode: 'fill',
      unclippedDepth: true,
      depthWrite: false,
      depthCompare: 'always',
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
        { textureId: 'canvas', loadOp: 'clear', clearColor: [0, 0, 0, 1], blendMode: 'opaque', writeMask: ['r', 'g', 'b', 'a'] },
        { textureId: 'tex_albedo', loadOp: 'clear', clearColor: [0, 0, 0, 0], blendMode: 'additive', writeMask: ['r', 'g'] },
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
    expect(renderPass.targets.colors[1].blendMode).toBe('additive');
    expect(renderPass.targets.colors[1].writeMask).toStrictEqual(['r', 'g']);
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

  test('store op passes through on color and depth targets', () => {
    const targets: RenderPassSpec['targets'] = {
      colors: [{ textureId: 'canvas', loadOp: 'clear', storeOp: 'discard', clearColor: [0, 0, 0, 1] }],
      depthStencil: {
        textureId: 'depth_tex',
        depth: { op: 'clear', value: 1.0, storeOp: 'store' },
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
    expect(renderPass.targets.colors[0].storeOp).toBe('discard');
    expect(renderPass.targets.depthStencil?.depth).toStrictEqual({ op: 'clear', value: 1.0, storeOp: 'store' });
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

  test('depth-only pass (zero color attachments)', () => {
    const payload = gpu({
      textures: {
        depth_tex: { dimension: '2d', width: 512, height: 512, format: 'depth24plus', usage: ['render_attachment'] },
      },
      roster: [
        render('depth_prepass', ortho(), depthOnlyTarget('depth_tex'), [
          draw('fill', fsQuadSource(), DEPTH_TEST, {
            vertex: (position: any) => {
              return vertex(vec4(position.x, position.y, 0.5, 1.0), {});
            },
            // No fragment — depth-only pass writes only depth
          }),
        ]),
      ],
    });
    const renderPass = payload.roster.find(
      e => e.type === 'Render' && e.passId === 'depth_prepass',
    ) as RenderPassSpec;
    expect(renderPass).toBeDefined();
    expect(renderPass.targets.colors).toHaveLength(0);
    expect(renderPass.targets.depthStencil).toBeDefined();
    expect(renderPass.targets.depthStencil!.depth).toStrictEqual({ op: 'clear', value: 1.0 });
    // Fragment AST should be empty — no fragment shader for depth-only
    expect(renderPass.drawCalls[0].fragmentAst).toHaveLength(0);
  });

  test('MRT: multiple color attachments', () => {
    const targets: RenderPassSpec['targets'] = {
      colors: [
        { textureId: 'color_tex', loadOp: 'clear', clearColor: [0, 0, 0, 1] },
        { textureId: 'normal_tex', loadOp: 'clear', clearColor: [0.5, 0.5, 1, 1] },
      ],
    };
    const payload = gpu({
      textures: {
        color_tex: { dimension: '2d', width: 512, height: 512, format: 'rgba8unorm', usage: ['render_attachment', 'sampled'] },
        normal_tex: { dimension: '2d', width: 512, height: 512, format: 'rgba8unorm', usage: ['render_attachment', 'sampled'] },
      },
      roster: [
        render('gbuffer', ortho(), targets, [
          draw('fill', fsQuadSource(), OPAQUE, {
            vertex: (position: any) => {
              return vertex(vec4(position.x, position.y, 0.0, 1.0), {});
            },
            fragment: () => {
              // Two outputs — one per color attachment
              return fragment({
                color: vec4(1.0, 0.0, 0.0, 1.0),
                normal: vec4(0.0, 0.0, 1.0, 1.0),
              });
            },
          }),
        ]),
      ],
    });
    const renderPass = payload.roster.find(
      e => e.type === 'Render' && e.passId === 'gbuffer',
    ) as RenderPassSpec;
    expect(renderPass).toBeDefined();
    expect(renderPass.targets.colors).toHaveLength(2);
    // Fragment AST should have a ReturnFragment with both output keys
    const returnFrag = renderPass.drawCalls[0].fragmentAst.find(
      (s: any) => s.type === 'ReturnFragment',
    ) as any;
    expect(returnFrag).toBeDefined();
    expect(Object.keys(returnFrag.outputs).sort()).toStrictEqual(['color', 'normal']);
  });

  test('declared varying metadata passes through', () => {
    const payload = gpu({
      roster: [
        render('varying_meta', ortho(), clearTarget([0, 0, 0, 1]), [
          draw('varying_fill', fsQuadSource(), OPAQUE, {
            varyings: {
              materialId: { type: 'u32', interpolation: 'flat' },
            },
            vertex: (position: any) => {
              return vertex(
                vec4(position.x, position.y, 0.0, 1.0),
                { materialId: $vertex.index / u32(3) },
              );
            },
            fragment: () => {
              return fragment({ color: vec4(1.0, 0.0, 0.0, 1.0) });
            },
          }),
        ]),
      ],
    });
    const renderPass = payload.roster.find(
      e => e.type === 'Render' && e.passId === 'varying_meta',
    ) as RenderPassSpec;
    expect(renderPass.drawCalls[0].varyings).toStrictEqual({
      materialId: { type: 'u32', interpolation: 'flat' },
    });
  });
});
