# Definition of Done: DefaultSource Block + HueRainbow + LowerSandbox
Generated: 2026-02-03

## Verification Criteria

### Infrastructure (must pass before any block work)
- [ ] `loweringPurity` field exists on `BlockDef` interface (optional, defaults to `undefined`/impure)
- [ ] `PureLowerResult` type defined with `exprOutputs: Record<string, ValueExprId>` + `effects?: LowerEffects`
- [ ] `LowerEffects` type defined with `slotRequests`, `stateRequests`, `stepRequests`
- [ ] `lower-blocks.ts` handles `PureLowerResult` — allocates slots on behalf of pure blocks
- [ ] `LowerSandbox` class exists, wraps `IRBuilder`, blocks impure methods (allocSlot, stepXxx, etc.)
- [ ] `LowerSandbox.lowerBlock(blockType, inputs, params)` invokes a pure block's lower() and returns `ValueExprId` per output
- [ ] LowerSandbox refuses to invoke blocks not tagged `loweringPurity: 'pure'`

### Proof block (must pass before DefaultSource)
- [ ] `Add` block (or equivalent simple math block) migrated to `PureLowerResult`
- [ ] `Add` block tagged `loweringPurity: 'pure'`
- [ ] All existing Add tests pass unchanged
- [ ] `sandbox.lowerBlock('Add', ...)` works in a unit test

### DefaultSource + HueRainbow
- [ ] `HueRainbow` block registered — input `t` (float), output `out` (color RGBA via HSL→RGB)
- [ ] `HueRainbow` tagged `loweringPurity: 'pure'`
- [ ] `DefaultSource` block registered — generic output type resolves via constraint propagation
- [ ] DefaultSource type table covers all concrete payload types (float, int, bool, vec2, vec3, color, cameraProjection)
- [ ] DefaultSource for color invokes HueRainbow via LowerSandbox with phaseA rail as input
- [ ] DefaultSource for unresolved generic emits hard diagnostic error
- [ ] All test failures from missing DefaultSource registration are fixed (0 failures)

### Integration
- [ ] A patch with `RenderInstances2D` where `color` is unconnected compiles successfully (DefaultSource creates cycling rainbow color)
- [ ] A patch with an unconnected float input compiles (DefaultSource creates Const(1))
- [ ] `npm run test` passes with 0 failures
- [ ] `npm run typecheck` passes with 0 errors

## What "Done" Means
The system can automatically provide sensible, type-appropriate default values for any unconnected input port. Color defaults produce a visible, cycling rainbow. The LowerSandbox proves that block lowerers can be composed as pure macros. One existing block (Add) demonstrates the effects-as-data migration path.
