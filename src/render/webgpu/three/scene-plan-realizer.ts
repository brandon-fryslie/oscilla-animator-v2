/**
 * src/render/webgpu/three/scene-plan-realizer.ts
 *
 * Realizes a backend-neutral `ScenePlan` into a Three scene graph: a `Scene`, an
 * `OrthographicCamera`, one `InstancedMesh` per placed object, each shaded by a
 * `NodeMaterial` whose color and per-instance transform are TSL graphs built
 * from the plan's `PlanExpr`s.
 *
 * Scope source: design-docs/three-fork-integration-proposal.md §2.3, §6.
 * Consumes the seam defined in src/render/scene-plan/. Capability tier:
 * design-docs/three-fork-deltas.md §1 Tier B — composing upstream Three APIs to
 * express an Oscilla `ScenePlan`. NOT a fork delta.
 *
 * [LAW:effects-at-boundaries] Realization is pure: Three objects (geometries,
 *   materials, meshes, camera) are inert CPU data until a renderer draws them.
 *   This module touches no GPU device, so it is fully unit-testable without one.
 *   The device-bound act of drawing lives in ThreeForkRenderer.
 * [LAW:locality-or-seam] Every "which Three class realizes this resource"
 *   decision lives here, behind the renderer seam. The plan names resources;
 *   this module is the one place those names become Three objects.
 * [LAW:no-silent-failure] A plan that references a missing resource, declares a
 *   degenerate instance count, or carries an incompatible version fails loudly
 *   at realization rather than producing an empty or wrong scene that looks fine.
 */

import {
  InstancedMesh,
  Matrix4,
  MeshBasicNodeMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  type BufferGeometry,
  type Node,
} from 'three/webgpu';
import { add, cos, max, min, mod, mul, positionLocal, sin, sub, uniform, vec3, float } from 'three/tsl';

import {
  SCENE_PLAN_VERSION,
  type CameraPlan,
  type ColorBinding,
  type GeometryDef,
  type InstancingPlan,
  type MaterialDef,
  type PlanInputChannel,
  type ScenePlan,
  type SceneObjectRef,
} from '../../scene-plan';
import { planExprToTSL, type PlanExprContext, type TSLNode } from './plan-expr-tsl';

/** A settable float uniform node, updated each frame from an input channel. */
function floatUniform(value: number) {
  return uniform(value, 'float');
}
export type InputUniform = ReturnType<typeof floatUniform>;

/**
 * A realized scene: everything the renderer needs to draw and to drive the
 * declared runtime inputs each frame.
 *
 * [LAW:locality-or-seam] This is internal to the renderer backend. The Three
 *   `Scene`/`OrthographicCamera` it holds never cross back to app code — the
 *   renderer exposes capabilities, not these objects.
 */
export interface RealizedScene {
  readonly scene: Scene;
  readonly camera: OrthographicCamera;
  /** Uniform node per declared input channel; the renderer writes `.value`. */
  readonly inputs: ReadonlyMap<PlanInputChannel, InputUniform>;
  /** Releases every GPU-backed resource this scene allocated. */
  dispose(): void;
}

// 'point' has no proof-target patch yet (Grid of Squares uses 'rectangle'); it
// is realized as a unit quad so the instanced-draw path is uniform across both
// geometry kinds. A true point primitive lands with the first point-based demo
// (Spirograph), the same way textures/compute/post are deferred.
const POINT_QUAD_WORLD_SIZE = 1;

function geometryDefToGeometry(def: GeometryDef): BufferGeometry {
  // [LAW:dataflow-not-control-flow] Both kinds take the same draw path; only the
  //   quad dimensions differ as values.
  switch (def.kind) {
    case 'rectangle':
      return new PlaneGeometry(def.width, def.height);
    case 'point':
      return new PlaneGeometry(POINT_QUAD_WORLD_SIZE, POINT_QUAD_WORLD_SIZE);
    default:
      return assertNever(def);
  }
}

/** Branchless HSL→RGB (h,s,l in [0,1]) as a TSL graph. */
function hslToRgb(h: TSLNode, s: TSLNode, l: TSLNode): Node<'vec3'> {
  const a = mul(s, min(l, sub(float(1), l)));
  const channel = (n: number): TSLNode => {
    const k = mod(add(float(n), mul(h, float(12))), float(12));
    const m = max(float(-1), min(min(sub(k, float(3)), sub(float(9), k)), float(1)));
    return sub(l, mul(a, m));
  };
  return vec3(channel(0), channel(8), channel(4));
}

interface ColorNodes {
  readonly colorNode: Node<'vec3'>;
  readonly opacityNode: TSLNode | null;
}

function colorBindingToNodes(binding: ColorBinding, ctx: PlanExprContext): ColorNodes {
  // [LAW:dataflow-not-control-flow] The color space is a discriminated value;
  //   each arm maps its channels through the same `PlanExpr`→TSL translator.
  const e = (expr: Parameters<typeof planExprToTSL>[0]): TSLNode => planExprToTSL(expr, ctx);
  switch (binding.space) {
    case 'rgb':
      return { colorNode: vec3(e(binding.r), e(binding.g), e(binding.b)), opacityNode: null };
    case 'rgba':
      return { colorNode: vec3(e(binding.r), e(binding.g), e(binding.b)), opacityNode: e(binding.a) };
    case 'hsl':
      return { colorNode: hslToRgb(e(binding.h), e(binding.s), e(binding.l)), opacityNode: null };
    default:
      return assertNever(binding);
  }
}

function materialDefToMaterial(def: MaterialDef, ctx: PlanExprContext): MeshBasicNodeMaterial {
  // [LAW:dataflow-not-control-flow] One material kind today; a switch keeps the
  //   addition of a future kind a compile error rather than a silent default.
  switch (def.kind) {
    case 'unlitColor': {
      const material = new MeshBasicNodeMaterial();
      const { colorNode, opacityNode } = colorBindingToNodes(def.color, ctx);
      material.colorNode = colorNode;
      if (opacityNode) {
        material.opacityNode = opacityNode;
        material.transparent = true;
      }
      return material;
    }
    default:
      return assertNever(def.kind);
  }
}

/**
 * The per-instance vertex position: rotate the geometry's local XY by the
 * instance's rotation, then translate by its position. Each operand is a
 * `PlanExpr` evaluated per instance (it may reference `index`/`rank`/inputs), so
 * placement is computed on the GPU from intrinsics — no per-instance CPU
 * payload bag.
 */
function instanceTransformNode(transform: InstancingPlan['transform'], ctx: PlanExprContext): Node<'vec3'> {
  const rotation = planExprToTSL(transform.rotation, ctx);
  const px = planExprToTSL(transform.positionX, ctx);
  const py = planExprToTSL(transform.positionY, ctx);
  const c = cos(rotation);
  const s = sin(rotation);
  const lx = positionLocal.x;
  const ly = positionLocal.y;
  const rx = sub(mul(lx, c), mul(ly, s));
  const ry = add(mul(lx, s), mul(ly, c));
  return vec3(add(rx, px), add(ry, py), positionLocal.z);
}

function buildCamera(plan: CameraPlan): OrthographicCamera {
  switch (plan.kind) {
    case 'orthographic': {
      const camera = new OrthographicCamera(
        -plan.halfExtentX,
        plan.halfExtentX,
        plan.halfExtentY,
        -plan.halfExtentY,
        0.1,
        100,
      );
      camera.position.z = 10;
      camera.updateProjectionMatrix();
      return camera;
    }
    default:
      return assertNever(plan.kind);
  }
}

// InstancedMesh allocates its instance matrices uninitialized (zero matrices,
// which collapse every instance). Placement is owned by the material's
// positionNode, so each instance transform is neutralized to identity once.
function initIdentityInstances(mesh: InstancedMesh): void {
  const identity = new Matrix4();
  for (let i = 0; i < mesh.count; i += 1) {
    mesh.setMatrixAt(i, identity);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

function requireResource<T>(table: Readonly<Record<string, T>>, ref: string, kind: string): T {
  const def = table[ref];
  // [LAW:no-silent-failure] A dangling resource handle is a broken plan, not a
  //   thing to skip.
  if (!def) {
    throw new Error(`scene-plan-realizer: ${kind} resource '${ref}' referenced by the plan is not defined`);
  }
  return def;
}

/**
 * Realize a `ScenePlan` into a Three scene graph.
 *
 * @throws if the plan version is incompatible, a referenced resource is
 *   missing, or an object declares a non-positive instance count.
 */
export function realizeScenePlan(plan: ScenePlan): RealizedScene {
  // [LAW:no-silent-failure] An incompatible plan is a loud contract mismatch,
  //   not a best-effort partial render. Mirrors SCENE_PLAN_VERSION's intent.
  if (plan.version !== SCENE_PLAN_VERSION) {
    throw new Error(
      `scene-plan-realizer: incompatible ScenePlan version ${String(plan.version)}; renderer supports ${SCENE_PLAN_VERSION}`,
    );
  }

  const inputs = new Map<PlanInputChannel, InputUniform>();
  for (const channel of plan.render.inputs) {
    if (!inputs.has(channel)) {
      inputs.set(channel, uniform(0));
    }
  }
  const inputNodes: Partial<Record<PlanInputChannel, TSLNode>> = {};
  for (const [channel, node] of inputs) {
    inputNodes[channel] = node;
  }

  const scene = new Scene();
  const disposables: Array<{ dispose(): void }> = [];
  const placed = new Set<SceneObjectRef>();

  for (const draw of plan.render.draws) {
    if (placed.has(draw.object)) {
      continue;
    }
    placed.add(draw.object);

    const object = requireResource(plan.objects, draw.object, 'scene object');
    // [LAW:no-silent-failure] A zero/negative count would build a draw that
    //   renders nothing while looking installed; reject it.
    if (object.instancing.count <= 0) {
      throw new Error(
        `scene-plan-realizer: scene object '${draw.object}' declares non-positive instance count ${object.instancing.count}`,
      );
    }

    const ctx: PlanExprContext = { instanceCount: object.instancing.count, inputs: inputNodes };
    const geometry = geometryDefToGeometry(requireResource(plan.resources.geometries, object.geometry, 'geometry'));
    const material = materialDefToMaterial(requireResource(plan.resources.materials, object.material, 'material'), ctx);
    material.positionNode = instanceTransformNode(object.instancing.transform, ctx);

    const mesh = new InstancedMesh(geometry, material, object.instancing.count);
    initIdentityInstances(mesh);
    scene.add(mesh);

    disposables.push(geometry, material);
  }

  const camera = buildCamera(plan.render.camera);

  return {
    scene,
    camera,
    inputs,
    dispose() {
      for (const d of disposables) {
        d.dispose();
      }
      scene.clear();
    },
  };
}

function assertNever(value: never): never {
  throw new Error(`scene-plan-realizer: unhandled variant: ${JSON.stringify(value)}`);
}
