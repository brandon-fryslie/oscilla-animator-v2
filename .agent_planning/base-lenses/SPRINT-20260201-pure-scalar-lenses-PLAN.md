# Sprint: Pure Scalar Lenses
Generated: 2026-02-01
Confidence: HIGH: 7, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION

## Sprint Goal
Implement the core set of pure, stateless value-shaping lens blocks and update the lens discovery system so they appear in the UI.

## Scope
**Deliverables:**
1. Lens infrastructure update (category discovery)
2. Five pure scalar lens blocks
3. Tests for all lens blocks

## Work Items

### P0: Update lens discovery to support `category: 'lens'`

Currently `lensUtils.ts:getAvailableLensTypes()` only looks at `category: 'adapter'`. Lens blocks will use `category: 'lens'`. The discovery function must include both categories.

**Acceptance Criteria:**
- [ ] `getAvailableLensTypes()` returns blocks from both `'adapter'` and `'lens'` categories
- [ ] Existing adapter lenses still appear in UI
- [ ] New lens blocks appear in UI menus
- [ ] `findCompatibleLenses()` works for lenses that don't change type (source type == target type)

**Technical Notes:**
- `getBlockTypesByCategory('lens')` is the addition needed
- `canApplyLens` may need relaxation for lenses where input type == output type (value shapers don't change type)
- Lens blocks won't have `adapterSpec` — they should never be auto-inserted

### P1: ScaleBias block

`y = x * scale + bias` — the most fundamental value transformation.

**Acceptance Criteria:**
- [ ] Block type `ScaleBias` registered with `category: 'lens'`
- [ ] Inputs: `in` (FLOAT, scalar), `scale` (FLOAT, default 1.0, exposedAsPort: false), `bias` (FLOAT, default 0.0, exposedAsPort: false)
- [ ] Output: `out` (FLOAT, scalar) — same type as input
- [ ] Lower: `kernelZip([input, scaleConst], Mul) → kernelZip([result, biasConst], Add)`
- [ ] Params accessed via `config` in lower function
- [ ] No `adapterSpec` (user-controlled only, never auto-inserted)
- [ ] Test: scale=2, bias=0 doubles input; scale=1, bias=3 adds 3; scale=0.5, bias=-1

**Technical Notes:**
- File: `src/blocks/lens/scale-bias.ts`
- Pattern: same as adapter blocks but `category: 'lens'`, no `adapterSpec`
- `capability: 'pure'`, `cardinalityMode: 'preserve'`

### P2: Clamp block

`y = clamp(x, min, max)` — bounds enforcement.

**Acceptance Criteria:**
- [ ] Block type `Clamp` registered
- [ ] Inputs: `in` (FLOAT), `min` (FLOAT, default 0.0, exposedAsPort: false), `max` (FLOAT, default 1.0, exposedAsPort: false)
- [ ] Output: `out` (FLOAT) — same type as input
- [ ] Lower: `kernelZip([input, minConst, maxConst], Clamp)`
- [ ] Test: clamp(0.5, 0, 1)=0.5; clamp(-1, 0, 1)=0; clamp(2, 0, 1)=1

### P3: Wrap01 block

`y = fract(x)` — phase/hue hygiene wrap to [0,1).

**Acceptance Criteria:**
- [ ] Block type `Wrap01` registered
- [ ] Inputs: `in` (FLOAT)
- [ ] Output: `out` (FLOAT)
- [ ] Lower: `kernelMap(input, Wrap01)` (uses existing Wrap01 opcode)
- [ ] No parameters (pure wrapping)
- [ ] Test: wrap01(0.3)=0.3; wrap01(1.7)=0.7; wrap01(-0.3)=0.7
- [ ] NOTE: Unlike Adapter_ScalarToPhase01, this does NOT change the unit type. It's a value shaper, not a type converter.

### P4: StepQuantize block

`y = round(x / step) * step` — discretize to step grid.

**Acceptance Criteria:**
- [ ] Block type `StepQuantize` registered
- [ ] Inputs: `in` (FLOAT), `step` (FLOAT, default 0.1, exposedAsPort: false)
- [ ] Output: `out` (FLOAT)
- [ ] Lower: `div(input, step) → round → mul(result, step)`
- [ ] Test: step=0.25 → 0.13→0.25, 0.37→0.25, 0.63→0.75, 1.0→1.0

### P5: Smoothstep block

`y = smoothstep(edge0, edge1, x)` — standard S-curve remap.

**Acceptance Criteria:**
- [ ] Block type `Smoothstep` registered
- [ ] Inputs: `in` (FLOAT), `edge0` (FLOAT, default 0.0, exposedAsPort: false), `edge1` (FLOAT, default 1.0, exposedAsPort: false)
- [ ] Output: `out` (FLOAT)
- [ ] Lower: implements `t = clamp((x - edge0) / (edge1 - edge0), 0, 1); y = t * t * (3 - 2 * t)`
- [ ] This can be composed from existing opcodes: Sub, Div, Clamp, Mul
- [ ] Test: smoothstep(0,1, 0)=0; smoothstep(0,1, 0.5)=0.5; smoothstep(0,1, 1)=1; smoothstep(0.2,0.8, 0.5)≈0.5

### P5b: PowerGamma block

`y = pow(clamp01(x), gamma)` — gamma curve control.

**Acceptance Criteria:**
- [ ] Block type `PowerGamma` registered
- [ ] Inputs: `in` (FLOAT), `gamma` (FLOAT, default 1.0, exposedAsPort: false)
- [ ] Output: `out` (FLOAT)
- [ ] Lower: `clamp(input, 0, 1) → pow(clamped, gamma)`
- [ ] Test: gamma=1 → identity; gamma=2 → squared; gamma=0.5 → sqrt

## File Structure

```
src/blocks/lens/
├── index.ts           # Barrel export, side-effect imports
├── scale-bias.ts      # ScaleBias
├── clamp.ts           # Clamp
├── wrap01.ts          # Wrap01
├── step-quantize.ts   # StepQuantize
├── smoothstep.ts      # Smoothstep
├── power-gamma.ts     # PowerGamma
└── __tests__/
    └── pure-lenses.test.ts  # All pure lens tests
```

## Dependencies
- Existing block registry infrastructure
- Existing OpCode enum (all needed opcodes exist)
- Existing lens expansion in normalize-adapters.ts (Phase 1)

## Risks
- **canApplyLens needs update**: Current logic requires source→lensInput and lensOutput→target type matches. For value-shaping lenses (same type in/out), this should work naturally as long as the source type matches the lens input type. Low risk.
- **Lens blocks need to be imported**: `src/blocks/lens/index.ts` must be imported from `src/blocks/index.ts` for side-effect registration. Low risk, standard pattern.
