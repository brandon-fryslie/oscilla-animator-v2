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
  CircleGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicNodeMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  type BufferGeometry,
  type Material,
  type Node,
  type Texture,
} from 'three/webgpu';
import { add, cos, max, min, mod, mul, positionLocal, sin, sub, texture as sampleTexture, uniform, uv, vec2, vec3, float } from 'three/tsl';

import {
  SCENE_PLAN_VERSION,
  evalPlanExpr,
  type CameraPlan,
  type ColorBinding,
  type GeometryDef,
  type InstancingPlan,
  type MaterialDef,
  type PlanExpr,
  type PlanInputChannel,
  type ScenePlan,
  type SceneObject,
  type SceneObjectRef,
  type StateDef,
  type StateRef,
  type TextureRef,
} from '../../scene-plan';
import { planExprToTSL, type PlanExprContext, type TSLNode } from './plan-expr-tsl';
import type { RuntimeInputChannelValues } from './renderer-contract';

/** Textures the loading bridge has already decoded, keyed by plan handle. */
export type ResolvedTextures = ReadonlyMap<TextureRef, Texture>;

/** A settable float uniform node, updated each frame from an input channel. */
function floatUniform(value: number) {
  return uniform(value, 'float');
}
export type InputUniform = ReturnType<typeof floatUniform>;

/**
 * One realized scene object — the live Three mesh for a plan `SceneObject`, plus
 * the structural `fingerprint` of the plan slice it was built from. The
 * fingerprint is what a reinstall compares to decide reuse vs. rebuild: equal
 * fingerprint under the same authored `SceneObjectRef` means the object is
 * structurally identical and its live Three object (geometry, material, compiled
 * TSL graph, instance buffers) is kept untouched across the edit.
 *
 * [LAW:one-source-of-truth] The authored `SceneObjectRef` is the only identity;
 *   the fingerprint is a derived structural digest, not a second identity.
 */
export interface RealizedObject {
  readonly mesh: InstancedMesh;
  readonly fingerprint: string;
}

/**
 * One realized stateful cell: the live storage uniform a `state` PlanExpr leaf
 * reads, plus the structural `fingerprint` a reinstall compares to decide carry
 * vs. reseed, and this install's `update` recurrence (refreshed every reinstall —
 * a tweaked increment takes effect without resetting the running value).
 *
 * [LAW:one-source-of-truth] Authored identity (the `StateRef`) is the only
 *   continuity key; the fingerprint is a derived structural digest, not a second
 *   identity. The running value lives in exactly one place: `uniform.value`.
 */
export interface RealizedState {
  readonly uniform: InputUniform;
  readonly fingerprint: string;
  readonly update: PlanExpr;
}

/**
 * A realized scene: everything the renderer needs to draw and to drive the
 * declared runtime inputs each frame, plus the per-object map a reinstall
 * reconciles against.
 *
 * [LAW:locality-or-seam] This is internal to the renderer backend. The Three
 *   `Scene`/`OrthographicCamera` it holds never cross back to app code — the
 *   renderer exposes capabilities, not these objects.
 */
export interface RealizedScene {
  readonly scene: Scene;
  readonly camera: OrthographicCamera;
  /** Structural digest of the camera plan, so a reinstall can reuse the camera. */
  readonly cameraFingerprint: string;
  /** Live realized object per authored `SceneObjectRef`, for reinstall reuse. */
  readonly objects: ReadonlyMap<SceneObjectRef, RealizedObject>;
  /** Uniform node per declared input channel; the renderer writes `.value`. */
  readonly inputs: ReadonlyMap<PlanInputChannel, InputUniform>;
  /** Realized stateful cell per authored `StateRef`, carried across reinstall. */
  readonly states: ReadonlyMap<StateRef, RealizedState>;
  /**
   * Advance every stateful cell one frame: evaluate each cell's `update` rule from
   * a single snapshot of the current cell values and this frame's input channels,
   * then write the results back. The snapshot-then-write ordering makes all cells
   * step from one consistent prior frame, so cells that read each other never see a
   * half-updated frame. [LAW:no-ambient-temporal-coupling] The frame boundary is
   * the recurrence's owner; this is the one place it advances.
   */
  advanceStates(values: RuntimeInputChannelValues): void;
  /** Releases every GPU-backed resource this scene allocated. */
  dispose(): void;
}

// A 'point' is a round dot: a filled disc tessellated finely enough that it reads
// as a circle rather than a polygon at demo dot sizes. Its diameter is `size`, so
// a point and a same-sized square differ only in shape, never in draw path.
const POINT_DISC_SEGMENTS = 32;

function geometryDefToGeometry(def: GeometryDef): BufferGeometry {
  // [LAW:dataflow-not-control-flow] Every kind takes the same instanced-draw path;
  //   only the base primitive differs as a value of the geometry union.
  switch (def.kind) {
    case 'rectangle':
      return new PlaneGeometry(def.width, def.height);
    case 'point':
      return new CircleGeometry(def.size / 2, POINT_DISC_SEGMENTS);
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

/**
 * OKLab (L,a,b) → linear sRGB as a TSL graph (Björn Ottosson's matrices, cube
 * via `mul` since the cube-root only runs authoring-side). Channels are
 * gamut-clamped to [0,1]; three encodes linear → display sRGB on output, so this
 * is the render-side inverse of `hexColorBinding`'s sRGB → OKLab.
 *
 * [LAW:one-source-of-truth] The only place the OKLab→display matrix lives on the
 *   render side; no block or material references these coefficients.
 */
function oklabToLinearSrgb(L: TSLNode, A: TSLNode, B: TSLNode): Node<'vec3'> {
  const lp = add(L, add(mul(A, float(0.3963377774)), mul(B, float(0.2158037573))));
  const mp = sub(L, add(mul(A, float(0.1055613458)), mul(B, float(0.0638541728))));
  const sp = sub(L, add(mul(A, float(0.0894841775)), mul(B, float(1.291485548))));
  const cube = (x: TSLNode): TSLNode => mul(mul(x, x), x);
  const l = cube(lp);
  const m = cube(mp);
  const s = cube(sp);
  const lin = (cl: number, cm: number, cs: number): TSLNode =>
    add(add(mul(l, float(cl)), mul(m, float(cm))), mul(s, float(cs)));
  const clamp01 = (c: TSLNode): TSLNode => max(float(0), min(float(1), c));
  return vec3(
    clamp01(lin(4.0767416621, -3.3077115913, 0.2309699292)),
    clamp01(lin(-1.2684380046, 2.6097574011, -0.3413193965)),
    clamp01(lin(-0.0041960863, -0.7034186147, 1.707614701)),
  );
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
    case 'oklab':
      return { colorNode: oklabToLinearSrgb(e(binding.l), e(binding.a), e(binding.b)), opacityNode: null };
    default:
      return assertNever(binding);
  }
}

function materialDefToMaterial(
  def: MaterialDef,
  ctx: PlanExprContext,
  resolvedTextures: ResolvedTextures,
): MeshBasicNodeMaterial {
  // [LAW:dataflow-not-control-flow] The shading model is a discriminated value;
  //   a switch keeps the addition of a future kind a compile error, not a silent
  //   default.
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
    case 'texturedUnlit': {
      const material = new MeshBasicNodeMaterial();
      const decoded = requireTexture(resolvedTextures, def.texture);
      // Sample the decoded texture across the object's UVs.
      material.colorNode = sampleTexture(decoded, uv());
      return material;
    }
    case 'unlitColorLut': {
      const material = new MeshBasicNodeMaterial();
      const lut = requireTexture(resolvedTextures, def.texture);
      // Sample the 1D color LUT at the per-instance coord (v fixed mid-row). The
      // texels are OKLab triples, so the sampled value runs through the same
      // OKLab→linear sRGB map an `oklab` ColorBinding uses; a `linear`-filtered
      // LUT interpolates *in OKLab* between texels — perceptual, hue-correct.
      const coord = planExprToTSL(def.coord, ctx);
      const sampled = sampleTexture(lut, vec2(coord, float(0.5)));
      material.colorNode = oklabToLinearSrgb(sampled.x, sampled.y, sampled.z);
      return material;
    }
    default:
      return assertNever(def);
  }
}

/**
 * A texture handle the plan references must have been resolved by the loading
 * bridge before realization.
 *
 * [LAW:no-silent-failure] A missing decoded texture is a broken
 *   resolve→realize handoff, surfaced loudly rather than drawn as blank.
 */
function requireTexture(resolved: ResolvedTextures, ref: TextureRef): Texture {
  const texture = resolved.get(ref);
  if (!texture) {
    throw new Error(`scene-plan-realizer: texture '${ref}' was not resolved by the loading bridge before realization`);
  }
  return texture;
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
 * The structural digest of a scene object: the plan slice that determines its
 * realized Three structure (geometry, material, per-instance graphs, count).
 * Texture handles are resolved to their stable `assetId`, so a changed asset
 * busts reuse; every other input is already pure plan data.
 *
 * [LAW:dataflow-not-control-flow] Reuse is decided by comparing these digests as
 *   values, not by a ladder of "did the count change / did the color change"
 *   branches. The continuity tiers (time-pure / config / topology) are emergent
 *   from one equality, not enumerated modes ([LAW:no-mode-explosion]).
 */
function objectFingerprint(plan: ScenePlan, object: SceneObject): string {
  const geometry = requireResource(plan.resources.geometries, object.geometry, 'geometry');
  const material = requireResource(plan.resources.materials, object.material, 'material');
  // A texture-referencing material folds its resolved TextureDef into the digest,
  // so a changed asset or a re-baked LUT busts reuse; an `unlitColor`'s color is
  // already pure plan data.
  const materialKey =
    material.kind === 'unlitColor'
      ? material
      : { ...material, texture: requireResource(plan.resources.textures, material.texture, 'texture') };
  return JSON.stringify({ geometry, material: materialKey, instancing: object.instancing });
}

/**
 * The structural digest of a stateful cell — the "payload/cardinality/count" a
 * reinstall compares to decide whether the running value can be carried. Only the
 * storage's structural class is folded in: the value carries across a changed
 * `init` (which only seeds) or a tweaked `update` (a live rate change), but a
 * changed cardinality/count is different storage, so it must reseed.
 *
 * [LAW:one-source-of-truth] Continuity is decided by this derived digest under the
 *   authored `StateRef`, not by a second stored identity.
 */
function stateFingerprint(def: StateDef): string {
  return JSON.stringify(def.cardinality);
}

/** Allocate a fresh storage cell seeded from the state's init. */
function buildStateCell(def: StateDef): InputUniform {
  switch (def.cardinality.kind) {
    case 'scalar':
      return uniform(def.init);
    case 'perInstance':
      // Per-instance state (a per-dot integrator) rides an instance buffer, not a
      // scalar uniform; its realization is the deferred follow-up. Reject it loudly
      // rather than silently realizing it as one shared scalar. [LAW:no-silent-failure]
      throw new Error(
        'scene-plan-realizer: per-instance state storage is not yet realized (this slice ships scalar state only)',
      );
    default:
      return assertNever(def.cardinality);
  }
}

/** A cell whose running value could not be carried across a structural edit. */
interface StateReseed {
  readonly ref: StateRef;
  readonly from: string;
  readonly to: string;
}

/**
 * Reconcile the plan's stateful cells against the previous install's live cells.
 * The reuse rule mirrors object reuse: same authored `StateRef` AND identical
 * structural fingerprint → carry the live cell (its running value survives); a new
 * ref seeds from init; a same-ref fingerprint change is a structure-changing edit
 * that cannot carry the old value, so it reseeds and is reported as a loud
 * {@link StateReseed} rather than silently resetting.
 *
 * [LAW:dataflow-not-control-flow] Carry-vs-reseed is a derivation from fingerprint
 *   equality, not a toggle or mode. [LAW:no-silent-failure] A forced reseed is
 *   surfaced, never a silent reset that looks like continuity.
 */
function reconcileStates(
  prev: ReadonlyMap<StateRef, RealizedState> | undefined,
  plan: ScenePlan,
): { states: Map<StateRef, RealizedState>; reseeds: readonly StateReseed[] } {
  const states = new Map<StateRef, RealizedState>();
  const reseeds: StateReseed[] = [];
  for (const [ref, def] of Object.entries(plan.resources.states) as [StateRef, StateDef][]) {
    const fingerprint = stateFingerprint(def);
    const existing = prev?.get(ref);
    if (existing && existing.fingerprint === fingerprint) {
      // Carry: keep the running value; refresh the update rule so a tweaked
      // increment (a live edit that is not structural) takes effect immediately.
      states.set(ref, { uniform: existing.uniform, fingerprint, update: def.update });
      continue;
    }
    if (existing) {
      reseeds.push({ ref, from: existing.fingerprint, to: fingerprint });
    }
    // A reseed replaces the cell with a fresh uniform node. An object that reads
    // this cell must therefore rebuild to capture the new node — for scalar state
    // the fingerprint is constant, so a reseed never co-occurs with object reuse.
    // The per-instance follow-up (where the fingerprint carries a count) must fold
    // a referenced cell's fingerprint into objectFingerprint so a reseed forces
    // that object's rebuild. [LAW:one-source-of-truth]
    states.set(ref, { uniform: buildStateCell(def), fingerprint, update: def.update });
  }
  return { states, reseeds };
}

/** Release every GPU-backed resource a realized object allocated. */
function disposeObject(object: RealizedObject): void {
  object.mesh.geometry.dispose();
  (object.mesh.material as Material).dispose();
  object.mesh.dispose();
}

/**
 * Build the live Three object for one plan `SceneObject` against the shared
 * input-uniform nodes. The per-instance transform/color are TSL graphs that
 * capture those uniform nodes, so placement is computed on the GPU from
 * intrinsics and runtime inputs — no per-instance CPU payload bag.
 */
function buildObject(
  ref: SceneObjectRef,
  plan: ScenePlan,
  object: SceneObject,
  inputNodes: Partial<Record<PlanInputChannel, TSLNode>>,
  stateNodes: Partial<Record<StateRef, TSLNode>>,
  resolvedTextures: ResolvedTextures,
): RealizedObject {
  // [LAW:no-silent-failure] A zero/negative count would build a draw that
  //   renders nothing while looking installed; reject it.
  if (object.instancing.count <= 0) {
    throw new Error(
      `scene-plan-realizer: scene object '${ref}' declares non-positive instance count ${object.instancing.count}`,
    );
  }
  const ctx: PlanExprContext = {
    instanceCount: object.instancing.count,
    inputs: inputNodes,
    states: stateNodes,
  };
  const geometry = geometryDefToGeometry(requireResource(plan.resources.geometries, object.geometry, 'geometry'));
  const material = materialDefToMaterial(
    requireResource(plan.resources.materials, object.material, 'material'),
    ctx,
    resolvedTextures,
  );
  material.positionNode = instanceTransformNode(object.instancing.transform, ctx);
  const mesh = new InstancedMesh(geometry, material, object.instancing.count);
  initIdentityInstances(mesh);
  return { mesh, fingerprint: objectFingerprint(plan, object) };
}

/** The de-duplicated scene-object refs the plan actually draws, in draw order. */
function drawnObjectRefs(plan: ScenePlan): readonly SceneObjectRef[] {
  const refs: SceneObjectRef[] = [];
  const seen = new Set<SceneObjectRef>();
  for (const draw of plan.render.draws) {
    if (seen.has(draw.object)) continue;
    seen.add(draw.object);
    refs.push(draw.object);
  }
  return refs;
}

/**
 * Reconcile a `ScenePlan` into a Three scene graph, reusing the live objects of
 * `prev` whose authored identity and structure are unchanged. This is the
 * continuity seam: an equivalent reinstall keeps every Three object (and its
 * compiled TSL graph and instance buffers) untouched, so time-pure animation —
 * driven by the preserved input uniforms — never restarts or drops a frame. A
 * `prev` of `null` is the from-scratch install (nothing to reuse).
 *
 * `resolvedTextures` carries the textures the loading bridge has already decoded
 * (keyed by plan handle); this function reads them but loads nothing — it stays
 * pure aside from owning the Three object lifecycle it is explicitly given.
 *
 * [LAW:one-source-of-truth] Input-uniform nodes AND stateful cells are preserved
 *   across installs by handle, so a reused object's captured uniform/cell is the
 *   same node the renderer writes each frame — one live node per channel/cell, not
 *   a fresh set per install that would orphan reused graphs.
 * [LAW:no-silent-failure] An incompatible version, dangling handle, or
 *   non-positive count fails loudly during reconciliation; a stateful cell whose
 *   structure changed under a live edit reseeds loudly rather than silently.
 *
 * Stateful continuity: a stateful cell (an accumulator's running value) is carried
 *   across the diff exactly like an input uniform — same authored `StateRef` and
 *   identical structural fingerprint keeps the live cell, so a hot edit that leaves
 *   the state's structure unchanged never resets the accumulation. A fingerprint
 *   change (different storage cardinality/count) is the explicit point the cell
 *   reseeds from init; that decision is surfaced (`console.warn`), never silent.
 *
 * @throws if the plan version is incompatible, a referenced resource (including
 *   an unresolved texture) is missing, or an object declares a non-positive
 *   instance count.
 */
export function reconcileScenePlan(
  prev: RealizedScene | null,
  plan: ScenePlan,
  resolvedTextures: ResolvedTextures = new Map(),
): RealizedScene {
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
      inputs.set(channel, prev?.inputs.get(channel) ?? uniform(0));
    }
  }
  const inputNodes: Partial<Record<PlanInputChannel, TSLNode>> = {};
  for (const [channel, node] of inputs) {
    inputNodes[channel] = node;
  }

  // Carry stateful cells across the diff; a structure-changing edit reseeds loudly.
  const { states, reseeds } = reconcileStates(prev?.states, plan);
  for (const reseed of reseeds) {
    // [LAW:no-silent-failure] A running value reset by a structural edit is a
    //   notable continuity event, surfaced — not a silent restart.
    console.warn(
      `scene-plan-realizer: stateful cell '${reseed.ref}' reseeded from init — its storage structure changed (${reseed.from} → ${reseed.to}), so the running value could not be carried across the edit`,
    );
  }
  const stateNodes: Partial<Record<StateRef, TSLNode>> = {};
  for (const [ref, cell] of states) {
    stateNodes[ref] = cell.uniform;
  }

  const scene = prev?.scene ?? new Scene();
  const objects = new Map<SceneObjectRef, RealizedObject>();

  for (const ref of drawnObjectRefs(plan)) {
    const object = requireResource(plan.objects, ref, 'scene object');
    const fingerprint = objectFingerprint(plan, object);
    const existing = prev?.objects.get(ref);
    if (existing && existing.fingerprint === fingerprint) {
      // Reuse: same authored identity, identical structure → keep the live mesh.
      objects.set(ref, existing);
      continue;
    }
    const built = buildObject(ref, plan, object, inputNodes, stateNodes, resolvedTextures);
    if (existing) {
      scene.remove(existing.mesh);
      disposeObject(existing);
    }
    scene.add(built.mesh);
    objects.set(ref, built);
  }

  // Dispose prev objects the new plan no longer draws (a replaced ref is present
  // in `objects` with its rebuilt object, so it is not double-disposed here).
  if (prev) {
    for (const [ref, object] of prev.objects) {
      if (!objects.has(ref)) {
        scene.remove(object.mesh);
        disposeObject(object);
      }
    }
  }

  const cameraFingerprint = JSON.stringify(plan.render.camera);
  const camera =
    prev && prev.cameraFingerprint === cameraFingerprint ? prev.camera : buildCamera(plan.render.camera);

  return {
    scene,
    camera,
    cameraFingerprint,
    objects,
    inputs,
    states,
    advanceStates(values: RuntimeInputChannelValues): void {
      if (states.size === 0) return;
      // Snapshot every cell's current value first, so all updates read one
      // consistent prior frame even when a cell's rule reads a sibling cell.
      const snapshot: Record<StateRef, number> = {};
      for (const [ref, cell] of states) {
        snapshot[ref] = cell.uniform.value;
      }
      const nexts: Array<[RealizedState, number]> = [];
      for (const cell of states.values()) {
        nexts.push([cell, evalPlanExpr(cell.update, { channels: values, states: snapshot })]);
      }
      for (const [cell, value] of nexts) {
        cell.uniform.value = value;
      }
    },
    dispose() {
      for (const object of objects.values()) {
        disposeObject(object);
      }
      scene.clear();
    },
  };
}

/**
 * Realize a `ScenePlan` into a fresh Three scene graph (no reuse). The
 * from-scratch case of {@link reconcileScenePlan}; the renderer uses it for the
 * first install and tests use it where reuse is irrelevant.
 *
 * @throws if the plan version is incompatible, a referenced resource (including
 *   an unresolved texture) is missing, or an object declares a non-positive
 *   instance count.
 */
export function realizeScenePlan(
  plan: ScenePlan,
  resolvedTextures: ResolvedTextures = new Map(),
): RealizedScene {
  return reconcileScenePlan(null, plan, resolvedTextures);
}

function assertNever(value: never): never {
  throw new Error(`scene-plan-realizer: unhandled variant: ${JSON.stringify(value)}`);
}
