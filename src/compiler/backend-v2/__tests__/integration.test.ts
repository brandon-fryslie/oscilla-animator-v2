/**
 * C1 Compiler Backend — Integration Test
 *
 * End-to-end: spinning-ring fixture → compileC1FromNormalized → PipelineInstallPayload
 * Validates the output against the Zod schema from boundary-contract.ts.
 */

import { describe, it, expect } from 'vitest';
import { compileC1FromNormalized } from '../index';
import { makeSpinningRingPatch } from '../../../compiler-tester/fixtures/spinning-ring';
import { makeDynamicRingPatch } from '../../../compiler-tester/fixtures/dynamic-ring';
import { PipelineInstallPayloadSchema } from '../../../render/rust/boundary-contract';

describe('C1 integration: spinning-ring fixture', () => {
  it('produces a valid PipelineInstallPayload', () => {
    const patch = makeSpinningRingPatch();
    const result = compileC1FromNormalized(patch);

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    // Zod validation (includes semantic validation: symbolId references, etc.)
    const parseResult = PipelineInstallPayloadSchema.safeParse(result.payload);
    if (!parseResult.success) {
      console.error('Zod validation errors:', JSON.stringify(parseResult.error.issues, null, 2));
    }
    expect(parseResult.success).toBe(true);
  });

  it('manifest contains expected resources', () => {
    const patch = makeSpinningRingPatch();
    const result = compileC1FromNormalized(patch);
    if (result.kind !== 'ok') throw new Error(result.errors.join('; '));

    const { manifest } = result.payload;

    // Globals
    expect(manifest.globals['sys:time']).toBeDefined();
    expect(manifest.globals['sys:time'].type).toBe('f32');
    expect(manifest.globals['sys:time'].isDynamic).toBe(true);

    expect(manifest.globals['sys:camera']).toBeDefined();
    expect(manifest.globals['sys:camera'].type).toBe('mat4x4');

    // Arena scalars
    expect(manifest.arenaScalars['dots:active']).toBeDefined();
    expect(manifest.arenaScalars['dots:active'].type).toBe('u32');

    // Domain
    expect(manifest.domains['dots']).toBeDefined();
    expect(manifest.domains['dots'].capacity).toBe(64);
    expect(manifest.domains['dots'].fields['pos_x']).toBeDefined();
    expect(manifest.domains['dots'].fields['pos_y']).toBeDefined();
    expect(manifest.domains['dots'].fields['color_r']).toBeDefined();

    // Shape bank
    expect(manifest.shapeBank['dots_quad']).toBeDefined();
    expect(manifest.shapeBank['dots_quad'].topology).toBe('triangle-list');
  });

  it('roster contains compute + drawPrep + render passes in correct order', () => {
    const patch = makeSpinningRingPatch();
    const result = compileC1FromNormalized(patch);
    if (result.kind !== 'ok') throw new Error(result.errors.join('; '));

    const { roster } = result.payload;
    expect(roster).toHaveLength(3);

    // Phase 5 sorts: Compute → System_DrawPrep → Render
    expect(roster[0].type).toBe('Compute');
    expect(roster[1].type).toBe('System_DrawPrep');
    expect(roster[2].type).toBe('Render');
  });

  it('compute pass has gid let-binding (even with no wired fields)', () => {
    const patch = makeSpinningRingPatch();
    const result = compileC1FromNormalized(patch);
    if (result.kind !== 'ok') throw new Error(result.errors.join('; '));

    const computePass = result.payload.roster[0];
    expect(computePass.type).toBe('Compute');
    if (computePass.type !== 'Compute') return;

    // Should have at least the gid let-binding
    expect(computePass.ast.length).toBeGreaterThan(0);
    expect(computePass.ast[0].type).toBe('Let');
  });

  it('render pass has vertex and fragment ASTs', () => {
    const patch = makeSpinningRingPatch();
    const result = compileC1FromNormalized(patch);
    if (result.kind !== 'ok') throw new Error(result.errors.join('; '));

    const renderPass = result.payload.roster[2];
    expect(renderPass.type).toBe('Render');
    if (renderPass.type !== 'Render') return;

    expect(renderPass.drawCalls).toHaveLength(1);
    const dc = renderPass.drawCalls[0];

    // Vertex AST should have ReturnVertex
    const hasReturnVertex = dc.vertexAst.some(s => s.type === 'ReturnVertex');
    expect(hasReturnVertex).toBe(true);

    // Fragment AST should have ReturnFragment
    const hasReturnFragment = dc.fragmentAst.some(s => s.type === 'ReturnFragment');
    expect(hasReturnFragment).toBe(true);
  });
});

describe('C1 integration: dynamic-ring fixture', () => {
  it('produces a valid PipelineInstallPayload', () => {
    const patch = makeDynamicRingPatch();
    const result = compileC1FromNormalized(patch);

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') {
      console.error('Compile errors:', result.errors);
      return;
    }

    const parseResult = PipelineInstallPayloadSchema.safeParse(result.payload);
    if (!parseResult.success) {
      console.error('Zod errors:', JSON.stringify(parseResult.error.issues, null, 2));
    }
    expect(parseResult.success).toBe(true);
  });

  it('compute pass has 5 StoreField statements (pos_x, pos_y, color_r/g/b)', () => {
    const patch = makeDynamicRingPatch();
    const result = compileC1FromNormalized(patch);
    if (result.kind !== 'ok') throw new Error(result.errors.join('; '));

    const computePass = result.payload.roster[0];
    expect(computePass.type).toBe('Compute');
    if (computePass.type !== 'Compute') return;

    const storeFields = computePass.ast.filter(s => s.type === 'StoreField');
    expect(storeFields.length).toBe(5);

    // Verify field symbolIds
    const symbolIds = storeFields.map(s => (s as any).symbolId).sort();
    expect(symbolIds).toEqual([
      'dots:color_b', 'dots:color_g', 'dots:color_r', 'dots:pos_x', 'dots:pos_y',
    ]);
  });

  it('uses let-bindings for multi-fanout expressions', () => {
    const patch = makeDynamicRingPatch();
    const result = compileC1FromNormalized(patch);
    if (result.kind !== 'ok') throw new Error(result.errors.join('; '));

    const computePass = result.payload.roster[0];
    if (computePass.type !== 'Compute') return;

    // The "angle" expression (Add block b4) feeds 5+ downstream consumers,
    // so PassScopeManager should emit at least one Let binding
    const lets = computePass.ast.filter(s => s.type === 'Let');
    expect(lets.length).toBeGreaterThanOrEqual(2); // gid + at least angle
  });
});
