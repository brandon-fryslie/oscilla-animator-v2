# Proposal-to-Codebase Alignment Document

**Generated**: 2026-01-28
**Purpose**: Map proposal terminology to actual codebase, identify gaps, preserve existing functionality

---

## 1. Terminology Mapping

| Proposal Term | Actual Codebase Name | Location |
|---------------|---------------------|----------|
| `RawGraph` | `Patch` | `src/graph/Patch.ts` |
| `NormalizedGraph` | `NormalizedPatch` | `src/graph/passes/pass3-indexing.ts` |
| `TypedGraph` | `TypedPatch` | `src/compiler/ir/patches.ts` |
| `CompiledProgramIR` | `CompiledProgramIR` | `src/compiler/ir/program.ts` ✓ matches |
| `AdapterRegistry` | **NO SEPARATE REGISTRY** - metadata on BlockDef | `src/blocks/registry.ts` (adapterSpec field) |
| `ConcreteType` / `ResolvedPortType` | `CanonicalType` (payload+unit+extent) + `PortValueKind` wrapper (sig/field/event is an execution representation, not part of the type) | `src/core/canonical-types.ts` + `src/compiler/ir/patches.ts` |
| `TypeVarRef` | `PayloadVar` / `UnitVar` | `src/core/canonical-types.ts` |
| `Diagnostic` | `DiagnosticEntry` | `src/diagnostics/types.ts` |
| `frontendNormalize()` | `normalizePatch()` | `src/graph/passes/normalize.ts` |
| `backendCompile()` | `compile()` | `src/compiler/compile.ts` |

---

## 2. Current Pass Structure vs. Proposal

### Current Architecture (Two Pipelines)

**Graph Normalization** (`src/graph/passes/`):
| Pass | Function | Output |
|------|----------|--------|
| 0 | `expandComposites()` | Expands composite blocks |
| 1 | `materializeDefaultSources()` | Wires up default sources |
| 2 | `autoInsertAdapters()` + `expandExplicitLenses()` | Inserts unit converters |
| 3 | `indexBlocks()` | Dense indexing → `NormalizedPatch` |
| 4 | `validateVarargs()` | Validates vararg blocks |

**Compiler** (`src/compiler/passes-v2/`):
| Pass | Function | Output |
|------|----------|--------|
| 1 | `pass1TypeConstraints()` | `TypeResolvedPatch` (union-find solver) |
| 2 | `pass2TypeGraph()` | `TypedPatch` |
| 3 | `pass3Time()` | `TimeResolvedPatch` |
| 4 | `pass4DepGraph()` | `DepGraphWithTimeModel` |
| 5 | `pass5CycleValidation()` | `AcyclicOrLegalGraph` |
| 6 | `pass6BlockLowering()` | `UnlinkedIRFragments` |
| 7 | `pass7Schedule()` | `ScheduleIR` |

### Proposal's Suggested Structure

**Frontend**:
1. `Normalize.Structural` → Proposal doesn't distinguish passes 0-4
2. `Analyze.Types` → Maps to Pass 1 (type constraints)
3. `Normalize.Adapters` → Currently in graph passes (pass 2)
4. `Analyze.Types.Final` → Maps to Pass 2 (type validation)

**Backend**:
1. Lowering → Pass 6
2. IR Building → Part of Pass 6
3. Schedule → Pass 7
4. CompiledProgramIR → Final output

### Key Structural Difference

**Current**: Adapter insertion happens in `graph/passes/` (before compiler sees it)
**Proposal**: Adapter insertion is explicitly part of Frontend pipeline

**Resolution**: Adapters are a Frontend normalization responsibility. Implementation lives in `src/compiler/frontend/`. The backend receives NO information about block origin (adapter, lens, user-created, etc.) — this is already how it works and must not change.

---

## 3. Features NOT Mentioned in Proposal (MUST PRESERVE)

These features exist and work but aren't covered by the proposal. **Do not delete or modify them** unless explicitly discussed.

### 3.1 Time Model System (Pass 3)
**Files**: `src/compiler/passes-v2/pass3-time.ts`

Detects `TimeRoot`/`InfiniteTimeRoot` blocks and generates:
- `tModelMs` - Absolute time in milliseconds
- `phaseA`, `phaseB` - Periodic phases (0-1, wrap semantics)
- `dt` - Delta time
- `pulse` - Edge-triggered event
- `palette` - Color signal
- `energy` - Energy level

**Status**: Not mentioned in proposal. PRESERVE AS-IS.

### 3.2 Cycle Validation
**Files**: `src/compiler/passes-v2/pass5-scc.ts`

Uses Tarjan's SCC algorithm. Currently contains BOTH:
- **Frontend concern**: Structural cycle classification (legal vs illegal feedback)
- **Backend concern**: SCC decomposition for execution scheduling

Per the Frontend/Backend split, this file will be refactored:
- Frontend: `src/compiler/frontend/analyze-cycles.ts` - classification + diagnostics
- Backend: `src/compiler/backend/schedule-scc.ts` - execution ordering

**Status**: Must split into Frontend (classification) and Backend (scheduling) components.

### 3.3 Extent System (5-Axis Types)
**Files**: `src/core/canonical-types.ts`

The proposal mentions only `payload` and `unit`. The codebase has **5 orthogonal axes**:

```typescript
Extent = {
  cardinality: zero | one | many(instanceId)
  temporality: continuous | discrete
  binding: unbound | weak | strong | identity
  perspective: default (v0)
  branch: default (v0)
}
```

#### Clarification: CanonicalType vs execution representations (sig/field/event)

`CanonicalType` is the user-visible type (payload + unit + extent axes). It is the authoritative type used for compatibility checks, adapter insertion, and UI tooling.

`sig` / `field` / `event` are runtime/execution representations (expression families) that the backend uses for evaluation and scheduling. Today they are carried alongside types as a wrapper because the codebase still has multiple expression engines.

**Rule for this initiative**: Do not try to "fix" this by redefining axes or rewriting expression engines. We treat `PortValueKind` as a derived wrapper that travels with `CanonicalType` until a later initiative collapses representations.

**Frontend responsibility**: Always produce `ResolvedPortType = { kind: PortValueKind, type: CanonicalType }` for every port, even when compilation fails.

**Backend responsibility**: Consume `ResolvedPortType.kind` to choose the appropriate lowering path (SigExpr / FieldExpr / EventExpr), without changing the type itself.

**Status**: CRITICAL. Proposal under-specifies type system. Must preserve all 5 axes.

### 3.4 Event Expression System
**Files**: `src/compiler/ir/types.ts`

Three expression types (not just signals):
- `SigExpr` - Scalar signals (cardinality=one)
- `FieldExpr` - Per-lane fields (cardinality=many)
- `EventExpr` - Edge-triggered discrete events

Event kinds: `Pulse`, `Wrap`, `Combine`, `Never`

**Status**: Not mentioned in proposal. PRESERVE AS-IS.

### 3.5 Field Expression System
**Files**: `src/compiler/ir/types.ts`

Separate from signals, enables per-lane computation:
- `FieldExprIntrinsic` - index, normalizedIndex, randomId
- `FieldExprPlacement` - uv, rank, seed
- `FieldExprBroadcast` - Expand signal to all lanes
- `FieldExprMap/Zip` - Pointwise operations

**Status**: Not mentioned in proposal. PRESERVE AS-IS.

### 3.6 Continuity System
**Files**: `src/compiler/ir/types.ts`, `src/stores/ContinuityStore.ts`

Anti-jank state tracking for smooth animations:
```typescript
ContinuityPolicy = 
  | 'none'
  | 'preserve' { gauge, tauMs? }
  | 'slew' { gauge, tauMs }
  | 'crossfade' { windowMs, curve }
  | 'project' { projector, post }
```

**Status**: Not mentioned in proposal. PRESERVE AS-IS.

### 3.7 Instance/Cardinality System
**Files**: `src/core/canonical-types.ts`, `src/compiler/ir/types.ts`

Enables multi-lane rendering:
- `InstanceDecl` - Domain declaration with count, lifecycle, identity mode
- `Cardinality` - zero/one/many(instance)
- `DomainInstance` - Runtime with element IDs, positions

**Status**: Not mentioned in proposal. PRESERVE AS-IS.

### 3.8 CompilationInspectorService
**Files**: `src/services/CompilationInspectorService.ts`

Debug infrastructure that captures pass snapshots:
- Last 2 compilation snapshots (memory-bounded)
- Per-pass timing, input/output, errors
- Powers UI debugging tools

**Requirement**: Frontend MUST emit pass snapshots into CompilationInspectorService the same way compiler passes do (input/output + timings + errors). The UI reads only from these snapshots, not from ad-hoc globals.

**Status**: PRESERVE. Frontend passes must integrate with this service.

---

## 4. Adapters vs. Lenses: Definitive Classification

### Definition

| Concept | Definition | Auto-insertable | Configurable |
|---------|------------|-----------------|--------------|
| **Adapter** | Type conversion with an obvious default behavior. May be lossy if the default is what users expect. | ✅ Yes | ✅ Yes (user can tweak) |
| **Lens** | Transformation with no single obvious default, or exotic conversions that require user intent. | ❌ No | ✅ Yes (user must choose) |

### Key Rules

1. **Adapters are first-class, explicit blocks** that preserve type safety; auto-insert is a frontend policy layered on top
2. **Adapters exist to remove pervasive friction** (e.g., float → phase connections) while remaining fully type-safe and spec-conformant
3. **No separate adapter registry** — adapter suitability is metadata (`adapterSpec`) on BlockDef; lenses are never auto-inserted

### Classification of Current Blocks

Based on the definitions above, here's the correct classification:

#### TRUE ADAPTERS (auto-insertable with sensible defaults)

| Block | Transformation | Default Behavior |
|-------|---------------|------------------|
| `Adapter_DegreesToRadians` | `float:degrees → float:radians` | × π/180 |
| `Adapter_RadiansToDegrees` | `float:radians → float:degrees` | × 180/π |
| `Adapter_PhaseToRadians` | `float:phase01 → float:radians` | × 2π |
| `Adapter_RadiansToPhase01` | `float:radians → float:phase01` | ÷ 2π with wrap |
| `Adapter_ScalarToPhase01` | `float:scalar → float:phase01` | wrap01() - sensible default for phase |
| `Adapter_PhaseToScalar01` | `float:phase01 → float:scalar` | identity (widening) |
| `Adapter_Norm01ToScalar` | `float:norm01 → float:scalar` | identity (widening) |
| `Adapter_MsToSeconds` | `int:ms → float:seconds` | ÷ 1000 with int→float |
| `Adapter_SecondsToMs` | `float:seconds → int:ms` | × 1000 with floor (sensible default) |
| `Broadcast` | `signal → field` | Cardinality 1→many |
| *(new)* `IntToFloat` | `int → float` | lossless promotion |
| *(new)* `FloatToInt` | `float → int` | floor (sensible default) |

#### LENSES (require user choice - no obvious default)

| Block | Transformation | Why Lens |
|-------|---------------|----------|
| `Adapter_ScalarToNorm01Clamp` | `float:scalar → float:norm01` | Clamping is ONE option; user might want wrap, or error. No single obvious default. |
| `Adapter_ScalarToDeg` | `float:scalar → float:deg` | Pure reinterpretation with no computation - user must explicitly choose this semantic |

#### NOT ADAPTERS (no sensible conversion exists)

- `vec3 → int` - What would this even mean?
- `color → float` - Ambiguous (which channel?)
- `bool → vec2` - No sensible default

### Required Changes

1. **Rename lens blocks**: Remove `Adapter_` prefix from lens blocks (use `Lens_` or just the operation name)
2. **Update BlockDef**: Add `adapterSpec` metadata field for true adapters
3. **Update ADAPTER_RULES**: Only include true adapters; remove lens blocks from auto-insertion
4. **Create LENS_CATALOG**: List of available lenses for UI selection (separate from adapters)

### BlockDef Adapter Metadata Schema

For blocks that ARE adapters, add to BlockDef:

```typescript
adapterSpec?: {
  from: {
    payload: PayloadType | 'same';
    unit: Unit | 'same';
    extent: ExtentPattern;  // match 'any' or constrain axes
  };
  to: {
    payload: PayloadType | 'same';
    unit: Unit | 'same';
    extent: ExtentTransform;  // 'preserve' or explicit transform (e.g. Broadcast)
  };

  // Required invariants for anything eligible for auto-insertion
  purity: 'pure';             // no time/state reads, no randomness
  stability: 'stable';        // deterministic for same inputs within a frame

  // Used by adapter path search / tie-breaking
  cost: number;               // lower is preferred; default = 1
};
```

Where:
- `ExtentPattern` can be `'any'` or constrain specific axes (e.g., `{ cardinality: 'one' }`)
- `ExtentTransform` supports:
  - `'preserve'` - all axes unchanged
  - `{ cardinality: 'many', instanceRef: string }` - for Broadcast-style adapters

For blocks that ARE lenses, add to BlockDef:

```typescript
lensSpec?: {
  from: TypePattern;
  to: TypePattern;
  semantics: 'wrapping' | 'clamping' | 'rounding' | 'interpretation' | 'reduction';
  description: string;  // For UI display
};
```

---

## 5. Gaps and Ambiguities in Proposal (ALL RESOLVED)

### Gap 1: CanonicalType vs PortValueKind (representation split) — RESOLVED

The proposal text originally treated "signal" vs "field" as a property implied by axes. The current codebase still uses separate execution representations (SigExpr/FieldExpr/EventExpr), so UI and compiler must carry an explicit `PortValueKind` wrapper alongside `CanonicalType`.

**Resolution**: This initiative preserves existing behavior by standardizing that wrapper in the frontend output (`TypedPatch.portTypes`) and treating it as backend lowering guidance, not as part of type semantics.

### Gap 2: Where Does Time Model Fit? — RESOLVED

**Answer**: Backend.
- **Frontend requirement**: Validate "time roots exist and are unique enough to proceed" only at the structural level (e.g., "there is at least one TimeRoot or InfiniteTimeRoot" and diagnostics if missing/ambiguous).
- **Backend responsibility**: Derive the actual time model values and the synthesized signals/events (tModelMs, phaseA/B, dt, pulse, etc.) exactly as Pass 3 does today.

**Reason**: The time model is not needed to make port types concrete for UI, adapter insertion, or unit/payload unification. It is needed to execute.

### Gap 3: Cycle Validation Placement — RESOLVED

**Answer**: Split.
- **Frontend**: Cycle classification for UX (what's cyclic, what's illegal instantaneous feedback, what edges are implicated) and produce `CycleSummary` so the UI can highlight and propose fixes even when compile fails.
- **Backend**: Cycle handling for execution (SCC decomposition/topological scheduling over lowered IR) and any final legality checks required by the runtime.

**Rule of thumb**: Frontend answers "what is the user looking at and how to fix it"; backend answers "how to run it".

### Gap 4: Event/Field Expression Types — RESOLVED

**Answer**: They remain as execution representations, with a wrapper carried through the frontend output.
- **Frontend output type for UI**: `ResolvedPortType = { kind: PortValueKind, type: CanonicalType }`
  - `kind` ∈ { sig, field, event }
  - `type` is the canonical payload+unit+extent
- **Backend lowering**: Uses `kind` to choose which expression family to produce (SigExpr, FieldExpr, EventExpr) and validates the expected kinds for blocks that require them.

**Important constraint**: This initiative does not attempt to encode "eventness" purely into `Extent.temporality` (because the current execution engine can't be collapsed that way without touching a lot).

### Gap 5: Continuity Integration — RESOLVED

**Answer**: Backend-only semantics; frontend-only validation hooks.
- **Frontend**: May validate "continuity spec references a real gauge / legal target" and surface diagnostics, but does not compute or enforce continuity behavior.
- **Backend**: Owns continuity evaluation, state storage, and any lowering artifacts tied to continuity policies (because it's runtime/stateful by definition).

### ~~Gap 6: Origin Metadata Schema~~ — RESOLVED

No exhaustive origin tracking. Backend data structures do not include block origin information. This is by design — the backend treats all blocks identically regardless of how they were created.

---

## 6. Implementation Constraints

### MUST NOT Do:
1. **Do not rename** existing types/functions unless explicitly approved
2. **Do not delete** passes 3-5 (time, deps, cycles) - not in proposal but critical
3. **Do not remove** extent axes from type system
4. **Do not merge** event/field expressions into signals
5. **Do not break** CompilationInspectorService hooks

### MUST Do:
1. **Preserve** all compiler functionality (reorganized into frontend/backend modules)
2. **Move** graph normalization passes into `src/compiler/frontend/`
3. **Expose** `TypedPatch.portTypes` to UI (the key deliverable)
4. **Expose** `CycleSummary` to UI for cycle diagnostics
5. **Integrate** frontend passes with CompilationInspectorService

### Module Boundary (Final Structure):

```
src/compiler/
├── frontend/
│   ├── normalize-composites.ts
│   ├── normalize-default-sources.ts
│   ├── normalize-adapters.ts
│   ├── normalize-indexing.ts
│   ├── normalize-varargs.ts
│   ├── analyze-type-constraints.ts
│   ├── analyze-type-graph.ts
│   ├── analyze-cycles.ts         # Structural cycle classification
│   └── index.ts                  # Frontend entry point → TypedPatch + CycleSummary
├── backend/
│   ├── derive-time-model.ts
│   ├── derive-dep-graph.ts
│   ├── schedule-scc.ts           # Execution ordering (separate from frontend classification)
│   ├── lower-blocks.ts
│   ├── schedule-program.ts
│   └── index.ts                  # Backend entry point → CompiledProgramIR
└── ir/
    └── (unchanged)
```

---

## 7. Clarification Questions for Architect

### ALL RESOLVED

1. ~~**Lens vs Adapter**~~ → **RESOLVED**: Keep distinct. Adapters = auto-insert with sensible defaults, configurable. Lenses = require user choice.

2. ~~**Adapter Registry**~~ → **RESOLVED**: No separate registry. Adapter suitability is metadata (`adapterSpec`) on BlockDef.

3. ~~**Extent inclusion**~~ → **RESOLVED**: Full extent (all 5 axes) included in ResolvedPortType. UI needs complete type info.

4. ~~**Time model placement**~~ → **RESOLVED**: Split. Frontend ensures TimeRoot exists (validation). Backend does full time model derivation.

5. ~~**Cycle validation placement**~~ → **RESOLVED**: Split between Frontend and Backend.
   - **Frontend**: Structural cycle classification (SCC on instantaneous edges, legal vs illegal feedback detection, diagnostics for UI)
   - **Backend**: Execution scheduling, SCC decomposition for lowered IR, evaluation order

6. ~~**Origin kinds**~~ → **RESOLVED**: Remove exhaustive origin tracking. No fixed list of origin kinds.

7. ~~**Diagnostic schema**~~ → **RESOLVED**: Out of scope for this refactor. Current diagnostic system needs separate initiative.

### Frontend/Backend Boundary (FINAL)

```
FRONTEND (produces TypedPatch + CycleSummary for UI):
├── Normalize.Composites     - Expand composite blocks into primitives
├── Normalize.DefaultSources - Wire up default source connections
├── Normalize.Adapters       - Auto-insert adapter blocks for type mismatches
├── Normalize.Indexing       - Dense block/port indexing → NormalizedPatch
├── Normalize.Varargs        - Validate vararg block configurations
├── Analyze.TypeConstraints  - Union-find solver for payload/unit variables
├── Analyze.TypeGraph        - Produce TypedPatch with resolved portTypes
├── Analyze.CycleClassify    - SCC on instantaneous deps, legal/illegal feedback
└── Output: TypedPatch + CycleSummary (exposed to UI)

BACKEND (execution compilation):
├── Derive.TimeModel    - Generate tMs, phaseA/B, dt, pulse from TimeRoot
├── Derive.DepGraph     - Build dependency graph for scheduling
├── Schedule.SCC        - SCC decomposition for execution ordering
├── Lower.Blocks        - Convert blocks to IR fragments
├── Schedule.Program    - Topological sort, produce execution order
└── Output: CompiledProgramIR
```

### CycleSummary (Frontend artifact for UI)

```typescript
interface CycleSummary {
  sccs: SCC[];  // All strongly connected components
}

interface SCC {
  id: string;
  blocks: BlockId[];
  classification: 'acyclic' | 'trivial-self-loop' | 'cyclic';
  legality: 'legal-feedback' | 'instantaneous-illegal';
  // If illegal, which edges need delay boundaries:
  suggestedFixes?: { edgeId: string; suggestion: 'insert-delay' | 'insert-history' }[];
}
```

---

## 8. Summary

| Category | Status |
|----------|--------|
| Terminology mapping | ✅ Clear (documented above) |
| Pass structure | ✅ Frontend/Backend boundary defined (see §7) |
| Type system | ✅ Full extent in ResolvedPortType |
| Features to preserve | ✅ 8 systems documented, placement clarified |
| Adapters vs Lenses | ✅ Resolved (see §4) |
| Adapter registry | ✅ Metadata on BlockDef, no separate registry |
| UI type exposure | ✅ TypedPatch from Frontend exposed to UI |
| Diagnostics | ⚠️ Out of scope - separate initiative |
