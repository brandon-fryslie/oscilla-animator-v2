I couldn’t apply the patch via the file-edit tool (it errored), so here are the exact edits as a unified diff you can apply to ALIGNMENT.md manually.

diff --git a/ALIGNMENT.md b/ALIGNMENT.md
index 0000000..1111111 100644
--- a/ALIGNMENT.md
+++ b/ALIGNMENT.md
@@ -1,6 +1,6 @@
# Proposal-to-Codebase Alignment Document

-**Generated**: 2026-01-28
+**Generated**: 2026-01-28
**Purpose**: Map proposal terminology to actual codebase, identify gaps, preserve existing functionality
 
---
@@ -14,7 +14,7 @@
| `NormalizedGraph` | `NormalizedPatch` | `src/graph/passes/pass3-indexing.ts` |
| `TypedGraph` | `TypedPatch` | `src/compiler/ir/patches.ts` |
| `CompiledProgramIR` | `CompiledProgramIR` | `src/compiler/ir/program.ts` ✓ matches |
| `AdapterRegistry` | **NO SEPARATE REGISTRY** - metadata on BlockDef | `src/blocks/registry.ts` (adapterSpec field) |
-| `ConcreteType` / `ResolvedPortType` | `CanonicalType` (payload+unit+extent) plus kind (sig/field/event) | `src/core/canonical-types.ts` + port wrappers |
+| `ConcreteType` / `ResolvedPortType` | `CanonicalType` (payload+unit+extent) + `PortValueKind` wrapper (sig/field/event is an execution representation, not part of the type) | `src/core/canonical-types.ts` + `src/compiler/ir/patches.ts` port wrappers |
| `TypeVarRef` | `PayloadVar` / `UnitVar` | `src/core/canonical-types.ts` |
| `Diagnostic` | `DiagnosticEntry` | `src/diagnostics/types.ts` |
| `frontendNormalize()` | `normalizePatch()` | `src/graph/passes/normalize.ts` |
@@ -92,6 +92,22 @@
branch: default (v0)
}

	•	

+#### Clarification: CanonicalType vs execution representations (sig/field/event)
+
+CanonicalType is the user-visible type (payload + unit + extent axes). It is the authoritative type used for compatibility checks, adapter insertion, and UI tooling.
+
+sig / field / event are runtime/execution representations (expression families) that the backend uses for evaluation and scheduling. Today they are carried alongside types as a wrapper because the codebase still has multiple expression engines.
+
+Rule for this initiative: do not try to “fix” this by redefining axes or rewriting expression engines. We treat PortValueKind as a derived wrapper that travels with CanonicalType until a later initiative collapses representations.
+
+Frontend responsibility: always produce ResolvedPortType = { kind: PortValueKind, type: CanonicalType } for every port, even when compilation fails.
+
+Backend responsibility: consume ResolvedPortType.kind to choose the appropriate lowering path (SigExpr / FieldExpr / EventExpr), without changing the type itself.

Status: CRITICAL. Proposal under-specifies type system. Must preserve all 5 axes.

@@ -155,9 +171,9 @@

Key Rules

-1. Adapters are first-class, explicit blocks that preserve type safety; auto-insert is a UX policy layered on top
-2. No separate adapter registry - adapter suitability is metadata (adapterSpec) on BlockDef
-3. Lenses require explicit user choice - no auto-insertion
+1. Adapters are first-class, explicit blocks that preserve type safety; auto-insert is a frontend policy layered on top
+2. Adapters exist to remove pervasive friction (e.g., float → phase connections) while remaining fully type-safe and spec-conformant
+3. No separate adapter registry — adapter suitability is metadata (adapterSpec) on BlockDef; lenses are never auto-inserted

Classification of Current Blocks

@@ -232,33 +248,46 @@

BlockDef Adapter Metadata Schema

For blocks that ARE adapters, add to BlockDef:

adapterSpec?: {
from: {
payload: PayloadType | 'same';
unit: Unit | 'same';
-    extent: ExtentPattern;  // can match "any" or constrain specific axes
+    extent: ExtentPattern; // match 'any' or constrain axes
     };
     to: {
     payload: PayloadType | 'same';
     unit: Unit | 'same';
-    extent: ExtentTransform;  // 'preserve' or specific transform like setCardinality('many')
+    extent: ExtentTransform; // 'preserve' or explicit transform (e.g. Broadcast)
     };
-  purity: 'pure';       // required: adapters must be pure
-  stability: 'stable';  // required: no time/state dependence
+
+  // Required invariants for anything eligible for auto-insertion.
+  purity: 'pure';             // no time/state reads, no randomness
+  stability: 'stable';        // deterministic for same inputs within a frame
+
+  // Used by adapter path search / tie-breaking.
+  cost: number;               // lower is preferred; default = 1
   };

Where:
•	ExtentPattern can be 'any' or constrain specific axes (e.g., { cardinality: 'one' })
•	ExtentTransform supports:
•	'preserve' - all axes unchanged
•	{ cardinality: 'many', instanceRef: string } - for Broadcast-style adapters

For blocks that ARE lenses, add to BlockDef:
@@ -277,13 +306,13 @@

5. Gaps and Ambiguities in Proposal

-### Gap 1: Type System Under-Specified
-Proposal mentions only payload and unit. Must clarify:
– Does extent (cardinality/temporality/binding) stay as-is?
– How does ResolvedPortType include extent information?
+### Gap 1: CanonicalType vs PortValueKind (representation split)
+
+The proposal text originally treated “signal” vs “field” as a property implied by axes. The current codebase still uses separate execution representations (SigExpr/FieldExpr/EventExpr), so UI and compiler must carry an explicit PortValueKind wrapper alongside CanonicalType.
+
+This initiative preserves existing behavior by standardizing that wrapper in the frontend output (TypedPatch.portTypes) and treating it as backend lowering guidance, not as part of type semantics.

Gap 2: Where Does Time Model Fit?

Proposal doesn’t mention time model derivation. Questions:
•	Is Pass 3 part of Frontend or Backend?
•	Time model affects typing (signals vs events) - is this pre or post type resolution?

That’s the whole set of changes I’d make to bring `ALIGNMENT.md` in line with (a) your “adapters remove friction but remain type-safe” decision and (b) the current reality that `sig/field/event` is still a representation wrapper that must be carried without derailing the initiative.