# Compiler Audit Red Flags: Default Source System (with Solutions)

Scope: defaultSourceStore, default source attachment, and compile/linking behavior for unconnected inputs.

## Critical

- **IR link step ignores default sources entirely.**
  - **Where:** `src/editor/compiler/passes/pass8-link-resolution.ts` only resolves via wire or bus; defaults are acknowledged but not materialized (commented “placeholder”).
  - **Impact:** Inputs without wires/listeners but with default sources are still unresolved in IR, causing missing inputs at runtime or silent behavior differences from legacy compiler.
  - **Solution:**
    1) Extend Pass 1 to emit `DefaultSourceAttachment` with resolved value/type per input slot.
    2) In Pass 8, when no wire/bus is found, lower the default source into an IR value (const signal, const field, or domain handle) and set the input root.
    3) If a required input has no default source, emit a compile error (not just a warning).

- **TimeRoot config defaults are not guaranteed to resolve.**
  - **Where:** `src/editor/blocks/time-root.ts` uses config defaults; lowering reads `config` instead of resolved inputs.
  - **Impact:** TimeRoot ends up with `NaN` or wrong values when defaults aren’t attached or are ignored.
  - **Solution:** Route TimeRoot inputs through the default source system and ensure defaults are resolved before lowering. Reject missing defaults at compile time.

## High

- **Default source world/type coercion is underspecified in IR path.**
  - **Where:** `src/editor/stores/DefaultSourceStore.ts`, `src/editor/compiler/passes/pass1-normalize.ts` (default attachments), `pass2-types` (TypeDesc validation).
  - **Impact:** A default source may be typed as `signal` in UI but expected as `field` in IR; without explicit coercion/adapter the IR graph can be ill-typed or silently wrong.
  - **Solution:**
    1) Make `DefaultSourceAttachment` carry a `TypeDesc` and a resolved “source world” (signal/field/config).
    2) Introduce explicit adapters at link-time for allowed conversions (e.g., signal→field broadcast).
    3) Treat unsupported conversions as compile errors, not runtime fallbacks.

- **Default source values are not serialized into IR constants consistently.**
  - **Where:** `src/editor/compiler/passes/pass6-block-lowering.ts` uses placeholder constants for Scalars/Fields; IR const pool doesn’t reflect real default values.
  - **Impact:** IR evaluation can diverge from legacy defaults (e.g., color defaults always 0).
  - **Solution:** When converting default sources to IR, emit real constants into `IRBuilder` const pool (numbers, color packing, vec2, strings). Remove placeholder 0 values for default-sourced slots.

## Medium

- **Default source system doesn’t participate in determinism and schedule validation.**
  - **Where:** `buildSchedule` doesn’t track which slots are default-sourced; `ValueStore` has no provenance for defaults.
  - **Impact:** Debugging is harder (no trace of default value origin), and schedule may treat missing inputs as optional even when defaults were intended.
  - **Solution:**
    1) Add `slotMeta` entries that include `defaultSourceId` or `sourceKind` for defaulted inputs.
    2) Emit a diagnostic when a default source is used for a required input (optional warning), and a hard error when a required input has neither wire, bus, nor default.

- **Default sources for special types (Domain/Path) are ad-hoc.**
  - **Where:** `src/editor/blocks/domain.ts` uses default sources for `Domain` and `Field<path>`; IR lowering expects domain handles and field expr handles but default source resolution is not explicit.
  - **Impact:** Domain and path defaults can be missing or mis-typed in IR mode, leading to render sinks with null handles.
  - **Solution:** Create explicit default source resolvers for special types:
    - Domain: synthesize a domain handle with default count.
    - Path: synthesize a field expression handle to a const path expression node.

## Notes

- Legacy compiler already has implicit defaults at the closure level; the IR compiler must explicitly materialize them or will diverge.

