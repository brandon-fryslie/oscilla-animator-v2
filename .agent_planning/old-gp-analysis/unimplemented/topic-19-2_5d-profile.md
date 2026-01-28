---
topic: 19
name: 2.5D Profile
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/topics/19-2_5d-profile.md
category: unimplemented
audited: 2026-01-24T00:00:00Z
item_count: 7
---

# Topic 19: 2.5D Profile - UNIMPLEMENTED Items

**Note:** Topic 19 is T3 (Optional tier). All items are expected to be unimplemented unless explicitly built. These are classified as UNIMPLEMENTED with "T3 -- future tier" notes.

---

## U-1: PatchProfile Concept (2D / 2.5D / 3D Named Constraint Sets)

**Spec requirement (lines 23-41):**
A PatchProfile is a named constraint set stored as patch-level metadata. Three profiles (2D, 2.5D, 3D) with different authoring restrictions.

**Status:** UNIMPLEMENTED. T3 -- future tier.

No `PatchProfile` type, metadata field, or patch-level constraint mechanism exists in the codebase. The Patch type (in `src/graph/`) does not have a profile field.

---

## U-2: Profile as Patch-Level Metadata

**Spec requirement (lines 36-37):**
> Profile is a patch-level metadata field (stored in patch document)

**Status:** UNIMPLEMENTED. T3 -- future tier.

No metadata field for profile in the patch document schema.

---

## U-3: 2.5D Position Constraints (Field<vec2> + Separate Field<float> Depth)

**Spec requirement (lines 47-57):**
User authors position as Field<vec2> via layout kernels + depth as separate Field<float>.

**Status:** UNIMPLEMENTED. T3 -- future tier.

The underlying position system uses a single `positionSlot` (not split into XY+Z). The Topic 18 gap (U-4: positionXYSlot/positionZSlot split) is a prerequisite for this constraint.

---

## U-4: 2.5D Camera Constraints (Tilt-Only, No Roll, Bounded Tilt/Yaw)

**Spec requirement (lines 85-102):**
Only expose: camCenter (vec2), camZoom (float), camTilt (bounded degrees), camYaw (optional, bounded).
NOT allowed: roll, free-fly, pitch beyond bounds, vec3 camera position, perspective FOV.

**Status:** UNIMPLEMENTED. T3 -- future tier.

The Camera block does not exist yet (Topic 18, U-1). When it does, 2.5D constraints would filter which ports are exposed in the editor UI. No constraint filtering logic exists.

---

## U-5: Compiler MAY Emit Diagnostics for Profile Violations

**Spec requirement (lines 104-119):**
Compiler MAY emit warnings/diagnostics for violations. Compiler MUST NOT hard-reject based on profile alone. Violations are lints, not errors.

**Status:** UNIMPLEMENTED. T3 -- future tier.

No profile-aware compiler pass exists. No diagnostic codes for profile violations.

---

## U-6: Editor Enforcement (UI Filtering) as Primary Guardrail

**Spec requirement (lines 109, 59, 100):**
> Editor enforces constraints by filtering UI options (primary guardrail)
> Editor filters layout kernel catalog to show only 2D variants
> Editor UI only exposes the constrained subset in 2.5D mode

**Status:** UNIMPLEMENTED. T3 -- future tier.

The block library UI (`src/ui/components/BlockLibrary.tsx`) does not have profile-based filtering.

---

## U-7: Zero-Cost Upgrade Path (2.5D -> 3D)

**Spec requirement (lines 137-148):**
Upgrade steps: change profile metadata, editor removes constraint filters, no recompilation needed.

**Status:** UNIMPLEMENTED. T3 -- future tier.

Since profiles themselves do not exist, the upgrade path is trivially unimplemented. However, the architectural prerequisite is partially in place: the same projection pipeline handles both 2D (z=0 promoted) and 3D (vec3 positions), confirming that the zero-cost upgrade path IS architecturally sound once the profile system is built.

---

## Summary

All 7 items are UNIMPLEMENTED, which is expected for a T3 (Optional) tier topic. The prerequisite infrastructure from Topic 18 (Camera block, positionXYSlot/positionZSlot split) must be completed first before Topic 19 becomes actionable.

No CRITICAL or TO-REVIEW items for Topic 19.
