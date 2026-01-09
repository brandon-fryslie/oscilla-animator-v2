# Steel Thread Patch Validation

This document describes the minimal patch configuration for validating IR compilation end-to-end.

## Steel Thread Patch Recipe

The steel thread patch uses the minimum set of blocks required to produce visible output:

### Blocks (in dependency order)

1. **InfiniteTimeRoot**
   - kind: `InfiniteTimeRoot`
   - Params: `{ periodMs: 3000 }`
   - Purpose: Provides time signals for animation

2. **GridDomain**
   - kind: `GridDomain`
   - Params: `{ rows: 5, cols: 5 }`
   - Purpose: Creates a 25-element domain

3. **RenderInstances2D**
   - kind: `RenderInstances2D`
   - Params: `{}`
   - Purpose: Render sink that materializes circles

### Wiring

1. `GridDomain.domain` → `RenderInstances2D.domain`
2. `GridDomain.pos0` → `RenderInstances2D.positions`

Other inputs (radius, color, opacity) are satisfied via default sources:
- `radius` → DSConstFieldFloat (default: 5)
- `color` → DSConstFieldColor (default: #ffffff)
- `opacity` → DSConstSignalFloat (default: 1.0)

## DevTools Validation Checklist

Open the browser DevTools console and verify:

### 1. Compile Logs
```
✅ [buildSchedule] Starting with: { renderSinkCount: 1, renderSinkTypes: ['instances2d'] }
✅ [buildSchedule] Done. Schedule has N steps
```

### 2. Schedule Step Types
The schedule should include (in order):
```
✅ timeDerive    - Time signal computation
✅ signalEval    - Signal expression evaluation
✅ materialize   - Field materialization (position, radius, color)
✅ renderAssemble - Final frame assembly
```

### 3. Slot Metadata
```
✅ No "slotMeta is required for IR execution" errors
✅ All schedule steps have associated slotMeta
```

### 4. Render Output
```
✅ Canvas shows 25 circles in a grid pattern
✅ Circles are white (#ffffff)
✅ Circles animate smoothly when timeline runs
```

## Fixture File

A reproducible patch fixture is available at:
`public/fixtures/steel-thread.json`

This file can be loaded via the editor's import functionality.

## Troubleshooting

### Common Issues

1. **"MissingInput" errors**
   - Check that all required inputs have connections or defaultSource
   - Verify pass0-materialize is creating provider blocks

2. **"expected field input" errors**
   - Check that world types match (signal→field needs adapter)
   - Verify BroadcastSignal adapters are in transform chain

3. **No render output**
   - Verify RenderInstances2D has all required inputs
   - Check that renderSink is registered in builderIR
   - Verify schedule has renderAssemble step

4. **Slot validation failures**
   - Ensure all block lowerers call allocWithMeta()
   - Check that slotMeta array is populated before schedule execution
