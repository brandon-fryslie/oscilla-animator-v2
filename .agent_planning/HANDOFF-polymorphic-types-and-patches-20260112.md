# Handoff: Polymorphic Types, Patch Demos, Shape Rendering, and Signal Kernels

**Created**: 2026-01-12
**For**: Future agent continuing type system or rendering work
**Status**: in-progress (functional but some cleanup needed)

---

## Objective

Implement polymorphic type support (`'???'`) for blocks like `Const` that infer their output type from context, plus demo patches with shape rendering and expanded signal kernels.

## Current State

### What's Been Done

**1. Polymorphic Type System (`'???'`)**
- Added `'???'` to `PayloadType` in `src/core/canonical-types.ts`
- Normalizer phase 0 (`resolvePolymorphicTypes`) infers types from target ports
- Type compatibility in `pass2-types.ts` treats `'???'` as compatible with any payload
- Adapter matching in `src/graph/adapters.ts` treats `'???'` as wildcard
- Runtime throws clear errors if `'???'` reaches execution (should be resolved earlier)

**2. Unified `Const` Block**
- Single polymorphic `Const` block replaces `ConstFloat`/`ConstInt`
- Output type declared as `signalType('???')`
- `lower` function handles all scalar types + `vec2` + `color`
- Strict validation - fails fast if:
  - `payloadType` not resolved
  - `value` missing
  - `value` doesn't match resolved type's expected shape

**3. Default Source Materialization**
- Normalizer creates `Const` blocks for unconnected inputs with `defaultSource`
- Sets `payloadType` from target port's type
- Sets `value` from `defaultSource.value`

**4. Shape Rendering**
- `RenderInstances2D` now has `shape` input with default source
- Shape encoding: 0=circle, 1=square, 2=triangle
- `Canvas2DRenderer` updated to draw different shapes
- `RenderPassIR` and `ScheduleExecutor` updated to pass shape through

**5. Demo Patches in main.ts**
- 4 patch variants: Original, Breathing, Wobbly, Pulsing
- Button switcher UI at top-left
- Uses `Oscillator` blocks with different waveforms

**6. Signal Kernels**
- Added waveforms: `triangle`, `square`, `sawtooth`
- Added math: `abs`, `floor`, `ceil`, `round`, `fract`, `sqrt`, `exp`, `log`, `pow`, `min`, `max`, `clamp`, `mix`, `smoothstep`, `step`, `sign`
- Added easing: `easeInQuad`, `easeOutQuad`, `easeInOutQuad`, `easeInCubic`, `easeOutCubic`, `easeInOutCubic`, `easeInElastic`, `easeOutElastic`, `easeOutBounce`
- Added noise: `noise`

### What Remains

**High Priority:**
- [ ] Remove legacy `ConstVec2` and `ConstColor` blocks (now handled by unified `Const`)
- [ ] Fix 7 failing tests (use non-existent blocks: `TimeMs`, `Id01`, etc.)
- [ ] Add missing blocks that tests expect or update tests

**Medium Priority:**
- [ ] Refactor normalizer into explicit passes (currently ad-hoc phases in one function)
- [ ] Add more adapter rules (vec2 broadcast, color broadcast, etc.)
- [ ] Consider polymorphic inputs (currently only outputs support `'???'`)

**Low Priority:**
- [ ] UI for `Const` block should show type-appropriate value editor
- [ ] Validate value representation when type is resolved

## Context & Background

### Why We're Doing This

The user wanted a single `Const` block instead of separate `ConstFloat`, `ConstInt`, etc. The type should be inferred from what the block is wired to - "polymorphic in definition, monomorphic once instantiated." This follows how real type systems work: the type constrains valid values, but you don't know the type until it's resolved from context.

### Key Decisions Made

| Decision | Rationale | Date |
|----------|-----------|------|
| Use `'???'` for polymorphic type | User preference, visually distinctive, signals "unresolved" | 2026-01-12 |
| No default values in lower functions | "Default values hide errors. Fail fast." - user | 2026-01-12 |
| Type flows backward from target | Standard type inference - output type determined by what it connects to | 2026-01-12 |
| Single `Const` block handles all types | Avoids block proliferation, cleaner mental model | 2026-01-12 |
| Value shape must match resolved type | Strict validation prevents silent failures | 2026-01-12 |

### Important Constraints

- **No default values in lower functions** - must fail if type/value not resolved
- **Type must be resolved before lowering** - normalizer's responsibility
- **Value representation varies by type** - scalars are numbers, vec2 is `{x,y}`, color is `{r,g,b,a}`
- **Backward compatibility** - existing patches using `ConstFloat` etc. need migration or aliases

## Acceptance Criteria

- [x] `Const` block compiles when wired to any typed input
- [x] Type is correctly inferred from target port
- [x] Value validation matches resolved type
- [x] Default sources work for all payload types
- [x] Shape rendering works in `RenderInstances2D`
- [ ] All tests pass (7 failing due to unrelated missing blocks)
- [ ] Legacy `ConstVec2`/`ConstColor` removed or aliased

## Scope

### Files Modified This Session

| File | Changes |
|------|---------|
| `src/core/canonical-types.ts` | Added `'???'` to `PayloadType` |
| `src/blocks/signal-blocks.ts` | Unified `Const` block with strict validation |
| `src/graph/normalize.ts` | Added `resolvePolymorphicTypes` phase, default source materialization |
| `src/graph/adapters.ts` | `'???'` treated as wildcard in signature matching |
| `src/compiler/passes-v2/pass2-types.ts` | `'???'` compatible with any payload |
| `src/compiler/ir/bridges.ts` | Error if `'???'` reaches bridging |
| `src/runtime/BufferPool.ts` | Error if `'???'` reaches runtime |
| `src/blocks/render-blocks.ts` | Added `shape` input with default source |
| `src/render/Canvas2DRenderer.ts` | Shape rendering (circle, square, triangle) |
| `src/runtime/SignalEvaluator.ts` | 25+ new signal kernels |
| `src/main.ts` | Demo patches with switcher UI |

### Out of Scope

- Full type constraint system (e.g., `'numeric'` = float|int|phase|unit)
- Polymorphic inputs (only outputs currently)
- UI value editor based on resolved type
- Iterative type resolution (chained polymorphic blocks)

## Implementation Approach

### How Type Inference Works

1. User creates `Const` block with `value` param
2. User wires it to an input port
3. **Normalizer Phase 0** (`resolvePolymorphicTypes`):
   - Finds blocks with `'???'` outputs
   - Traces outgoing edges to target ports
   - Sets `params.payloadType` from target's concrete type
4. **Normalizer Phase 1** (default sources):
   - For unconnected inputs with `defaultSource`
   - Creates `Const` block with both `value` and `payloadType`
5. **Compiler** sees concrete types, proceeds normally
6. **Lower function** validates value matches type, creates IR

### Patterns to Follow

- Type checking in `pass2-types.ts` - `isTypeCompatible()` function
- Adapter matching in `adapters.ts` - signature pattern matching
- Default source in `render-blocks.ts` - `defaultSource: defaultSourceConstant(0)`

### Known Gotchas

- `Const` block not wired anywhere = type can't be resolved = compile fails
- Value must match resolved type's expected shape (number vs object)
- Normalizer runs phases in order - type inference before default source insertion

## Reference Materials

### Key Files

- `src/core/canonical-types.ts:27-35` - PayloadType definition
- `src/blocks/signal-blocks.ts:26-142` - Const block implementation
- `src/graph/normalize.ts:188-261` - Polymorphic type resolution
- `src/graph/normalize.ts:105-186` - Default source materialization

### Test Files

- `src/compiler/__tests__/compile.test.ts` - Basic compilation tests
- `src/compiler/__tests__/steel-thread.test.ts` - End-to-end patch test
- `src/runtime/__tests__/integration.test.ts` - Runtime integration

## Questions & Blockers

### Open Questions

- [ ] Should `ConstVec2`/`ConstColor` be removed or kept as aliases?
- [ ] How should UI handle value editing when type isn't resolved yet?
- [ ] Should we support iterative type resolution (chain of `'???'` blocks)?

### Current Blockers

- 7 tests failing due to missing blocks (`TimeMs`, `Id01`, `Hash`) - unrelated to this work

## Testing Strategy

### Existing Tests Updated

- `src/compiler/__tests__/compile.test.ts` - Const now wired to Add block
- `src/runtime/__tests__/integration.test.ts` - Changed `AddSignal` to `Add`

### Manual Testing

- [x] Demo patches render with all 4 variants
- [x] Patch switcher works
- [x] Shapes render correctly (circles now default)
- [x] Oscillator waveforms work

## Success Metrics

- [x] `npm run typecheck` passes
- [x] 275/282 tests pass (7 failures unrelated)
- [x] Demo app runs with patch switcher
- [x] Shape rendering works

---

## Next Steps for Agent

**Immediate actions**:
1. Decide fate of `ConstVec2`/`ConstColor` (remove or alias to `Const`)
2. Fix or update the 7 failing tests
3. Consider refactoring normalizer into explicit pass files

**Before starting implementation**:
- [ ] Review `src/graph/normalize.ts` structure
- [ ] Check if any code still references `ConstFloat`/`ConstInt`

**When complete**:
- [ ] Update this handoff as complete
- [ ] Commit changes with descriptive message
