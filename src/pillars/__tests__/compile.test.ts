/**
 * src/pillars/__tests__/compile.test.ts
 *
 * Integration test for the vertical slice. Compiles the orbit-ring fixture
 * through compilePillarPatch and validates:
 *
 *   1. The result is a successful PipelineInstallPayload.
 *   2. The payload passes Zod validation against PipelineInstallPayloadSchema
 *      (which also runs the semantic validator: every symbol referenced in
 *      the roster AST must exist in the manifest).
 *   3. The manifest contains the expected domain with the expected 5 fields.
 *   4. The roster has exactly three passes in order: Compute, System_DrawPrep,
 *      Render.
 *   5. The compute pass emits exactly 5 StoreField statements (one per bundle
 *      field) plus the initial `let gid = ...` binding.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { PipelineInstallPayloadSchema } from '../../render/rust/boundary-contract';
import { compilePillarPatch } from '../compile';
import { makeOrbitRingPatch } from '../fixtures/orbit-ring';

// Side-effect import: register all pillar blocks before running tests.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
import('../blocks');

describe('pillar compiler: orbit-ring fixture', () => {
  // Ensure blocks are registered before any test runs. The async dynamic
  // import above schedules registration; we await it here to guarantee it
  // completes before assertions.
  beforeAll(async () => {
    await import('../blocks');
  });

  it('produces an ok CompileResult', () => {
    const patch = makeOrbitRingPatch();
    const result = compilePillarPatch(patch);
    if (result.kind !== 'ok') {
      throw new Error(`Compile failed: ${result.errors.join('; ')}`);
    }
    expect(result.kind).toBe('ok');
  });

  it('payload passes Zod + semantic validation', () => {
    const patch = makeOrbitRingPatch();
    const result = compilePillarPatch(patch);
    if (result.kind !== 'ok') throw new Error(result.errors.join('; '));

    const parsed = PipelineInstallPayloadSchema.safeParse(result.payload);
    if (!parsed.success) {
      // Surface the full validation errors for debugging
      throw new Error(
        `Zod validation failed:\n${JSON.stringify(parsed.error.issues, null, 2)}`,
      );
    }
    expect(parsed.success).toBe(true);
  });

  it('manifest has the dots domain with the expected field set', () => {
    const patch = makeOrbitRingPatch();
    const result = compilePillarPatch(patch);
    if (result.kind !== 'ok') throw new Error(result.errors.join('; '));

    const { manifest } = result.payload;
    expect(manifest.domains['dots']).toBeDefined();
    const domain = manifest.domains['dots'];
    expect(domain.capacity).toBe(64);
    expect(Object.keys(domain.fields).sort()).toEqual([
      'color_b', 'color_g', 'color_r', 'pos_x', 'pos_y',
    ]);
    expect(domain.fields['pos_x'].type).toBe('f32');
    expect(domain.fields['color_r'].type).toBe('f32');
  });

  it('manifest declares sys:time as a dynamic global and sys:camera as static', () => {
    const patch = makeOrbitRingPatch();
    const result = compilePillarPatch(patch);
    if (result.kind !== 'ok') throw new Error(result.errors.join('; '));

    const { manifest } = result.payload;
    expect(manifest.globals['sys:time']).toBeDefined();
    expect(manifest.globals['sys:time'].isDynamic).toBe(true);
    expect(manifest.globals['sys:camera']).toBeDefined();
    expect(manifest.globals['sys:camera'].type).toBe('mat4x4');
  });

  it('manifest has the dots_quad shape in shapeBank', () => {
    const patch = makeOrbitRingPatch();
    const result = compilePillarPatch(patch);
    if (result.kind !== 'ok') throw new Error(result.errors.join('; '));

    expect(result.payload.manifest.shapeBank['dots_quad']).toBeDefined();
  });

  it('manifest has dots:active arena scalar with capacity clearValue', () => {
    const patch = makeOrbitRingPatch();
    const result = compilePillarPatch(patch);
    if (result.kind !== 'ok') throw new Error(result.errors.join('; '));

    const scalar = result.payload.manifest.arenaScalars['dots:active'];
    expect(scalar).toBeDefined();
    expect(scalar.type).toBe('u32');
    expect(scalar.clearValue).toBe(64);
  });

  it('roster has exactly 3 passes in the expected order', () => {
    const patch = makeOrbitRingPatch();
    const result = compilePillarPatch(patch);
    if (result.kind !== 'ok') throw new Error(result.errors.join('; '));

    const { roster } = result.payload;
    expect(roster).toHaveLength(3);
    expect(roster[0].type).toBe('Compute');
    expect(roster[1].type).toBe('System_DrawPrep');
    expect(roster[2].type).toBe('Render');
  });

  it('compute pass emits exactly 5 StoreField statements (one per bundle field)', () => {
    const patch = makeOrbitRingPatch();
    const result = compilePillarPatch(patch);
    if (result.kind !== 'ok') throw new Error(result.errors.join('; '));

    const compute = result.payload.roster[0];
    if (compute.type !== 'Compute') throw new Error('Expected roster[0] to be Compute');

    const storeFields = compute.ast.filter((s) => s.type === 'StoreField');
    expect(storeFields).toHaveLength(5);

    const storeSymbols = storeFields
      .map((s) => (s as { symbolId: string }).symbolId)
      .sort();
    expect(storeSymbols).toEqual([
      'dots:color_b', 'dots:color_g', 'dots:color_r', 'dots:pos_x', 'dots:pos_y',
    ]);
  });

  it('compute pass has a gid let-binding before the stores', () => {
    const patch = makeOrbitRingPatch();
    const result = compilePillarPatch(patch);
    if (result.kind !== 'ok') throw new Error(result.errors.join('; '));

    const compute = result.payload.roster[0];
    if (compute.type !== 'Compute') throw new Error('Expected roster[0] to be Compute');

    expect(compute.ast[0].type).toBe('Let');
    expect((compute.ast[0] as { name: string }).name).toBe('gid');
  });

  it('render pass has vertex + fragment ASTs with a ReturnVertex and ReturnFragment', () => {
    const patch = makeOrbitRingPatch();
    const result = compilePillarPatch(patch);
    if (result.kind !== 'ok') throw new Error(result.errors.join('; '));

    const render = result.payload.roster[2];
    if (render.type !== 'Render') throw new Error('Expected roster[2] to be Render');
    expect(render.drawCalls).toHaveLength(1);

    const drawCall = render.drawCalls[0];
    const hasReturnVertex = drawCall.vertexAst.some((s) => s.type === 'ReturnVertex');
    const hasReturnFragment = drawCall.fragmentAst.some((s) => s.type === 'ReturnFragment');
    expect(hasReturnVertex).toBe(true);
    expect(hasReturnFragment).toBe(true);
  });

  it('modifier scales pos_x: StoreField value is a BinaryOp multiplication', () => {
    // The ExpressionModifier in the fixture wraps the Generator's pos_x in
    // `BinaryOp(*, <gen pos_x expr>, LiteralF32(0.75))`. The Generator itself
    // already emits pos_x as a BinaryOp (`cos(angle) * radius`), so the
    // modifier's new top-level node should be a BinaryOp whose `op` is '*'
    // and whose `right` is a LiteralF32 with value 0.75.
    const patch = makeOrbitRingPatch();
    const result = compilePillarPatch(patch);
    if (result.kind !== 'ok') throw new Error(result.errors.join('; '));

    const compute = result.payload.roster[0];
    if (compute.type !== 'Compute') throw new Error('Expected roster[0] to be Compute');

    const posXStore = compute.ast.find(
      (s) => s.type === 'StoreField' && (s as { symbolId: string }).symbolId === 'dots:pos_x',
    );
    expect(posXStore).toBeDefined();
    const value = (posXStore as { value: { type: string; op?: string; right?: { type: string; value?: number } } }).value;
    expect(value.type).toBe('BinaryOp');
    expect(value.op).toBe('*');
    expect(value.right?.type).toBe('LiteralF32');
    expect(value.right?.value).toBe(0.75);
  });

  it('modifier overrides color_r: StoreField value is a LiteralF32 constant', () => {
    // The modifier replaces color_r with a literal 0.2, not a computed
    // expression. This confirms the modifier can overwrite a field with a
    // completely different expression (not just wrap the upstream).
    const patch = makeOrbitRingPatch();
    const result = compilePillarPatch(patch);
    if (result.kind !== 'ok') throw new Error(result.errors.join('; '));

    const compute = result.payload.roster[0];
    if (compute.type !== 'Compute') throw new Error('Expected roster[0] to be Compute');

    const colorRStore = compute.ast.find(
      (s) => s.type === 'StoreField' && (s as { symbolId: string }).symbolId === 'dots:color_r',
    );
    expect(colorRStore).toBeDefined();
    const value = (colorRStore as { value: { type: string; value?: number } }).value;
    expect(value.type).toBe('LiteralF32');
    expect(value.value).toBe(0.2);
  });

  it('modifier pass-through: color_g is the Generator\'s original expression', () => {
    // The modifier does not touch color_g; it should pass through from the
    // Generator. The Generator emits color_g as `halfPlusHalf(sin(angle + 2.094))`
    // which compiles to a BinaryOp at the top level (the `+ 0.5`).
    const patch = makeOrbitRingPatch();
    const result = compilePillarPatch(patch);
    if (result.kind !== 'ok') throw new Error(result.errors.join('; '));

    const compute = result.payload.roster[0];
    if (compute.type !== 'Compute') throw new Error('Expected roster[0] to be Compute');

    const colorGStore = compute.ast.find(
      (s) => s.type === 'StoreField' && (s as { symbolId: string }).symbolId === 'dots:color_g',
    );
    expect(colorGStore).toBeDefined();
    const value = (colorGStore as { value: { type: string } }).value;
    expect(value.type).toBe('BinaryOp');
  });
});
