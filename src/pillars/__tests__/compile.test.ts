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

import { describe, it, expect } from 'vitest';
import { PipelineInstallPayloadSchema } from '../../render/rust/boundary-contract';
import { compilePillarPatch } from '../compile';
import { makeOrbitRingPatch } from '../fixtures/orbit-ring';
import { makeClockDrivenWobblePatch } from '../fixtures/clock-driven-wobble';
import { makeCrossDomainFollowPatch } from '../fixtures/cross-domain-follow';
import type { PillarPatch } from '../types';
import { clearCanvas, loadCanvas } from '../block-dsl/presentation/canvas-attachment';

/**
 * Walk any ExprIR/StatementIR tree and return true if it contains a node
 * matching the predicate. Used to assert structural facts about deeply
 * nested compute-pass AST trees without writing brittle `node.left.right.args[0]`
 * chains.
 */
function treeContains(node: unknown, predicate: (n: unknown) => boolean): boolean {
  if (predicate(node)) return true;
  if (node === null || typeof node !== 'object') return false;
  for (const value of Object.values(node as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (treeContains(item, predicate)) return true;
      }
      continue;
    }
    if (treeContains(value, predicate)) return true;
  }
  return false;
}

function isLoadGlobalSysTime(node: unknown): boolean {
  return (
    typeof node === 'object' &&
    node !== null &&
    (node as { type?: string }).type === 'LoadGlobal' &&
    (node as { symbolId?: string }).symbolId === 'sys:time'
  );
}

describe('pillar compiler: orbit-ring fixture', () => {
  // Ensure blocks are registered before any test runs. The async dynamic
  // import above schedules registration; we await it here to guarantee it
  // completes before assertions.
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

// =========================================================================
// Slice 3: clock-driven-wobble fixture (secondary bundle inputs)
// =========================================================================

describe('pillar compiler: clock-driven-wobble fixture', () => {
  it('compile succeeds', () => {
    const patch = makeClockDrivenWobblePatch();
    const result = compilePillarPatch(patch);
    if (result.kind !== 'ok') {
      throw new Error(`Compile failed: ${result.errors.join('; ')}`);
    }
    expect(result.kind).toBe('ok');
  });

  it('payload passes Zod + semantic validation', () => {
    const patch = makeClockDrivenWobblePatch();
    const result = compilePillarPatch(patch);
    if (result.kind !== 'ok') throw new Error(result.errors.join('; '));

    const parsed = PipelineInstallPayloadSchema.safeParse(result.payload);
    if (!parsed.success) {
      throw new Error(
        `Zod validation failed:\n${JSON.stringify(parsed.error.issues, null, 2)}`,
      );
    }
    expect(parsed.success).toBe(true);
  });

  it('sys:time is declared once despite two blocks declaring it', () => {
    // Both ParticlePool and Clock declare globals['sys:time'] with the same
    // structural spec. mergeSection should dedupe them silently and produce
    // a single entry in the final manifest.
    const patch = makeClockDrivenWobblePatch();
    const result = compilePillarPatch(patch);
    if (result.kind !== 'ok') throw new Error(result.errors.join('; '));

    const timeGlobal = result.payload.manifest.globals['sys:time'];
    expect(timeGlobal).toBeDefined();
    expect(timeGlobal.type).toBe('f32');
    expect(timeGlobal.isDynamic).toBe(true);
    // Spot-check no phantom duplicate entries
    const globalKeys = Object.keys(result.payload.manifest.globals).filter(
      (k) => k === 'sys:time',
    );
    expect(globalKeys).toHaveLength(1);
  });

  it('compute pass writes pos_x/pos_y reaching a LoadGlobal(sys:time)', () => {
    // This is the structural proof that the secondary Clock bundle plumbed
    // a clock.time reference into the Modifier's pos_x and pos_y outputs.
    const patch = makeClockDrivenWobblePatch();
    const result = compilePillarPatch(patch);
    if (result.kind !== 'ok') throw new Error(result.errors.join('; '));

    const compute = result.payload.roster[0];
    if (compute.type !== 'Compute') throw new Error('Expected roster[0] to be Compute');

    const posXStore = compute.ast.find(
      (s) => s.type === 'StoreField' && (s as { symbolId: string }).symbolId === 'dots:pos_x',
    );
    const posYStore = compute.ast.find(
      (s) => s.type === 'StoreField' && (s as { symbolId: string }).symbolId === 'dots:pos_y',
    );
    expect(posXStore).toBeDefined();
    expect(posYStore).toBeDefined();

    // Both pos_x and pos_y should contain a LoadGlobal(sys:time) somewhere
    // in their expression trees, because the modifier's clock.time term
    // is added to both.
    expect(treeContains(posXStore, isLoadGlobalSysTime)).toBe(true);
    expect(treeContains(posYStore, isLoadGlobalSysTime)).toBe(true);
  });

  it('pos_x top-level is BinaryOp(+) composing primary + clock term', () => {
    // The expression `pos_x = primary.pos_x + sin(clock.time * 2.0) * 0.1`
    // compiles to a top-level BinaryOp('+', primary.pos_x, <clock term>).
    // The RIGHT child should be the sub-tree containing LoadGlobal(sys:time).
    const patch = makeClockDrivenWobblePatch();
    const result = compilePillarPatch(patch);
    if (result.kind !== 'ok') throw new Error(result.errors.join('; '));

    const compute = result.payload.roster[0];
    if (compute.type !== 'Compute') throw new Error('Expected roster[0] to be Compute');

    const posXStore = compute.ast.find(
      (s) => s.type === 'StoreField' && (s as { symbolId: string }).symbolId === 'dots:pos_x',
    );
    expect(posXStore).toBeDefined();
    const value = (posXStore as { value: { type: string; op?: string; left?: unknown; right?: unknown } }).value;
    expect(value.type).toBe('BinaryOp');
    expect(value.op).toBe('+');

    // The clock.time reference lives inside the right-hand side of the
    // top-level +.
    expect(treeContains(value.right, isLoadGlobalSysTime)).toBe(true);
    // The primary pos_x on the left does NOT contain a LoadGlobal(sys:time)
    // because the Generator was configured with timeFactor=0, so its
    // `scaledTime = time * 0` term was still emitted but the overall
    // LoadGlobal DOES appear in the primary bundle's pos_x expression
    // (via the `time * 0` term). So we can't assert "left does not
    // contain LoadGlobal" — instead assert the top-level structure.
    expect(value.left).toBeDefined();
  });

  it('color_r passes through unchanged from the Generator (modifier does not touch it)', () => {
    // The Modifier expression only writes pos_x and pos_y. color_r should
    // be the Generator's original expression (halfPlusHalf(sinAngle)),
    // which compiles to a BinaryOp at the top level (the `+ 0.5`).
    const patch = makeClockDrivenWobblePatch();
    const result = compilePillarPatch(patch);
    if (result.kind !== 'ok') throw new Error(result.errors.join('; '));

    const compute = result.payload.roster[0];
    if (compute.type !== 'Compute') throw new Error('Expected roster[0] to be Compute');

    const colorRStore = compute.ast.find(
      (s) => s.type === 'StoreField' && (s as { symbolId: string }).symbolId === 'dots:color_r',
    );
    expect(colorRStore).toBeDefined();
    const value = (colorRStore as { value: { type: string } }).value;
    expect(value.type).toBe('BinaryOp');
  });

  it('roster has exactly 3 passes (Clock generator does not add passes)', () => {
    // Clock is a Generator but emits a zero-cost bundle — no compute pass
    // of its own. The roster should look structurally identical to the
    // orbit-ring roster: one Compute, one System_DrawPrep, one Render.
    const patch = makeClockDrivenWobblePatch();
    const result = compilePillarPatch(patch);
    if (result.kind !== 'ok') throw new Error(result.errors.join('; '));

    const { roster } = result.payload;
    expect(roster).toHaveLength(3);
    expect(roster[0].type).toBe('Compute');
    expect(roster[1].type).toBe('System_DrawPrep');
    expect(roster[2].type).toBe('Render');
  });
});

// =========================================================================
// Slice 4: cross-domain-follow fixture (cross-domain LoadField reads)
// =========================================================================

/** Predicate matching `LoadField` nodes whose symbolId targets a domain. */
function isLoadFieldFromDomain(domainId: string) {
  return (node: unknown): boolean => {
    if (typeof node !== 'object' || node === null) return false;
    const n = node as { type?: string; symbolId?: string };
    return n.type === 'LoadField' && typeof n.symbolId === 'string' && n.symbolId.startsWith(`${domainId}:`);
  };
}

describe('pillar compiler: cross-domain-follow fixture', () => {
  it('compile succeeds', () => {
    const patch = makeCrossDomainFollowPatch();
    const result = compilePillarPatch(patch);
    if (result.kind !== 'ok') {
      throw new Error(`Compile failed: ${result.errors.join('; ')}`);
    }
    expect(result.kind).toBe('ok');
  });

  it('payload passes Zod + semantic validation', () => {
    const patch = makeCrossDomainFollowPatch();
    const result = compilePillarPatch(patch);
    if (result.kind !== 'ok') throw new Error(result.errors.join('; '));

    const parsed = PipelineInstallPayloadSchema.safeParse(result.payload);
    if (!parsed.success) {
      throw new Error(
        `Zod validation failed:\n${JSON.stringify(parsed.error.issues, null, 2)}`,
      );
    }
    expect(parsed.success).toBe(true);
  });

  it('manifest has both pool_a and pool_b domains with capacity 32', () => {
    const patch = makeCrossDomainFollowPatch();
    const result = compilePillarPatch(patch);
    if (result.kind !== 'ok') throw new Error(result.errors.join('; '));

    const { domains } = result.payload.manifest;
    expect(domains['pool_a']).toBeDefined();
    expect(domains['pool_a'].capacity).toBe(32);
    expect(domains['pool_b']).toBeDefined();
    expect(domains['pool_b'].capacity).toBe(32);
  });

  it('roster has 6 passes in order: pool_a triple, then pool_b triple', () => {
    const patch = makeCrossDomainFollowPatch();
    const result = compilePillarPatch(patch);
    if (result.kind !== 'ok') throw new Error(result.errors.join('; '));

    const { roster } = result.payload;
    expect(roster).toHaveLength(6);

    // pool_a's three passes come first because sinkA appears before sinkB
    // in the patch. This ordering is what makes the cross-domain VRAM read
    // valid: computeA must run before computeB.
    expect(roster[0].type).toBe('Compute');
    expect((roster[0] as { passId: string }).passId).toBe('pool_a_eval');
    expect(roster[1].type).toBe('System_DrawPrep');
    expect(roster[2].type).toBe('Render');

    expect(roster[3].type).toBe('Compute');
    expect((roster[3] as { passId: string }).passId).toBe('pool_b_eval');
    expect(roster[4].type).toBe('System_DrawPrep');
    expect(roster[5].type).toBe('Render');
  });

  it('computeB contains LoadField nodes targeting pool_a', () => {
    // The Modifier's expression `pos_x = primary.pos_x + a.pos_x` should
    // produce LoadField('pool_a:pos_x', gid) somewhere in computeB's AST,
    // because the walker rewrote the secondary 'a' bundle when it detected
    // the cross-domain edge.
    const patch = makeCrossDomainFollowPatch();
    const result = compilePillarPatch(patch);
    if (result.kind !== 'ok') throw new Error(result.errors.join('; '));

    const computeB = result.payload.roster[3];
    if (computeB.type !== 'Compute') throw new Error('Expected roster[3] to be Compute');

    // Walk the entire AST and count LoadField references to pool_a.
    let count = 0;
    const walk = (node: unknown): void => {
      if (isLoadFieldFromDomain('pool_a')(node)) count++;
      if (typeof node !== 'object' || node === null) return;
      for (const v of Object.values(node as Record<string, unknown>)) {
        if (Array.isArray(v)) v.forEach(walk);
        else walk(v);
      }
    };
    computeB.ast.forEach(walk);

    // We expect at least two: one for pos_x's `a.pos_x`, one for pos_y's `a.pos_y`.
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it("computeB's dependencies include pool_a as 'read' and pool_b as 'read_write'", () => {
    const patch = makeCrossDomainFollowPatch();
    const result = compilePillarPatch(patch);
    if (result.kind !== 'ok') throw new Error(result.errors.join('; '));

    const computeB = result.payload.roster[3];
    if (computeB.type !== 'Compute') throw new Error('Expected roster[3] to be Compute');

    expect(computeB.dependencies.domains['pool_b']).toBe('read_write');
    expect(computeB.dependencies.domains['pool_a']).toBe('read');
  });

  it('computeA does NOT read from pool_b (one-way data flow)', () => {
    // The fixture flows A → B (B reads from A's secondary bundle), not the
    // reverse. computeA should be free of any LoadField referencing pool_b,
    // and its dependency declaration should list only pool_a as read_write.
    const patch = makeCrossDomainFollowPatch();
    const result = compilePillarPatch(patch);
    if (result.kind !== 'ok') throw new Error(result.errors.join('; '));

    const computeA = result.payload.roster[0];
    if (computeA.type !== 'Compute') throw new Error('Expected roster[0] to be Compute');

    // Walk for any LoadField targeting pool_b.
    let foundForeign = false;
    const walk = (node: unknown): void => {
      if (isLoadFieldFromDomain('pool_b')(node)) {
        foundForeign = true;
        return;
      }
      if (typeof node !== 'object' || node === null) return;
      for (const v of Object.values(node as Record<string, unknown>)) {
        if (Array.isArray(v)) v.forEach(walk);
        else walk(v);
      }
    };
    computeA.ast.forEach(walk);
    expect(foundForeign).toBe(false);

    // Dependency declaration should be just pool_a.
    expect(computeA.dependencies.domains['pool_a']).toBe('read_write');
    expect(computeA.dependencies.domains['pool_b']).toBeUndefined();
  });

  it('sinkA renders with loadOp=clear, sinkB renders with loadOp=load', () => {
    const patch = makeCrossDomainFollowPatch();
    const result = compilePillarPatch(patch);
    if (result.kind !== 'ok') throw new Error(result.errors.join('; '));

    const renderA = result.payload.roster[2];
    const renderB = result.payload.roster[5];
    if (renderA.type !== 'Render') throw new Error('Expected roster[2] to be Render');
    if (renderB.type !== 'Render') throw new Error('Expected roster[5] to be Render');

    const colorA = renderA.targets.colors[0];
    const colorB = renderB.targets.colors[0];
    expect(colorA.loadOp).toBe('clear');
    expect(colorA.clearColor).toBeDefined();
    expect(colorB.loadOp).toBe('load');
    // clearColor is omitted on load passes — its presence would be a sign
    // the conditional in DrawBundle leaked the wrong shape.
    expect(colorB.clearColor).toBeUndefined();
  });

  it('pool_b:pos_x StoreField is BinaryOp(+) with a LoadField(pool_a:pos_x) reachable from the right side', () => {
    const patch = makeCrossDomainFollowPatch();
    const result = compilePillarPatch(patch);
    if (result.kind !== 'ok') throw new Error(result.errors.join('; '));

    const computeB = result.payload.roster[3];
    if (computeB.type !== 'Compute') throw new Error('Expected roster[3] to be Compute');

    const posXStore = computeB.ast.find(
      (s) => s.type === 'StoreField' && (s as { symbolId: string }).symbolId === 'pool_b:pos_x',
    );
    expect(posXStore).toBeDefined();

    const value = (posXStore as { value: { type: string; op?: string; right?: unknown } }).value;
    expect(value.type).toBe('BinaryOp');
    expect(value.op).toBe('+');

    // The right child of the top-level + should reach a LoadField with
    // symbolId 'pool_a:pos_x'. Walk only the right subtree so we're sure
    // the foreign reference is on the secondary's contribution side.
    const findFieldInTree = (node: unknown, predicate: (n: unknown) => boolean): boolean => {
      if (predicate(node)) return true;
      if (typeof node !== 'object' || node === null) return false;
      for (const v of Object.values(node as Record<string, unknown>)) {
        if (Array.isArray(v)) {
          for (const item of v) if (findFieldInTree(item, predicate)) return true;
        } else if (findFieldInTree(v, predicate)) return true;
      }
      return false;
    };
    expect(
      findFieldInTree(value.right, (n) => {
        if (typeof n !== 'object' || n === null) return false;
        const tn = n as { type?: string; symbolId?: string };
        return tn.type === 'LoadField' && tn.symbolId === 'pool_a:pos_x';
      }),
    ).toBe(true);
  });

  it('cardinality mismatch produces a compile error', () => {
    // Construct a patch identical to cross-domain-follow but with mismatched
    // capacities (pool_a=32, pool_b=16). The walker's cross-domain rewrite
    // step should detect the mismatch and emit a compile error rather than
    // silently inserting a 1:1 LoadField that would read past the end of
    // the smaller pool.
    const patch: PillarPatch = {
      blocks: [
        { id: 'genA', kind: 'generator', type: 'ParticlePool',
          config: { domainId: 'pool_a', capacity: 32, radius: 0.5, timeFactor: 1 } },
        { id: 'sinkA', kind: 'intent', type: 'DrawBundle',
          config: { domainId: 'pool_a', shapeId: 'pool_a_quad', quadScale: 0.025, attachment: clearCanvas([0.05, 0.05, 0.07, 1]) } },
        { id: 'genB', kind: 'generator', type: 'ParticlePool',
          config: { domainId: 'pool_b', capacity: 16, radius: 0.15, timeFactor: 0 } },
        { id: 'modB', kind: 'modifier', type: 'ExpressionModifier',
          config: { expression: 'pos_x = primary.pos_x + a.pos_x\npos_y = primary.pos_y + a.pos_y' } },
        { id: 'sinkB', kind: 'intent', type: 'DrawBundle',
          config: { domainId: 'pool_b', shapeId: 'pool_b_quad', quadScale: 0.018, attachment: loadCanvas() } },
      ],
      edges: [
        { id: 'e0', source: 'genA', target: 'sinkA', inputSlot: 'primary', role: 'primary' },
        { id: 'e1', source: 'genB', target: 'modB', inputSlot: 'primary', role: 'primary' },
        { id: 'e2', source: 'genA', target: 'modB', inputSlot: 'a', role: 'secondary' },
        { id: 'e3', source: 'modB', target: 'sinkB', inputSlot: 'primary', role: 'primary' },
      ],
    };

    const result = compilePillarPatch(patch);
    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;

    const message = result.errors.join('\n');
    expect(message).toMatch(/cardinality mismatch|capacity/i);
    // Both domain ids should appear in the message so the user can locate
    // the offending edge without guessing.
    expect(message).toContain('pool_a');
    expect(message).toContain('pool_b');
  });

  it('regression: scalar secondary (Clock) still works alongside ParticlePool primary', () => {
    // Slice 3's clock-driven-wobble fixture has Clock (no domainId) feeding
    // ExpressionModifier whose primary is ParticlePool (pool_b). Since
    // Clock has no domainId, the walker should NOT rewrite its bundle,
    // even though the primary has a domainId. The fixture compiling
    // successfully — and its sys:time LoadGlobal still appearing in the
    // compute pass — proves slice 3's behavior is preserved end-to-end.
    const patch = makeClockDrivenWobblePatch();
    const result = compilePillarPatch(patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const compute = result.payload.roster[0];
    if (compute.type !== 'Compute') throw new Error('Expected Compute');
    // No foreign-domain LoadField should appear in clock-driven-wobble's
    // compute pass — the only secondary is a scalar Clock.
    let foundLoadField = false;
    const walk = (node: unknown): void => {
      if (typeof node !== 'object' || node === null) return;
      const n = node as { type?: string };
      if (n.type === 'LoadField') foundLoadField = true;
      for (const v of Object.values(node as Record<string, unknown>)) {
        if (Array.isArray(v)) v.forEach(walk);
        else walk(v);
      }
    };
    compute.ast.forEach(walk);
    expect(foundLoadField).toBe(false);
  });
});
