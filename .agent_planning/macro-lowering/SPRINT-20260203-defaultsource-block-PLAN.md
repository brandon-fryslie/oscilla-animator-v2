# Sprint: defaultsource-block - DefaultSource Block + HueRainbow + LowerSandbox
Generated: 2026-02-03
Confidence: HIGH: 4, MEDIUM: 2, LOW: 0
Status: PARTIALLY READY

## Sprint Goal
Register a `DefaultSource` block with type-indexed policy table, create `HueRainbow` block for color defaults, build `LowerSandbox` for pure macro expansion, and prove the effects-as-data pattern on DefaultSource + HueRainbow + one existing block.

## Scope
**Deliverables:**
1. DefaultSource block with type-indexed policy table
2. HueRainbow block (phase → cycling HSL→RGB color)
3. LowerSandbox (constrained IR builder for pure macro expansion)
4. Effects-as-data pattern (PureLowerResult + LowerEffects types)
5. Migrate one existing block to pure pattern as proof
6. Fix all test failures caused by missing DefaultSource

## Work Items

### WI-1 [HIGH]: Register DefaultSource block with type-indexed policy table
**Acceptance Criteria:**
- [ ] `DefaultSource` registered in block registry via `registerBlock()`
- [ ] Output type is generic (payload var, unit var) — resolves via constraint propagation
- [ ] `lower()` dispatches on resolved output type via `chooseDefault(resolvedType)` function
- [ ] Policy table covers: float→const [1], int→const [0], bool→const [false], vec2→const [0,0], vec3→const [0,0,0], color→macro expand HueRainbow(phaseA), bool+discrete→eventNever, shape2d→error
- [ ] Unresolved generic type (payload var still present) emits hard diagnostic error
- [ ] All 11+ test failures from missing DefaultSource block are fixed
- [ ] Block file: `src/blocks/signal/default-source.ts`, imported from `src/blocks/signal/index.ts`

**Technical Notes:**
- Category: `signal`, form: `primitive`, capability: `pure`
- Cardinality: `preserve` with `allowZipSig` (same as Const — it may feed field or signal ports)
- No inputs (it's a source block). One output: `out` with generic type
- The `lower()` function initially uses the current impure API (allocSlot etc.) for const plans, but uses LowerSandbox for the color macro expansion (WI-3)
- Policy table is a simple function, not the full profile system yet (defer profileId to future sprint)

### WI-2 [HIGH]: Create HueRainbow block
**Acceptance Criteria:**
- [ ] `HueRainbow` registered in block registry
- [ ] Input: `t` (float, phase/time parameter, 0→1 range)
- [ ] Output: `out` (color, RGBA)
- [ ] Semantics: converts `t` to hue (full 360° cycle over 0→1), fixed saturation ~0.8, fixed lightness ~0.5, full alpha
- [ ] Uses `ctx.b.hslToRgb()` (already exists in IRBuilder) for the HSL→RGB conversion
- [ ] Block is tagged `loweringPurity: 'pure'` (first block to carry this tag)
- [ ] Unit test: HueRainbow(0) ≈ red, HueRainbow(0.33) ≈ green, HueRainbow(0.67) ≈ blue
- [ ] Block file: `src/blocks/color/hue-rainbow.ts`

**Technical Notes:**
- The block constructs an HSL color from input `t` (as hue), then applies hslToRgb
- Implementation: `construct([t, const(0.8), const(0.5), const(1.0)], COLOR)` → `hslToRgb(constructed, COLOR)`
- This block must work both as a normal graph block AND as a macro expansion target

### WI-3 [MEDIUM]: Build LowerSandbox (constrained IR builder)
**Acceptance Criteria:**
- [ ] `LowerSandbox` class/type exists in `src/compiler/ir/LowerSandbox.ts`
- [ ] Wraps an `IRBuilder` instance but restricts the API surface to pure operations only
- [ ] Allowed methods: `constant`, `time`, `kernelMap`, `kernelZip`, `kernelZipSig`, `broadcast`, `reduce`, `combine`, `intrinsic`, `placement`, `extract`, `construct`, `hslToRgb`, `opcode`, `kernel`, `expr`, `eventNever`, `eventPulse`
- [ ] Blocked methods: `allocSlot`, `allocTypedSlot`, `allocStateSlot`, `allocEventSlot`, `registerSlotType`, `registerSigSlot`, `registerFieldSlot`, `stepSlotWriteStrided`, `stepStateWrite`, `stepFieldStateWrite`, `stepEvalSig`, `stepMaterialize`, `stepContinuityMapBuild`, `stepContinuityApply`, `addRenderGlobal`
- [ ] `lowerBlock(blockType, inputs, params)` method that invokes a registered block's `lower()` through the sandbox, returning only `ValueExprId` per output (no slots)
- [ ] Throws if invoked block is not tagged `loweringPurity: 'pure'`
- [ ] DefaultSource's `lower()` uses LowerSandbox for the color case (macro expansion of HueRainbow)
- [ ] Unit test: sandbox rejects calls to blocked methods

#### Unknowns to Resolve
- Exact signature of `lowerBlock()` — how to construct synthetic `LowerArgs` without real block context
- How to provide `LowerCtx` to the macro-expanded block (synthetic blockIdx, synthetic instanceId)
- Whether `time()` calls in sandbox should be allowed directly or only via `readRail()` abstraction

#### Exit Criteria
- Prototype works: `sandbox.lowerBlock('HueRainbow', { t: phaseAExpr }, {})` returns a valid ValueExprId

### WI-4 [MEDIUM]: Effects-as-data pattern (PureLowerResult + LowerEffects)
**Acceptance Criteria:**
- [ ] `PureLowerResult` type defined: `{ exprOutputs: Record<string, ValueExprId>, effects?: LowerEffects }`
- [ ] `LowerEffects` type defined: `{ slotRequests?: SlotRequest[], stateRequests?: StateRequest[], stepRequests?: StepRequest[] }`
- [ ] `SlotRequest`: `{ portId: string, type: CanonicalType }` — compiler allocates slot after lowering
- [ ] DefaultSource block returns `PureLowerResult` from its `lower()` function
- [ ] HueRainbow block returns `PureLowerResult` from its `lower()` function
- [ ] The lowering orchestrator (`lower-blocks.ts`) handles both `LowerResult` (existing) and `PureLowerResult` (new) — allocates slots for pure blocks, passes through for impure blocks
- [ ] Existing blocks continue using `LowerResult` unchanged

#### Unknowns to Resolve
- How to detect whether a block returned `PureLowerResult` vs `LowerResult` (discriminant field? separate function signature?)
- How `lower-blocks.ts` allocates slots for pure blocks — needs to know stride from type

#### Exit Criteria
- DefaultSource and HueRainbow compile successfully using PureLowerResult path
- At least one existing block migrated to prove the pattern works bidirectionally

### WI-5 [HIGH]: Migrate one existing block to pure pattern as proof
**Acceptance Criteria:**
- [ ] One existing block (recommend: `Add` — simplest math block) migrated to use `PureLowerResult`
- [ ] Block tagged `loweringPurity: 'pure'`
- [ ] Block no longer calls `allocSlot()` directly — returns `SlotRequest` in effects
- [ ] All existing tests for the migrated block continue to pass
- [ ] The block can be invoked via `sandbox.lowerBlock()` (proves macro expansion works for non-DefaultSource blocks)

**Technical Notes:**
- Add block is ideal: 2 inputs, 1 output, pure math, no state, no events
- Current Add lower: `ctx.b.kernelZip([a, b], opcode(Add), outType)` → `allocSlot()` → return `{ id, slot, type, stride }`
- New Add lower: `ctx.b.kernelZip([a, b], opcode(Add), outType)` → return `{ exprOutputs: { out: id }, effects: { slotRequests: [{ portId: 'out', type: outType }] } }`

### WI-6 [HIGH]: Add loweringPurity field to BlockDef
**Acceptance Criteria:**
- [ ] `loweringPurity?: 'pure' | 'stateful' | 'impure'` field added to `BlockDef` interface in `src/blocks/registry.ts`
- [ ] Default value is `undefined` (treated as `'impure'` — backward compatible)
- [ ] DefaultSource, HueRainbow, and Add tagged as `'pure'`
- [ ] LowerSandbox checks this field before allowing macro expansion

**Technical Notes:**
- This is a type-only change to BlockDef + 3 block registrations
- No mass migration — existing blocks get `undefined` which means "impure" (can't be macro-expanded)

## Dependencies & Implementation Order
LowerSandbox and effects-as-data are **prerequisites** — DefaultSource and HueRainbow cannot be implemented without them.

**Required order:**
1. **WI-6** (loweringPurity tag on BlockDef) — type-only, no runtime change
2. **WI-4** (PureLowerResult + LowerEffects types + orchestrator support in lower-blocks.ts)
3. **WI-3** (LowerSandbox — constrained IR builder)
4. **WI-5** (Migrate Add block to pure pattern — proves the infrastructure works)
5. **WI-2** (HueRainbow block — uses pure pattern, tagged pure)
6. **WI-1** (DefaultSource block — uses LowerSandbox to macro-expand HueRainbow for color)

## Risks
- **allocSlot removal for pure blocks**: The lowering orchestrator needs to allocate slots on behalf of pure blocks. If the slot allocation logic in lower-blocks.ts is tightly coupled to the current flow, this may be harder than expected. Mitigation: keep both paths (LowerResult and PureLowerResult) working simultaneously.
- **hslToRgb correctness**: The IRBuilder already has `hslToRgb()` but it may not have a runtime implementation in ValueExprMaterializer. Need to verify. Mitigation: check and add if missing.
- **Type resolution for DefaultSource**: The generic output type needs to resolve correctly through pass1 constraint propagation. If it doesn't unify properly (e.g., the target port has a complex type), the policy table won't get the right type. Mitigation: test with all payload types.
