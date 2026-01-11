# Type System (Unified Spec)

## Worlds

The system uses four computational worlds. Worlds are part of every TypeDesc and are enforced at compile time.

| World | Meaning | Evaluation | Example                |
| --- | --- | --- |------------------------|
| Scalar | Compile-time constant | Once at compile | `periodMs: 2000`       |
| Signal | Time-indexed value | Once per frame | `phase: Signal<phase>` |
| Field | Per-element value | At render sinks | `radius: Field<int>`   |
| Event | Discrete trigger | Edge detection | `pulse: Event`         |

## TypeDesc

```ts
interface TypeDesc {
  world: 'scalar' | 'signal' | 'field' | 'event'
  domain: DomainTag
  semantics?: string
}

type DomainTag =
  | 'int'
  | 'float'
  | 'unit'
  | 'time'
  | 'phase'
  | 'color'
  | 'vec2'
  | 'vec3'
  | 'bool'
  | 'event'
  | 'domain'
  | 'render'
  | string
```

TypeDescs are attached to ports and are used for all compatibility checks and combine-mode validation.

## Signals

```ts
type Signal<T> = (tMs: int, ctx: RuntimeCtx) => T
```

Signals are evaluated once per frame and must treat `tMs` as monotonic and unbounded.

## Fields

A Field is a lazy per-element computation that evaluates only at sinks:

```ts
type Field<T> = (seed: Seed, n: int, ctx: CompileCtx) => readonly T[]
```

Fields may be represented as FieldExpr graphs internally, but the semantic contract is lazy evaluation.

## Domains

Domains define stable element identity:

```ts
interface Domain {
  count: int
  getId(index: int): ElementId
}
```

Domains must provide stable IDs across edits to preserve state.

Domain identity rules:
- Identity is opaque and stable (e0…eN-1).
- Structural semantics (row/col, u/v, arc-length) are derived Fields.
- Identity does not encode meaning; meaning is carried by derived fields.

## Events

Events are discrete triggers. The event world is distinct from signals and fields:

```ts
interface Event {
  fired: boolean
  value?: unknown
}
```

Event values are frame-latched and must be ordered deterministically.

## Compatibility and Lifting

- Scalar -> Signal requires an explicit block (e.g., ConstSignal).
- Signal -> Field requires an explicit block (e.g., Broadcast).
- Field -> Signal requires an explicit reducer block (e.g., FieldSum).
- Domain-specific rules are enforced (phase is not implicitly assignable to float).

### Phase as a Distinct Domain

- Phase is treated as its own domain with wrap semantics.
- Numeric math on phase requires explicit conversion:
  - `PhaseToFloat` (unwrap to float in [0,1) or configured range)
  - `FloatToPhase` (wrap/normalize into phase domain)

## Combine-Mode Type Rules

Combine modes are validated against TypeDesc and are specified in `spec/03-buses.md`.
