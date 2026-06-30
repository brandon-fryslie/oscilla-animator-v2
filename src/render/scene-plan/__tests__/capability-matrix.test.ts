/**
 * Capability-matrix contract test for the backend-neutral ScenePlan.
 *
 * design-docs/three-migration-capability-matrix.md is the matrix; ScenePlan is
 * its source of truth. This test builds ONE representative plan that exercises
 * every *Realized* variant the matrix lists — both geometries, all three color
 * spaces, both materials, every PlanExpr kind and operator, and the
 * deferred-but-populated compute/post resource defs — and proves it survives a
 * `JSON.parse(JSON.stringify(plan))` round-trip unchanged.
 *
 * Two things are locked at once:
 *  - If the matrix claims a variant the types cannot represent, this file fails
 *    to compile (the builders/types are the gate).
 *  - If any variant is not pure data (a closure, a class instance, a renderer
 *    object), the JSON round-trip diverges and the test fails.
 *
 * [LAW:behavior-not-structure] Asserts the plan can REPRESENT each capability as
 *   serializable data — not how a renderer realizes it.
 * [LAW:types-are-the-program] The exprKinds/op walker proves the representative
 *   plan covers the entire PlanExpr vocabulary, so the matrix cannot silently
 *   omit an operator.
 */

import { describe, it, expect } from 'vitest';

import {
  SCENE_PLAN_VERSION,
  defineScenePlan,
  geometryRef,
  materialRef,
  textureRef,
  sceneObjectRef,
  computeResourceRef,
  postChainRef,
  konst,
  input,
  intrinsic,
  floor,
  sin,
  cos,
  negate,
  add,
  sub,
  mul,
  div,
  mod,
  step,
  type PlanExpr,
  type PlanUnaryOp,
  type PlanBinaryOp,
  type ScenePlan,
} from '../index';

import { assetId } from '../../../core/ids';

/**
 * A plan that touches every Realized capability row in the matrix. It is not a
 * meaningful animation — it is a *coverage* artifact: each resource table, color
 * space, geometry, material, and PlanExpr operator appears at least once.
 */
function buildCapabilityCoveragePlan(): ScenePlan {
  // Geometry: rectangle + point.
  const rect = geometryRef('cap:rect');
  const point = geometryRef('cap:point');

  // Materials: unlitColor over hsl / rgb / rgba / oklab, plus texturedUnlit.
  const matHsl = materialRef('cap:mat-hsl');
  const matRgb = materialRef('cap:mat-rgb');
  const matRgba = materialRef('cap:mat-rgba');
  const matOklab = materialRef('cap:mat-oklab');
  const matTex = materialRef('cap:mat-tex');

  const tex = textureRef('cap:tex');
  const storage = computeResourceRef('cap:storage');
  const post = postChainRef('cap:post');

  const objHsl = sceneObjectRef('cap:obj-hsl');
  const objRgb = sceneObjectRef('cap:obj-rgb');
  const objRgba = sceneObjectRef('cap:obj-rgba');
  const objOklab = sceneObjectRef('cap:obj-oklab');
  const objTex = sceneObjectRef('cap:obj-tex');

  const index = intrinsic('index');
  const rank = intrinsic('rank');
  const time = input('time');

  // Spread every unary + binary operator across the transforms so the walker
  // below observes the full PlanExpr vocabulary in one plan.
  const transformA = {
    // binary: add, mul; leaf: const; intrinsic: index
    positionX: add(mul(index, konst(0.1)), konst(0.5)),
    // binary: div, mod; unary: floor
    positionY: floor(div(mod(index, konst(10)), konst(2))),
    // unary: negate; binary: sub; input: time
    rotation: negate(sub(time, konst(1))),
  };
  const transformB = {
    // unary: sin, cos
    positionX: sin(rank),
    positionY: cos(rank),
    rotation: konst(0),
  };

  return defineScenePlan({
    version: SCENE_PLAN_VERSION,
    resources: {
      geometries: {
        [rect]: { kind: 'rectangle', width: 0.08, height: 0.08 },
        [point]: { kind: 'point' },
      },
      materials: {
        [matHsl]: {
          kind: 'unlitColor',
          color: { space: 'hsl', h: add(rank, mul(time, konst(0.2))), s: konst(0.8), l: konst(0.6) },
        },
        [matRgb]: {
          kind: 'unlitColor',
          color: { space: 'rgb', r: rank, g: konst(0.5), b: konst(0.25) },
        },
        [matRgba]: {
          kind: 'unlitColor',
          // binary: step — a per-instance boolean opacity (rank past a threshold).
          color: { space: 'rgba', r: konst(1), g: konst(0), b: konst(0), a: step(konst(0.5), rank) },
        },
        [matOklab]: {
          kind: 'unlitColor',
          color: { space: 'oklab', l: add(konst(0.6), mul(rank, konst(0.1))), a: konst(0.1), b: konst(-0.05) },
        },
        [matTex]: { kind: 'texturedUnlit', texture: tex },
      },
      textures: {
        [tex]: { kind: 'asset', assetId: assetId('cap:asset') },
      },
      // Deferred capabilities, populated here to prove the table shape round-trips
      // even when non-empty (the steel thread leaves these empty).
      computeResources: {
        [storage]: { kind: 'storage', byteLength: 256 },
      },
      postChains: {
        [post]: { kind: 'passes', passes: ['bloom', 'vignette'] },
      },
    },
    objects: {
      [objHsl]: { geometry: rect, material: matHsl, instancing: { count: 16, transform: transformA } },
      [objRgb]: { geometry: point, material: matRgb, instancing: { count: 4, transform: transformB } },
      [objRgba]: { geometry: rect, material: matRgba, instancing: { count: 1, transform: transformB } },
      [objOklab]: { geometry: rect, material: matOklab, instancing: { count: 4, transform: transformB } },
      [objTex]: { geometry: rect, material: matTex, instancing: { count: 1, transform: transformB } },
    },
    render: {
      camera: { kind: 'orthographic', halfExtentX: 0.6, halfExtentY: 0.6 },
      inputs: ['time'],
      draws: [
        { target: 'previewCanvas', object: objHsl },
        { target: 'previewCanvas', object: objRgb },
        { target: 'previewCanvas', object: objRgba },
        { target: 'previewCanvas', object: objOklab },
        { target: 'previewCanvas', object: objTex },
      ],
      postChain: post,
    },
  });
}

/** Walk every PlanExpr in the plan, collecting the kinds and operators present. */
function collectExprVocabulary(plan: ScenePlan): {
  readonly kinds: Set<PlanExpr['kind']>;
  readonly unary: Set<PlanUnaryOp>;
  readonly binary: Set<PlanBinaryOp>;
} {
  const kinds = new Set<PlanExpr['kind']>();
  const unary = new Set<PlanUnaryOp>();
  const binary = new Set<PlanBinaryOp>();

  const visit = (expr: PlanExpr): void => {
    kinds.add(expr.kind);
    switch (expr.kind) {
      case 'const':
      case 'input':
      case 'intrinsic':
        return;
      case 'unary':
        unary.add(expr.op);
        visit(expr.arg);
        return;
      case 'binary':
        binary.add(expr.op);
        visit(expr.lhs);
        visit(expr.rhs);
        return;
    }
  };

  for (const object of Object.values(plan.objects)) {
    visit(object.instancing.transform.positionX);
    visit(object.instancing.transform.positionY);
    visit(object.instancing.transform.rotation);
  }
  for (const material of Object.values(plan.resources.materials)) {
    if (material.kind !== 'unlitColor') continue;
    const c = material.color;
    if (c.space === 'rgba') visit(c.a);
    if (c.space === 'rgb' || c.space === 'rgba') {
      visit(c.r);
      visit(c.g);
      visit(c.b);
    }
    if (c.space === 'hsl') {
      visit(c.h);
      visit(c.s);
      visit(c.l);
    }
    if (c.space === 'oklab') {
      visit(c.l);
      visit(c.a);
      visit(c.b);
    }
  }

  return { kinds, unary, binary };
}

describe('ScenePlan capability matrix — representative coverage', () => {
  const plan = buildCapabilityCoveragePlan();

  it('round-trips through JSON unchanged (every Realized variant is pure data)', () => {
    const roundTripped = JSON.parse(JSON.stringify(plan));
    expect(roundTripped).toEqual(plan);
  });

  it('covers both geometry variants', () => {
    const kinds = Object.values(plan.resources.geometries).map((g) => g.kind).sort();
    expect(kinds).toEqual(['point', 'rectangle']);
  });

  it('covers all four color spaces', () => {
    const spaces = Object.values(plan.resources.materials)
      .filter((m) => m.kind === 'unlitColor')
      .map((m) => (m.kind === 'unlitColor' ? m.color.space : null))
      .sort();
    expect(spaces).toEqual(['hsl', 'oklab', 'rgb', 'rgba']);
  });

  it('covers both material variants', () => {
    const kinds = new Set(Object.values(plan.resources.materials).map((m) => m.kind));
    expect(kinds).toEqual(new Set(['unlitColor', 'texturedUnlit']));
  });

  it('populates every resource table, including the deferred compute/post tables', () => {
    expect(Object.keys(plan.resources.geometries).length).toBeGreaterThan(0);
    expect(Object.keys(plan.resources.materials).length).toBeGreaterThan(0);
    expect(Object.keys(plan.resources.textures).length).toBeGreaterThan(0);
    expect(Object.keys(plan.resources.computeResources).length).toBeGreaterThan(0);
    expect(Object.keys(plan.resources.postChains).length).toBeGreaterThan(0);
  });

  it('exercises the entire PlanExpr vocabulary', () => {
    const { kinds, unary, binary } = collectExprVocabulary(plan);
    expect(kinds).toEqual(new Set(['const', 'input', 'intrinsic', 'unary', 'binary']));
    expect(unary).toEqual(new Set<PlanUnaryOp>(['floor', 'sin', 'cos', 'negate']));
    expect(binary).toEqual(new Set<PlanBinaryOp>(['add', 'sub', 'mul', 'div', 'mod', 'step']));
  });

  it('frames with an orthographic camera and draws to the preview canvas', () => {
    expect(plan.render.camera.kind).toBe('orthographic');
    expect(new Set(plan.render.draws.map((d) => d.target))).toEqual(new Set(['previewCanvas']));
  });

  it('references a non-null post chain by handle when one is present', () => {
    expect(plan.render.postChain).not.toBeNull();
    if (plan.render.postChain === null) return;
    expect(plan.resources.postChains[plan.render.postChain]).toBeDefined();
  });
});
