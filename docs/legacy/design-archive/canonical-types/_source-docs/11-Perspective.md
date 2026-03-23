Below is a canonical, complete, enforcement-grade specification for the Perspective axis in your CanonicalType system.

⸻

0. Scope and goal

Goal

Make “what space this value lives in” a first-class, type-checked contract so that:
•	World-space values cannot silently mix with view-space or screen-space values.
•	Camera/view operations that depend on a particular viewpoint are forced to state that dependency.
•	Generic math stays space-preserving by default.
•	The only way to change spaces is through explicit, typed transforms (not adapters, not implicit conventions).

Non-goals
•	Encoding projection mode (orthographic vs perspective) in the type system. Projection mode is a property of the view configuration; the type system tracks space identity, not projection method.

⸻

1. Definitions

Perspective axis meaning

extent.perspective describes the coordinate frame / semantic space in which the value is meaningful.

It does not describe how something is rendered; it describes the space contract required for correctness.

Space categories
•	World space: canonical global space.
•	View space: camera/view local space for a specific view.
•	Screen space: normalized screen/UI space associated with a specific view (if you model UI overlays and post effects).

⸻

2. Core types (authoritative)

IDs (core/ids.ts)

You must have a stable identity for a viewpoint:

export type PerspectiveId = Brand<string, 'PerspectiveId'>;
export const perspectiveId = (s: string) => s as PerspectiveId;

Perspective axis domain (core/canonical-types.ts)

export type SpaceValue =
| { readonly kind: 'world' }
| { readonly kind: 'view'; readonly id: PerspectiveId }
| { readonly kind: 'screen'; readonly id: PerspectiveId };

export type PerspectiveValue =
| { readonly kind: 'default' }                  // aliases to world for v0 canonicalization
| { readonly kind: 'space'; readonly space: SpaceValue };

Canonicalization rule

Before any unification/validation, normalize:
•	PerspectiveValue.default must canonicalize to { kind:'space', space:{ kind:'world' } }.

This removes “default drift” and makes equality/unification crisp.

⸻

3. Semantic model

What perspective applies to

Perspective applies to any payload whose meaning depends on space (positions, directions, UVs, screen coords, rays, camera intrinsics, etc). You are not required to annotate payload kinds differently; the axis provides the contract.

What projection mode does

Projection mode changes the mapping from world↔view↔screen, but does not change which space a value belongs to. Therefore it must not be modeled in the axis.

⸻

4. Unification and inference rules

Perspective must behave like a normal axis in your solver: it can be var or inst.

Equality

Two instantiated perspective values unify if and only if they canonicalize to the same SpaceValue (world/view(id)/screen(id)).

Var unification
•	var can unify with inst (becoming that inst).
•	var with var unions as usual.

No structural subtyping

There is no notion that view-space is “compatible” with world-space. Compatibility is only via explicit transforms.

⸻

5. Propagation rules (how perspective flows)

These rules are the “default physics” of the axis: they must be enforced consistently across IR building, type inference, and validation.

Rule P1: Space-preserving operators

For any op/kind that is not explicitly declared as a space transform:
•	All inputs must have unifiable perspective.
•	Output perspective is that unified perspective.

This applies to:
•	arithmetic, comparisons, interpolations, trigonometric kernels, noise, maps/zips, reduce ops
•	state ops (hold/delay/integrate/slew/preserve/crossfade/project) unless you explicitly define a space transform state op (don’t)

Rule P2: Space-originating intrinsics

Intrinsics that produce values defined by a view must pin perspective to a specific PerspectiveId.

Examples:
•	uv, screenPos, pixelCoord, ndcCoord → screen(viewId)
•	viewDir, cameraForward, cameraRight, cameraUp → view(viewId) (or world, depending on definition, but must be explicit and consistent)
•	Any camera matrix output must be typed such that its intended space usage is enforced (see §9).

Rule P3: Space transforms are the only perspective changers

Only these ops may change extent.perspective:
•	WorldToView(viewId)
•	ViewToWorld(viewId)
•	ViewToScreen(viewId) (optional if you model it)
•	ScreenToView(viewId) (optional if you model it)

No other op can change perspective.

⸻

6. Required transform blocks and their type contracts

These are not adapters. They are explicit transforms that must be visible and user-insertable (and optionally auto-insertable only if you treat them as “obvious,” but that’s a UX policy; technically they are transforms).

Let T denote a CanonicalType.

T1: WorldToView(viewId)
•	Input: perspective = world
•	Output: perspective = view(viewId)
•	All other axes must be preserved unless explicitly specified (cardinality, temporality, binding, branch).

T2: ViewToWorld(viewId)
•	Input: view(viewId)
•	Output: world

T3: ViewToScreen(viewId) (if used)
•	Input: view(viewId)
•	Output: screen(viewId)
•	This is only valid for payloads you define as screen-mappable; type system doesn’t need to encode that, but the validation pass may.

T4: ScreenToView(viewId) (if used)
•	Input: screen(viewId)
•	Output: view(viewId)

Transform invariants
•	The PerspectiveId is part of the type contract: view(A) does not unify with view(B).
•	A transform must statically specify its viewId (config parameter on the block). It must not be a dynamic runtime string.

⸻

7. Axis enforcement (single canonical enforcement point)

You already decided you want a frontend validation pass as the belt buckle. Perspective enforcement must be included there.

Validator responsibilities

Given fully typed IR (every value/expr/port has a concretized CanonicalType), the validator must:
1.	Canonicalize perspective values (default → world) everywhere before checks.
2.	For every op, apply one of:
•	Space-preserving check (Rule P1), or
•	Space-originating pin check (Rule P2), or
•	Transform check (Rule P3/T1–T4)
3.	Emit a single consolidated diagnostic category for perspective mismatches (so UI can drive adapter/transform insertion menus).

What constitutes a perspective violation
•	Any op (not a transform) with multiple inputs whose perspectives do not unify.
•	Any op declared as “pins perspective” whose output type does not match its declared pinned perspective.
•	Any transform op whose input perspective does not match its required source space.

⸻

8. Interaction with other axes (hard rules)

Perspective must be orthogonal to cardinality/temporality/branch/binding. The enforcement rules are:
•	Perspective is preserved by default across all ops except the explicit transforms.
•	Perspective must unify across all inputs for ops that combine values.
•	Perspective does not implicitly change across branch/history. Branch changes do not change perspective and vice versa.
•	Perspective does not implicitly change across time/state. State ops preserve perspective.

⸻

9. Camera/view configuration: where it lives and how it binds

View definition registry (runtime/compiler boundary)

You must have a canonical mapping from PerspectiveId to a view configuration object.

Minimum required fields:
•	id: PerspectiveId
•	projectionMode: 'orthographic' | 'perspective' (or whatever)
•	viewMatrix, projMatrix, viewProjMatrix (or derivables)
•	viewport sizing info (for screen space mapping)

This is not type information; it’s configuration used by transforms and intrinsics.

Binding rule

Any block/op that uses camera/view parameters must reference a PerspectiveId explicitly (block param), and its outputs must reflect that PerspectiveId in extent.perspective.

⸻

10. Serialization / stability requirements

Perspective must be stable across:
•	saving/loading patches,
•	undo/redo,
•	compilation snapshots,
•	deterministic replay.

Requirements
•	PerspectiveId must be serializable and stable. It should not be a transient runtime pointer.
•	If a view is deleted/renamed, you must either:
•	migrate IDs (preferred), or
•	leave dangling IDs and emit a frontend diagnostic that blocks backend compilation (acceptable).

⸻

11. UI-facing behavior derived from the type system

Display

Wherever you show type info, include a compact perspective label:
•	world
•	view:<id>
•	screen:<id>

Repair affordances (menu insertion)

When a wire connects incompatible perspectives:
•	The repair menu must offer only the explicit transforms that produce a unifiable perspective (e.g., if source is world and sink expects view:main, propose WorldToView(main)).

This must be driven entirely by CanonicalType (no ad-hoc special casing).

⸻

12. Definition of Done for “Perspective axis is real”

Perspective is “done” (not decorative) only if all of the following are true:
1.	Every typed value/expr/port in the frontend output has a concretized extent.perspective (after canonicalization).
2.	The frontend validation pass rejects perspective-incoherent programs with a consolidated diagnostic.
3.	All multi-input ops unify and preserve perspective (Rule P1) unless explicitly declared as a transform.
4.	All camera/view intrinsics pin perspective to a specific PerspectiveId (Rule P2).
5.	The only code paths that can change perspective are the explicit transforms (Rule P3/T1–T4).
6.	PerspectiveId is stable through serialization and is visible in compilation snapshots for debugging.

⸻

This specification makes “space correctness” a mechanically enforced property of CanonicalType, while cleanly keeping projection mode as view configuration rather than a second, parallel type system.