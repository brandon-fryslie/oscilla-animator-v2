/**
 * src/pillars/scene/port-compatibility.ts
 *
 * The typed algebra that answers "can a value of port kind A feed a port of kind
 * B?" for the Three-native block library. It reads only the declared port value
 * vocabulary (`SceneValueKind`) and the capability matrix — never a ScenePlan, a
 * block's `contribute()` body, or the renderer.
 *
 * Scope authority: design-docs/three-migration-capability-matrix.md §2 (port
 *   value kinds → ScenePlan data concept) and §6 (deferred capability register).
 *
 * [LAW:types-are-the-program] Compatibility is a discriminated *value*, not a
 *   branch probe: every wire verdict is one `PortCompatibility`, so consumers
 *   stay exhaustive and a new value kind forces a decision here, not a silent
 *   fall-through at every callsite.
 * [LAW:dataflow-not-control-flow] Which verdict a wire gets is decided by data
 *   (the realization record and the route table), never by special-casing a
 *   block type.
 */

import type { SceneValueKind } from './scene-block';

/**
 * The capability matrix §2 "Status" column, as data: which port value kinds have
 * a ScenePlan realization today. `mask` is the sole deferred kind — a per-instance
 * visibility predicate with no plan variant minted yet, so wiring it has no
 * lowering target (matrix §6).
 *
 * [LAW:one-source-of-truth] This record is the code form of the matrix's
 *   Realized/Deferred column; the prose doc projects it, not the reverse.
 * [LAW:types-are-the-program] `Record<SceneValueKind, …>` is total: adding a
 *   value kind is a compile error here until it is classified realized/deferred.
 */
export const SCENE_VALUE_REALIZATION: Readonly<
  Record<SceneValueKind, 'realized' | 'deferred'>
> = {
  instanceBundle: 'realized',
  geometry: 'realized',
  materialShell: 'realized',
  texture: 'realized',
  camera: 'realized',
  color: 'realized',
  scalar: 'realized',
  mask: 'deferred',
};

/**
 * A declared bridge from one port value kind to another via an explicit adapter
 * block the user must insert. Adaptation is never an implicit coercion: a wire
 * that needs it is a diagnostic naming the adapter, not a silent conversion.
 *
 * The native adaptation vocabulary was investigated (brkm.1) and is empty by
 * decision: broadcast and unit conversion are unrepresentable in this model (no
 * cardinality axis, no unit type), color-space difference is resolved inside
 * color-consuming blocks (not a wire coercion), and cross-domain remap is a
 * deferred ScenePlan binding owned by the demo that needs it — not a route. This
 * table grows only if a future ticket cuts a real adapter block to register here.
 */
export interface AdaptationRoute {
  readonly from: SceneValueKind;
  readonly to: SceneValueKind;
  /** The adapter block type a user inserts to bridge `from` → `to`. */
  readonly via: string;
}

/**
 * The native adaptation routes. Empty today: the first block set wires only
 * like-for-like kinds, and no value kind is silently coercible.
 *
 * [LAW:carrying-cost] A named slot, not built machinery — documenting that
 *   adaptation is route-driven costs nothing; minting speculative routes before
 *   a real adapter block exists would add carrying cost with no caller.
 */
export const NATIVE_ADAPTATION_ROUTES: readonly AdaptationRoute[] = [];

/**
 * The verdict of comparing a source output value kind (`from`) against a target
 * input value kind (`to`). Directional: a route bridges `from` → `to`, not the
 * reverse.
 */
export type PortCompatibility =
  | { readonly kind: 'compatible' }
  | {
      readonly kind: 'adaptationNeeded';
      readonly from: SceneValueKind;
      readonly to: SceneValueKind;
      readonly via: string;
    }
  | { readonly kind: 'mismatch'; readonly from: SceneValueKind; readonly to: SceneValueKind }
  | { readonly kind: 'unsupported'; readonly value: SceneValueKind };

/**
 * Compare a source output kind against a target input kind.
 *
 * A deferred kind on either side wins first: it has no ScenePlan realization, so
 * the wire cannot lower regardless of whether the kinds match. Then like-for-like
 * is compatible; an unlike pair is bridgeable iff a route declares an adapter;
 * otherwise it is a hard mismatch.
 *
 * [LAW:no-defensive-null-guards] Variability is in the returned value, not in
 *   whether downstream code runs — callers match on the verdict.
 */
export function compareScenePorts(
  from: SceneValueKind,
  to: SceneValueKind,
  routes: readonly AdaptationRoute[] = NATIVE_ADAPTATION_ROUTES,
): PortCompatibility {
  if (SCENE_VALUE_REALIZATION[to] === 'deferred') return { kind: 'unsupported', value: to };
  if (SCENE_VALUE_REALIZATION[from] === 'deferred') return { kind: 'unsupported', value: from };
  if (from === to) return { kind: 'compatible' };
  const route = routes.find((r) => r.from === from && r.to === to);
  if (route) return { kind: 'adaptationNeeded', from, to, via: route.via };
  return { kind: 'mismatch', from, to };
}
