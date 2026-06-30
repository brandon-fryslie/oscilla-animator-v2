/**
 * src/pillars/scene/index.ts
 *
 * Public surface of the ScenePlan compile path — authored `PillarPatch` lowered
 * to the backend-neutral `ScenePlan` (src/render/scene-plan).
 *
 * Producer of: `ScenePlan` (consumed by the Three-backed renderer, ulu.2).
 * Replaces, for new backend work, `assemblePipelineInstallPayload`
 * (design-docs/three-migration-scene-plan.md).
 */

export { compileScenePlan } from './compile';
export type { SceneCompileResult } from './assemble';

export { ALL_SCENE_BLOCKS } from './blocks';
export {
  buildSceneRegistry,
  defineSceneBlock,
  sceneConfig,
  type SceneBlockDefinition,
  type SceneContribution,
  type SceneDiagnostic,
  type SceneCatalogMetadata,
  type ScenePortDeclaration,
  type ScenePortDirection,
  type SceneValueKind,
  type InstanceBundle,
  type DrawShell,
  type MaterialShell,
  type SceneRegistry,
} from './scene-block';

// Validation & insertability — answer "what can connect here?" and surface
// diagnostics from declared contracts, without running compileScenePlan.
export {
  compareScenePorts,
  SCENE_VALUE_REALIZATION,
  NATIVE_ADAPTATION_ROUTES,
  type AdaptationRoute,
  type PortCompatibility,
} from './port-compatibility';
export {
  validateScenePatch,
  formatSceneDiagnostic,
  type SceneValidation,
  type SceneValidationDiagnostic,
  type SceneEdgeVerdict,
  type ScenePortAddress,
} from './validate';
export {
  connectableScenePorts,
  type ScenePortSelection,
  type ConnectableScenePort,
} from './insertability';
