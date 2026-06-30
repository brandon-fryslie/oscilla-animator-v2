/**
 * src/render/scene-plan/index.ts
 *
 * Public surface of the backend-neutral ScenePlan — the primary compiler→
 * renderer assembly target for the Three migration.
 *
 * Producers: the compiler assembler (oscilla-pillars-cleanup-ulu.3).
 * Consumers: the Three-backed renderer (oscilla-pillars-cleanup-ulu.2).
 *
 * See design-docs/three-migration-scene-plan.md for how this replaces
 * PipelineInstallPayload without dual ownership.
 */

// Resource handles.
export type {
  GeometryRef,
  MaterialRef,
  TextureRef,
  SceneObjectRef,
  ComputeResourceRef,
  PostChainRef,
} from './refs';
export {
  geometryRef,
  materialRef,
  textureRef,
  sceneObjectRef,
  computeResourceRef,
  postChainRef,
} from './refs';

// Per-value expressions.
export type {
  PlanExpr,
  PlanInputChannel,
  PlanIntrinsic,
  PlanUnaryOp,
  PlanBinaryOp,
} from './expr';
export {
  konst,
  input,
  intrinsic,
  floor,
  sin,
  cos,
  negate,
  fract,
  hash,
  add,
  sub,
  mul,
  div,
  mod,
  step,
} from './expr';

// Plan structure.
export type {
  ScenePlan,
  ScenePlanResources,
  SceneObject,
  InstancingPlan,
  TransformBinding,
  RenderPlan,
  CameraPlan,
  DrawItem,
  RenderTarget,
  GeometryDef,
  MaterialDef,
  ColorBinding,
  TextureDef,
  ComputeResourceDef,
  PostChainDef,
} from './plan';
export { SCENE_PLAN_VERSION, defineScenePlan } from './plan';

// Pre-install asset-reference validation.
export type { PlanAssetIssue } from './asset-validation';
export { validatePlanAssets, formatPlanAssetIssue, formatPlanAssetIssues } from './asset-validation';
