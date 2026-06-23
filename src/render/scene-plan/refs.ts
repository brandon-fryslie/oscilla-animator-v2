/**
 * src/render/scene-plan/refs.ts
 *
 * Backend-neutral resource handles for the compiled ScenePlan.
 *
 * Scope source: design-docs/three-fork-integration-proposal.md §4.3
 * Ownership/seam canon: design-docs/three-migration-backend-canon.md
 *
 * A *ref* is a stable, opaque handle that the compiled plan uses to name a
 * resource. It is a foreign key into one of the ScenePlan's resource tables —
 * never a renderer object.
 *
 * [LAW:locality-or-seam] These handles ARE the compiler→renderer seam. The
 *   compiler (ulu.3) mints them; the renderer (ulu.2) resolves them to backend
 *   objects. Neither side sees the other's internals.
 * [LAW:types-are-the-program] Each ref is branded, so a GeometryRef cannot be
 *   passed where a MaterialRef is wanted even though both erase to `string`.
 *   The illegal "wrong handle" state is unrepresentable, not guarded at runtime.
 * [LAW:locality-or-seam] A ref carries identity only — no Three UUID, class,
 *   or scene-graph object (canon §"Non-Goals"; proposal §4.5).
 */

import type { Brand } from '../../core/ids';

/** Handle for a geometry resource (e.g. a rectangle or point primitive). */
export type GeometryRef = Brand<string, 'GeometryRef'>;

/** Handle for a material resource (e.g. an unlit color material). */
export type MaterialRef = Brand<string, 'MaterialRef'>;

/** Handle for a texture resource, resolved from an asset by the asset bridge. */
export type TextureRef = Brand<string, 'TextureRef'>;

/** Handle for a placed renderable (geometry + material + instancing). */
export type SceneObjectRef = Brand<string, 'SceneObjectRef'>;

/** Handle for a compute resource (storage buffer / compute job). */
export type ComputeResourceRef = Brand<string, 'ComputeResourceRef'>;

/** Handle for a post-processing chain. */
export type PostChainRef = Brand<string, 'PostChainRef'>;

// ---------------------------------------------------------------------------
// Factory functions — zero-cost casts.
// ---------------------------------------------------------------------------

// [LAW:single-enforcer] Refs are minted only through these constructors, so the
// brand is applied in exactly one place per resource kind. The cast is the
// single point where a raw string becomes a typed handle.

export const geometryRef = (id: string): GeometryRef => id as GeometryRef;
export const materialRef = (id: string): MaterialRef => id as MaterialRef;
export const textureRef = (id: string): TextureRef => id as TextureRef;
export const sceneObjectRef = (id: string): SceneObjectRef => id as SceneObjectRef;
export const computeResourceRef = (id: string): ComputeResourceRef => id as ComputeResourceRef;
export const postChainRef = (id: string): PostChainRef => id as PostChainRef;
