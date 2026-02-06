Below is the canonical, enforcement-grade specification for the Branch/History axis (extent.branch) that keeps your “CanonicalType is the only type authority” promise intact, while covering: state blocks, physics, preview, undo/redo/checkpoints, plus the other cases you’re almost guaranteed to hit.

⸻

0. Purpose

extent.branch is the version-line / timeline identity of a value.

It answers: “which history stream does this value belong to?”
•	It is not temporality. Temporality answers “continuous vs discrete evaluation clock.”
•	It is not statefulness. State blocks create memory; branch says which memory line that memory belongs to.
•	It is not UI undo/redo implementation detail. Undo/redo is one consumer of branch semantics.

Branch exists to prevent silent corruption where values from different “worldlines” get mixed.

⸻

1. Core requirements
    1.	Every value has a branch identity, carried only in CanonicalType.extent.branch.
    2.	Branch is enforced at a single frontend validation point (same as your other axis enforcement).
    3.	Only explicit ops can change branch, and those ops must be visible and typed.
    4.	The system supports multiple concurrent branches (preview vs committed; physics prediction vs authoritative; speculative edits; cached evaluation).
    5.	Branch identity must be stable under serialization (patch save/load, inspector snapshots, undo/redo).

⸻

2. Types

2.1 IDs (core/ids.ts)

export type BranchId = Brand<string, 'BranchId'>;
export const branchId = (s: string) => s as BranchId;

2.2 Branch axis domain (core/canonical-types.ts)

Replace the placeholder BranchValue = { kind:'default' } with:

export type BranchSpace =
| { readonly kind: 'main' }                          // committed, authoritative
| { readonly kind: 'preview'; readonly id: BranchId } // ephemeral evaluation lane
| { readonly kind: 'checkpoint'; readonly id: BranchId }
| { readonly kind: 'undo'; readonly id: BranchId }    // materialized snapshot line
| { readonly kind: 'speculative'; readonly id: BranchId } // e.g. solver guess, what-if
| { readonly kind: 'prediction'; readonly id: BranchId }  // physics predicted line
| { readonly kind: 'replay'; readonly id: BranchId };     // deterministic playback line

export type BranchValue =
| { readonly kind: 'default' } // canonicalizes to main
| { readonly kind: 'branch'; readonly space: BranchSpace };

2.3 Canonicalization rule
•	BranchValue.default must canonicalize to { kind:'branch', space:{ kind:'main' } }.

No “default drift.”

⸻

3. Semantic model

3.1 What “main” means

main is the authoritative, user-committed timeline.

3.2 What “preview” means

A preview branch is a non-committed evaluation line used for:
•	“scrubbing” parameters without committing
•	hover previews / “try this block here”
•	ghost edits
•	temporarily-inserted adapters/lenses during UI affordances (if you choose)

Preview branches must be explicitly created and destroyed by UI/runtime policy, but the type system sees them as real.

3.3 What “undo/checkpoint” means

A checkpoint/undo branch is a named snapshot line:
•	Checkpoints are explicit user milestones
•	Undo branches can represent the stack/history states (or you can map undo to checkpoints and keep one concept)

3.4 Prediction/speculative/replay

These are “foreseeable” because you already want physics and deterministic replay:
•	prediction: forward-simulated from a past authoritative state
•	speculative: alternative edits or solver guesses that may be accepted/rejected
•	replay: deterministic evaluation of a recorded history stream, potentially isolated from live state

⸻

4. Hard rules (branch invariants)

Rule B1: Branch-preserving by default

For any operator not declared as a “branch op”:
•	Inputs must have unifiable branch.
•	Output branch is that unified branch.

This applies to:
•	kernels
•	maps/zips
•	reduces
•	adapters
•	lenses
•	state ops (hold/delay/integrate/slew/etc.)
•	time intrinsics
•	camera intrinsics

Rule B2: No implicit cross-branch mixing

No operator may read a value from branch X and combine it with branch Y unless it is an explicit branch op.

Rule B3: State is branch-scoped

Any stateful block’s memory is indexed by branch identity:
•	If you evaluate the same patch on main and preview:p1, it has separate memory.
•	This prevents preview from polluting main and makes replay sane.

Rule B4: Branch-changing requires explicit ops

Only the branch operations in §6 may change extent.branch.

⸻

5. Unification behavior

Branch is an axis with Axis<T> like your others.

Instantiated equality

Two instantiated branch values unify iff they canonicalize to the exact same BranchSpace (including same ids).

Var behavior

var unifies normally; but branch vars should resolve early in frontend:
•	UI environment supplies “current branch” as a constraint, so most values become instantiated quickly.

⸻

6. Canonical branch operations

These are the only legal ways to change branch.

6.1 BranchOrigin (environment pin)

This is conceptual, not necessarily a user block.

A compilation/evaluation context must supply a constraint:
•	“this patch evaluation is occurring under branch = X”

You can implement as:
•	a hidden constraint fed into type inference, or
•	an implicit external channel with a fixed branch type

But the invariant is: there is always a branch anchor.

6.2 ForkBranch

Creates a new branch line derived from another.

Type contract
•	Input: any type T with branch A
•	Output: same T but branch B (new BranchId)
•	All other axes identical

This is used for:
•	preview branches
•	speculative branches
•	prediction branches
•	replay branches

6.3 MergeBranch (restricted)

Merging histories is where corruption usually happens, so this must be highly constrained.

You have two safe primitives:

MergeBranchSelect (safe)
Pick one of two branches’ values based on a control that lives in the target branch.
•	select(cond@B, x@A, y@B) -> @B is forbidden because it pulls x@A into @B.
•	You instead require: select(cond@B, x@B, y@B) -> @B (branch-preserving).

So how do you “merge”? By first explicitly projecting values into B via AdoptBranch (below), with rules.

AdoptBranch (controlled import)
Moves a value from branch A into branch B under explicit semantics.

This is the key building block for “commit preview,” “accept prediction,” etc.

Adopt must be explicit about what happens to stateful interpretations:
•	For pure values: a value is just a value; adopting is fine.
•	For state-dependent values (derived from state ops), adoption is okay, but does not import memory—it imports the computed value only.

Type contract:
•	Input: T@A
•	Output: T@B

But validator adds constraints:
•	Only allowed at declared boundaries (see §7 policies).
•	Often only allowed for certain payload/unit categories (you decide).

6.4 CommitPreview (specialized Adopt)

A UX-level action maps to a typed operation:
•	preview → main for selected subgraph outputs

In types it’s just AdoptBranch(previewId -> main).

6.5 CheckoutCheckpoint / ReplayFromCheckpoint

Also expressible with Fork + environment branch pin:
•	ForkBranch(checkpointId -> replayId)
•	Evaluate under replayId

⸻

7. Branch policy layer (still enforced, but not in CanonicalType)

CanonicalType enforces identity and prevents implicit mixing. You still need a policy that answers “when is Adopt/Merge allowed?”

This policy belongs in the frontend validator as a rule set, not scattered ad-hoc.

7.1 Allowed imports table (default safe policy)
•	preview -> main: allowed only on explicit commit boundaries
•	speculative -> main: allowed only if speculative branch was derived from main and still compatible
•	prediction -> main: allowed only for physics reconciliation paths (see below)
•	replay -> main: generally not allowed (replay should be observational), unless explicitly “apply replay result” operation exists

7.2 No implicit state import

Even if you adopt a value computed using stateful ops, you do not import that branch’s internal memory. If you want to import memory, you must add an explicit “StateSnapshotImport” primitive (see §10.3).

⸻

8. How your specific use cases map to branch types

8.1 State blocks (existing)

Requirement: state memory must be branch-scoped.

Type implications:
•	State op preserves branch.
•	Runtime memory key includes branch identity.

So ValueExprState type includes branch in CanonicalType, and runtime indexing includes branchKey.

8.2 Physics

Physics typically needs at least:
•	authoritative state (main)
•	predicted state (prediction:p1)
•	sometimes rollback/reconciliation (server/client style)

Canonical mapping:
•	Physics simulation runs in prediction:<id> derived from main.
•	When reconciling:
•	either you adopt predicted positions/velocities into main (explicit), or
•	you keep prediction for preview-only display.

Type examples:
•	pos: vec3@main (world, continuous, many(instance), branch=main)
•	posPred: vec3@prediction:p1
•	posRecon: vec3@main produced only by AdoptBranch(prediction:p1 -> main) within an allowed reconciliation op.

8.3 Preview

Preview is just preview:<id>.
•	UI can fork the entire patch evaluation or only a subgraph.
•	Any attempt to wire preview value into main without Adopt must fail.

8.4 Undo/redo/checkpoints

Two workable models:

Model A: Undo as checkpoints (recommended)
•	Each checkpoint is a saved patch state + continuity snapshot.
•	Undo/redo manipulates which checkpoint is currently “checked out,” then evaluation runs on main.

Branch types:
•	checkpoint:<id> used for persistent saved state references.
•	replay:<id> if you want to evaluate older states without switching main.

Model B: Undo as branch line
•	undo:<id> represents the currently checked-out undo state.
•	Committing undo selection back to main is AdoptBranch(undo:id -> main) plus patch-state switch.

Model A is simpler; both are supported by the type system.

⸻

9. Enforcement: the frontend branch validation pass

This is the canonical enforcement point, like your axis validation.

What it checks

For each op/expr:
1.	Canonicalize branch (default -> main).
2.	If op is not a branch op, enforce B1 (all inputs unify, output preserves).
3.	If op is a branch op (Fork/Adopt/etc.), enforce its contract:
•	Fork introduces new branch id (must be configured)
•	Adopt changes branch (must be configured)
4.	Enforce policy table constraints for Adopt/Merge sites (optional but recommended as “hard rules” if you want no corruption).

Output diagnostics

Branch mismatch diagnostics must include:
•	expected branch
•	actual branch
•	suggested fix: insert AdoptBranch or evaluate subgraph under same branch

⸻

10. Additional foreseeable use cases (you will hit these)

10.1 Multi-view rendering pipelines

If you render the same world with different camera/view stacks, you’ll want:
•	same branch, different perspective ids
Branch stays same; perspective differs.

10.2 Cached compilation/evaluation

You may want to cache intermediate values per branch. Branch identity is the cache key; no other ad-hoc tagging is needed.

10.3 State snapshot import/export (advanced but foreseeable)

Undo/redo and checkpointing often want to restore not just patch wiring, but the continuity/state memory.

Do not encode this as “branch merge.” Make explicit ops:
•	StateSnapshotExport(branch -> blobId)
•	StateSnapshotImport(blobId -> branch)

These are runtime-level, but branch types prevent accidentally importing preview memory into main.

10.4 Networked collaboration (foreseeable)

Each user editing concurrently is basically:
•	user branch lines that later merge into main
Branch axis becomes your safety rail against mixing partial edits.

10.5 Deterministic replay / recording

Replay should run in replay:<id>, and you should forbid direct replay -> main adoption unless explicitly desired.

⸻

11. Canonical “done” conditions for Branch axis

Branch is real only if:
1.	extent.branch is fully instantiated (after canonicalization) on all typed values.
2.	A single frontend pass rejects cross-branch mixing for all non-branch ops.
3.	All stateful runtime storage is keyed by branch.
4.	Only explicit branch ops can change branch.
5.	Serialization keeps BranchId stable and diagnostics catch dangling ids.

⸻

12. Minimal concrete implementation set (types + ops)

Types to add
•	PerspectiveId (you already did for perspective; analogous)
•	BranchId
•	BranchSpace, BranchValue (replace placeholder)
•	Canonicalization helpers

Ops (IR-level)

Even if you don’t lower into unified ValueExpr yet, these must exist conceptually and be enforceable:
•	BranchFork { from: BranchId|main, to: BranchId, mode: preview|speculative|prediction|replay }
•	BranchAdopt { from: BranchId, to: BranchId|main }

You can represent them as blocks or as special IR ops; either way, they must be explicit.

⸻

This branch specification gives you a mechanically checkable way to isolate preview, physics prediction, replay, and undo/redo histories without inventing second type systems or leaking ad-hoc flags into the runtime.