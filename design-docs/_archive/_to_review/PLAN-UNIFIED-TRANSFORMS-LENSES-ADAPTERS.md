# Plan: Unify Lenses + Adapters Behind the Scenes (“Transform Stack”)

**Audience:** Junior engineer with no context, no internet.  
**Goal:** Different UIs are fine; backend semantics must be consistent and reusable everywhere.

This plan makes **one canonical transform system** that powers:
- wire connections (`Connection`)
- bus publishers (`Publisher`)
- bus listeners (`Listener`)
- lens parameter bindings (`LensParamBinding` with `kind:'wire'|'bus'`)

It keeps all “special” meaning inside dedicated transform modules (not in generic types like `TypeDesc`, `Slot`, `Bus`).

---

## 0) TL;DR (what you are building)

You will build a **Transform Stack Facade**:
- A normalized, non-optional “stack” view over `{ adapterChain?, lensStack? }`
- One mutation API (add/remove/reorder/enable/disable/update params)
- One validation API (what transforms are legal where?)
- One execution API (apply transforms consistently in compiler/runtime)
- One catalog API for UIs (list available adapters/lenses + schemas)

Then you will refactor existing UI/compilers to consume the facade so we don’t keep rewriting the same logic in 5 places.

---

## 1) Constraints (non‑negotiable)

### 1.1 No “random special cases” scattered around
- Only **one module** is allowed to branch on:
  - adapter vs lens
  - wire vs publisher vs listener vs lensParam

### 1.2 Do not add specialized concepts to generic abstractions
Specifically: do **not** add new fields to:
- `TypeDesc`
- `Slot`
- `Bus`
- `Connection` / `Publisher` / `Listener`

If we need phase/unit numeric semantics or UI range hints, they live in a **separate registry module** (see §9).

### 1.3 Avoid optional fields in *consumer-facing* types
The stores can keep optionals (`adapterChain?:`, `lensStack?:`) for backwards compatibility.  
But the new “normalized” view should have **no optionals**: empty arrays and booleans are explicit.

### 1.4 Verification: do not trust tests
Verify via `just dev` + manual UI checks (Chrome DevTools MCP).

---

## 2) Current state evaluation (what exists today)

### 2.1 There are already transform fields everywhere, but no shared abstraction

Per-binding transform data exists in these shapes:
- **Wire**: `Connection.adapterChain?`, `Connection.lensStack?`, `Connection.enabled?`  
  File: `src/editor/types.ts`
- **Publisher**: `Publisher.adapterChain?`, `Publisher.lensStack?`, `Publisher.enabled`, `Publisher.sortKey`  
  File: `src/editor/types.ts`
- **Listener**: `Listener.adapterChain?`, `Listener.lensStack?`, `Listener.enabled`  
  File: `src/editor/types.ts`
- **Lens params**: `LensParamBinding` includes `adapterChain?` and `lensStack?` for `bus` and `wire` bindings  
  File: `src/editor/types.ts`

### 2.2 Adapters have two separate “sources of truth”

**Registry (metadata/pathfinding):**
- `src/editor/adapters/AdapterRegistry.ts` defines `AdapterDef` (id/label/policy/cost/from/to)
- `src/editor/adapters/autoAdapter.ts` finds adapter paths (by type)

**Execution (actual behavior):**
- `src/editor/compiler/compileBusAware.ts` has `applyAdapterChain()` + `applyAdapterStep()` switch on string IDs

This is duplication: adding/changing an adapter requires editing two places.

### 2.3 Lenses also have duplicated “sources of truth” and scope mismatch

**Registry (new system):**
- `src/editor/lenses/LensRegistry.ts` defines `LensDef` (id/label/domain/allowedScopes/params/apply)
- `src/editor/lenses/lensInstances.ts` converts `LensDefinition` ⇄ `LensInstance`

**Legacy / duplicated UI assumptions (not registry-driven):**
- `src/editor/components/LensSelector.tsx` hardcodes lens types and param editors.
- `src/editor/modulation-table/LensChainEditor.tsx` hardcodes many lens strings and curve previews.
- `src/editor/lenses/index.ts` contains an older `applyLens()` implementation (used in tests only).

**Scope mismatch today:**
- LensRegistry `allowedScopes` supports only `'publisher' | 'listener'`.
- But wire connections (`Connection`) already support `lensStack` and UI edits wire lenses via `LensChainEditor`.
- So wire lens legality is “special cased” (currently: not enforced by registry).

### 2.4 Compiler behavior is not consistent across compilation modes

Legacy compiler path (`compileBusAware`) supports adapters + lenses.

IR compiler path currently rejects adapters and ignores lenses:
- `src/editor/compiler/passes/pass8-link-resolution.ts` emits `UnsupportedAdapterInIRMode` and ignores lens stacks.

This is a major “behind-the-scenes inconsistency” that must be addressed (either by supporting transforms in IR or rejecting them consistently with one validator).

---

## 3) Target model: Transform Stack as a first-class concept

### 3.1 New unified concepts (transform-only, not generic)

Create a new folder:
- `src/editor/transforms/`

Define canonical types there:

**Scope** (where transforms apply)
```ts
export type TransformScope = 'wire' | 'publisher' | 'listener' | 'lensParam';
```

**Normalized transform stack**
```ts
export type TransformStep =
  | { kind: 'adapter'; enabled: boolean; step: AdapterStep }
  | { kind: 'lens'; enabled: boolean; lens: LensInstance };

export type TransformStack = ReadonlyArray<TransformStep>;
```

**Important rule:** the normalized view is always explicit:
- if `adapterChain` is undefined → it normalizes to `[]`
- if `lensStack` is undefined → it normalizes to `[]`
- if `enabled` is missing anywhere → it normalizes to `true`

### 3.2 Keep storage backwards compatible
Do **not** change the persisted `Connection/Publisher/Listener` shape yet.

Instead, the facade will convert:
- `{ adapterChain?: AdapterStep[], lensStack?: LensInstance[] }`
↔
- `TransformStack`

This lets you migrate UI/compiler incrementally without a patch format migration.

---

## 4) Transform Facade: the only place allowed to “branch”

### 4.1 New modules to add

1) `src/editor/transforms/types.ts`  
Holds `TransformScope`, `TransformStep`, `TransformStack`, plus helper types.

2) `src/editor/transforms/normalize.ts`  
Functions:
- `normalizeTransformStack(input: { adapterChain?: AdapterStep[]; lensStack?: LensInstance[] }): TransformStack`
- `splitTransformStack(stack: TransformStack): { adapterChain?: AdapterStep[]; lensStack?: LensInstance[] }`

3) `src/editor/transforms/catalog.ts`  
Provides UI-facing metadata without hardcoding lens lists in components:
- `listAdapters(): AdapterDef[]` (from AdapterRegistry)
- `listLenses(): LensDef[]` (from LensRegistry)
- `listLensesFor(scope, typeDescOrSemantic): LensDef[]`

4) `src/editor/transforms/validate.ts`  
One validator for:
- scope legality (lens allowedScopes, adapter policies per scope)
- type legality (lens compatible with endpoint semantics)
- structural legality (no step cycles for lens params; no “lensParam” recursion beyond depth)

5) `src/editor/transforms/apply.ts`  
One executor for:
- applying adapter chains (using registry definitions, not switch statements)
- applying lens stacks (using LensRegistry)

---

## 5) Fix adapters: make the registry the execution source of truth

### 5.1 Extend `AdapterDef` to include execution
File: `src/editor/adapters/AdapterRegistry.ts`

Add:
```ts
apply?: (artifact: Artifact, params: Record<string, unknown>, ctx: CompileCtx) => Artifact;
```

Then move the switch-based logic from `compileBusAware.ts` into adapter defs.

### 5.2 Replace `applyAdapterStep()` switch with registry lookup
File: `src/editor/compiler/compileBusAware.ts`

Today it does:
- parse adapterId string
- `switch(adapterName) { ... }`

After refactor:
- `const def = adapterRegistry.get(step.adapterId)` (or a new `getAdapterDefById`)
- call `def.apply(...)`

**Benefits:**
- One canonical place to add adapters.
- UI can show adapter labels and types from the same definition that runs.

---

## 6) Fix lenses: make LensRegistry authoritative for scope + UI schemas

### 6.1 Expand lens scope to include wires + lensParam
File: `src/editor/lenses/LensRegistry.ts`

Change:
```ts
export type LensScope = 'publisher' | 'listener';
```
to:
```ts
export type LensScope = 'wire' | 'publisher' | 'listener' | 'lensParam';
```

Then decide a rule that avoids “special casing”:
- If a lens is safe for both publisher and listener, it is usually safe for wires too.
- Some lenses may be listener-only (e.g. “phaseWindow”); decide explicitly whether wire counts as listener-like.

**Do not rely on lens ID string matching.** Just set `allowedScopes` explicitly in the registry.

### 6.2 Make UI lens lists and param editors registry-driven

Current duplication:
- `src/editor/components/LensSelector.tsx` has its own LENS_TYPES and param editing switches.
- `src/editor/modulation-table/LensChainEditor.tsx` has its own handling.

Plan:
- Create a registry-driven param editor helper:
  - `renderLensParams(lensDef.params, currentValues)` using `UIControlHint`
- Have LensSelector and LensChainEditor pull:
  - lens options: `getAllLenses()` filtered by scope/type
  - param schema: `LensDef.params`

This eliminates the “lens UI out of sync with runtime lens registry” problem.

---

## 7) Unify transform application: one engine, used everywhere

### 7.1 Create canonical “apply transform stack” entrypoints
File: `src/editor/transforms/apply.ts`

Expose functions like:
- `applyAdapterChain(artifact, adapterChain, ctx, errors)`  (but implemented via registry defs)
- `applyLensStack(artifact, lensStack, scope, resolveParam, errors)` (LensRegistry + param resolution)
- `applyTransformStack(artifact, stack, scope, ctx, paramResolver, errors)`

Then modify:
- `src/editor/compiler/compileBusAware.ts` to import from `transforms/apply.ts` and delete local copies.
- `src/editor/lenses/lensResolution.ts` to call the same transformer(s) rather than receiving ad-hoc callbacks.

### 7.2 Make scope explicit at call sites
Compiler must say:
- publisher transforms: scope `'publisher'` (pre-combine)
- listener transforms: scope `'listener'` (post-combine)
- wire transforms: scope `'wire'`
- lens param transforms: scope `'lensParam'`

This eliminates hidden “wire is special” behavior.

---

## 8) Make IR compiler behavior consistent (choose one)

Right now, IR mode:
- rejects adapterChain
- ignores lensStack

That’s inconsistent with the rest of the system.

Choose one of these paths:

### Option A (recommended): implement transforms in IR mode
You need to:
- Extend IR lowering to thread transform stacks through schedule/builders.
- Add runtime execution steps that can apply adapters/lenses in IR runtime, or compile them into IR expressions if supported.

Start minimal:
- support a limited set of adapters (ConstToSignal, Broadcast*)
- support a limited set of cheap lenses (scale/clamp/polarity/phaseOffset) that are pure.

### Option B (stopgap): reject transforms in IR mode consistently, via the transform validator
Implement:
- a single validator that checks “IR mode supports these transforms; others error”
- call it from IR compiler early so errors are consistent and explain how to proceed

**Important:** do not leave “lenses silently ignored” as that creates invisible bugs.

---

## 9) Semantics without leaking into `TypeDesc`: Numeric/semantic registry (required for phase lenses)

Phase/unit/progress semantics must not rely on:
- `TypeDesc.domain === 'phase'` (domain doesn’t exist)
- `TypeDesc.semantics` string parsing (explicitly rejected)

Do this instead:

Create `src/editor/semantics/ValueSemantics.ts` (or `src/editor/numeric/spec.ts`):
- Map **SlotType** and **reserved bus names** to semantic “flavors”.
  - e.g. `Signal<phase>` → `{ numericKind:'phase' }`
  - `Signal<Unit>` → `{ numericKind:'unit' }`
  - bus `phaseA` → `{ numericKind:'phase' }`
  - bus `progress` → `{ numericKind:'unit' }`

Then LensRegistry can declare requirements like:
- `phaseOffset` requires `numericKind:'phase'`
- generic float lenses require `numericKind:'float'` (or accept any numericKind)

This keeps phase logic centralized and prevents runtime “Lens expected phase artifact” errors.

---

## 10) Implementation sequence (do it in this order)

### Phase 0 — Stabilize build errors (fast)
- Fix any TypeScript errors that prevent `just dev` from running.
  - Example: `src/editor/adapters/AdapterRegistry.ts` has broken refs (`signalNumber`, `scalarNumber`) that must be corrected to existing symbols (likely `signalFloat`, `scalarFloat`).

### Phase 1 — Add transform modules (no behavior changes yet)
- Add `src/editor/transforms/types.ts`
- Add `src/editor/transforms/normalize.ts`
- Add `src/editor/transforms/catalog.ts`
- Add `src/editor/transforms/validate.ts` (can start as no-op returning ok)
- Add `src/editor/transforms/apply.ts` (can wrap existing legacy functions at first)

### Phase 2 — Make adapters executable via registry (remove switch)
- Extend `AdapterDef` with `apply`
- Move logic from `compileBusAware.applyAdapterStep` into adapter defs
- Update compiler to call registry apply

### Phase 3 — Enforce lens scopes (wire + lensParam)
- Expand `LensScope` union
- Update lens defs to include `'wire'` and `'lensParam'` where appropriate
- Add validation to reject disallowed scope usage

### Phase 4 — Centralize transform application
- Replace compiler’s local apply functions with `transforms/apply.ts`
- Replace lens param resolver callbacks with transform engine calls

### Phase 5 — Make UI registry-driven (reduce duplication)
- Refactor `LensSelector.tsx` to render lens options/params from LensRegistry (not hardcoded)
- Refactor `LensChainEditor.tsx` to use LensRegistry (not hardcoded)
- Optional: build a new `TransformChainEditor` that can show adapters + lenses in one place

### Phase 6 — IR compiler consistency
- Implement Option A or Option B from §8 (recommended: A, but B is acceptable as an explicit stopgap)

---

## 11) Manual verification checklist (DevTools, no tests)

Run:
- `just dev`

Verify in UI:
- Wire connection lens editing works and persists (`ConnectionInspector` for wire).
- Bus publisher lens editing works and persists (`BusInspector` / `ConnectionInspector` for publisher).
- Bus listener lens editing works and persists (`BusInspector` / `ConnectionInspector` for listener).
- Adapter suggestions show consistently for wire and bus cells (ModulationTable).
- Phase-specific lenses (phaseOffset/pingPong/etc) are only offered/allowed on phase semantics endpoints (Signal<phase>, phaseA bus).
- Switching compiler modes does not silently change meaning (either both support transforms, or IR rejects them with explicit error).

---

## 12) Definition of done (acceptance criteria)

Required:
- One canonical transform abstraction exists (`src/editor/transforms/*`).
- No adapter execution logic lives in compiler switch statements; it lives with adapter defs.
- Lens scope is enforced consistently (wires are not special-cased).
- Lens lists and param schemas are registry-driven in UI (no duplicated hardcoded lens catalogs).
- IR compiler behavior is explicit and consistent (no “ignored lens” behavior).

Nice-to-have:
- Transform chain editor UI shared between ConnectionInspector, BusInspector, ModulationTable.
- Numeric semantics registry used for both lens applicability and numeric UI hints.

