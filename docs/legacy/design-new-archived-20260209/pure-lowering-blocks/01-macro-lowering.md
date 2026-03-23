DefaultSource: Polymorphic Block with Pure Macro Lowering

Core Idea

DefaultSource is a polymorphic structural block inserted by normalization for every unconnected input. It
defers value selection until after type resolution, when its lower() function dispatches on the resolved type
to emit IR — potentially by invoking other blocks' lowering as pure macros.

Three-Phase Separation
Phase: Normalization
Responsibility: Insert DefaultSource block + edge for every unconnected input. Optionally stamp a profileId
hint.
What it knows: Target port identity only. No types. (Fully typed graph is only available AFTER normalization)
────────────────────────────────────────
Phase: Type Resolution
Responsibility: Unify types as usual. DefaultSource output type resolves to whatever the target port expects.
What it knows: —
────────────────────────────────────────
Phase: Lowering
Responsibility: Specialize DefaultSource into concrete IR using a type-indexed table. May invoke other blocks'
lowerers as macros.
What it knows: Resolved CanonicalType.
Normalization never guesses types. Lowering never mutates the graph. Each phase does one thing.

The DefaultSource Block

- Output type is generic (payload var, unit var) — resolves through constraint propagation from the target
  port.
- lower() calls chooseDefault(profile, resolvedType) to select a plan, then emits IR.
- If the resolved type is still unresolved (unconstrained generic), emit a hard diagnostic error.

Type-Indexed Policy Table

```typescript
type DefaultKey = {
    payload: PayloadType;
    unit?: Unit;
    temporality: Temporality;
    cardinality: CardinalityKind;
};

type DefaultPlan =
    | { kind: "rail"; rail: RailId }
    | { kind: "const"; stride: number; values: number[] }
    | { kind: "construct"; payload: PayloadType; args: DefaultPlan[] }
    | { kind: "error"; code: DiagnosticCode; message: string };
```

First-match-wins rule table. Example global defaults:

- float<phase01> → rail: phaseA
- float<scalar> → const: [1] (identity for multiplication)
- vec2 → const: [0, 0]
- vec3 → const: [0, 0, 0]
- color → invoke HueRainbow(phaseA) via macro lowering (or rail: palette)
- bool + discrete → const: [0] (event that never fires)
- shape2d → error (no meaningful default)

Per-Port Profile Overrides

Normalization can stamp a profileId on the DefaultSource block without knowing types — it just knows the target
port's identity:

```typescript
interface DefaultSourceBlockParams {
    profileId: "global" | "colorFriendly" | "timePreferred" |
    ...;
}
```

Lowering resolves: profile = profiles[params.profileId], then plan = chooseDefault(profile, resolvedType).

This gives semantic overrides like:
- Render.opacity → defaults to 1 (even though it's float)
- Oscillator.phase → defaults to phaseA rail
- Layout.position → defaults to PlacementBasis

Macro Lowering: Reuse Block Implementations as IR Libraries

Instead of duplicating logic inside DefaultSource, invoke existing blocks' lower() through a LowerSandbox — a
constrained IR builder that enforces purity:

```typescript
// Example: default color via HueRainbow
const phase = sandbox.readRail("phaseA");
const out = sandbox.lowerBlock("HueRainbow", {t: phase}, {}).out;
return out; // ValueExprId typed as color
```

This keeps block semantics as the single source of truth. If HueRainbow changes, the default changes
automatically.

No extra graph nodes — the expansion produces ValueExprs directly, not graph mutations.

Pure Lowering Contract

Block lower() functions must be pure. Enforce this structurally:

Constrained API — the builder ctx exposes only:
- emitConst, emitOp, emitKernel, emitExtract, emitConstruct, readRail
- Optionally requireState for explicitly stateful blocks

Not allowed: slot allocation, schedule step registration, reading other blocks/edges, mutable globals,
random/time/IO.

Two-result model — lowerers return:
- exprOutputs: Record<PortId, ValueExprId> (pure IR)
- effects?: LowerEffects (declarative data: state cell requests, kernel registrations)

A separate compiler stage turns effects into slot allocations and schedule steps.

Purity tagging on BlockDef:
```typescript
loweringPurity: "pure" | "stateful" | "impure"
```

DefaultSource macro expansion may only call pure blocks (optionally stateful). Never impure.

Mechanical Purity Enforcement
Check: Determinism
Method: Run lowering twice with same inputs, compare canonical IR output
────────────────────────────────────────
Check: No mutation
Method: deepFreeze params/inputs, proxy ctx to throw on writes
────────────────────────────────────────
Check: Forbidden imports
Method: ESLint rule: lowerers cannot import graph model, registries, runtime containers, Date/Math.random
────────────────────────────────────────
Check: Debug builds
Method: Record-and-replay mode that diffs lowering logs across two runs
Design Constraints

- Make "default per type" exhaustive only for types intended to be authorable without wiring. Everything else
  should be a compile error with a diagnostic pointing at the target port.
- Defaults are an authoring affordance, not a semantic band-aid.
- Unresolved generics after unification are always hard errors, never silently defaulted.
- DefaultSource diagnostics attribute back to the target input port with a macro trace: { producer:
  DefaultSource(anchor), expandedUsing: HueRainbow }.
