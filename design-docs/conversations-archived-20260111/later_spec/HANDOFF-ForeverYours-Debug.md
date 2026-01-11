# Handoff Document: Debugging "Forever Yours" Heart Animation

## Problem Summary

The "Forever Yours" macro (`macro:foreverYours`) was created to display a romantic heart animation using 200 particles sampled from the built-in heart SVG. Currently, only ~1 dot appears with minimal movement instead of the expected full heart shape.

---

## Architecture Overview

### How Macros Work

Macros are "recipe starters" that expand into multiple primitive blocks with pre-wired connections. When you drag a macro onto the canvas:

1. **Macro Definition** (`src/editor/blocks/macros.ts`) - Declares the macro exists in the palette
2. **Macro Expansion** (`src/editor/macros.ts`) - Defines what blocks to create and how to wire them

The expansion happens in `src/editor/stores/PatchStore.ts` when `addBlock()` is called with a macro type.

### Key Files for This Investigation

| File | Purpose |
|------|---------|
| `src/editor/blocks/macros.ts:211-218` | MacroForeverYours definition |
| `src/editor/macros.ts:906-999` | MacroForeverYours expansion template |
| `src/editor/blocks/domain.ts:193-281` | SVGSampleDomain block definition |
| `src/editor/compiler/blocks/domain/SVGSampleDomain.ts` | SVGSampleDomain compiler (runtime logic) |
| `src/editor/pathLibrary/builtins.ts` | Where `builtin:heart` is defined |
| `src/data/pathData.ts:593-750` | The actual heart path data (HEART_PATHS) |
| `src/editor/stores/PatchStore.ts` | Where macro expansion happens |

---

## The Data Flow (What Should Happen)

### 1. SVGSampleDomain Should Produce 200 Points

```
Input:
  asset: 'builtin:heart'
  sampleCount: 200
  distribution: 'even'

Output:
  domain: { count: 200, ids: ['sample-0', 'sample-1', ...] }
  pos0: Field<vec2> with 200 positions along the heart outline
```

**Where to investigate:**
- `src/editor/compiler/blocks/domain/SVGSampleDomain.ts` - This is the compiler that runs at runtime
- Check if `getBuiltinById('builtin:heart')` returns the path data
- Check if the SVG parser correctly processes the heart paths

### 2. The Heart Path Data Structure

The heart is defined in `src/data/pathData.ts` as `HEART_PATHS`:

```typescript
export const HEART_PATHS: LineData[] = [
  // 12 segments (6 pairs of left/right curves)
  {
    startX: 200,
    startY: 70,
    points: [
      { type: 'Q', cx: 110, cy: 0, x: 60, y: 80 },  // Quadratic bezier
      { type: 'Q', cx: 10, cy: 160, x: 70, y: 200 },
      { type: 'Q', cx: 130, cy: 250, x: 200, y: 300 },
    ],
    color: '#cc0000',
    delay: 0,
    duration: 500,
  },
  // ... 11 more segments
];
```

**Critical Question:** Does SVGSampleDomain know how to parse this `LineData[]` format?

Looking at the compiler, it may expect a different format (SVG path string like `"M 200 70 Q 110 0 60 80 ..."`).

### 3. The Builtin Path Registration

In `src/editor/pathLibrary/builtins.ts`:

```typescript
export function getBuiltinById(id: string): PathEntry | undefined {
  return BUILTIN_PATHS.find(p => p.id === id);
}
```

**Check:** What format does `PathEntry.data` use? Does it match what SVGSampleDomain expects?

---

## Likely Root Causes

### Hypothesis 1: SVGSampleDomain Can't Parse the Heart Data

The SVGSampleDomain compiler in `src/editor/compiler/blocks/domain/SVGSampleDomain.ts` may expect:
- An SVG path string (`"M 200 70 Q 110 0 60 80..."`)
- But `builtin:heart` provides `LineData[]` objects

**To verify:**
1. Add console.log in SVGSampleDomain compiler to see what data it receives
2. Check if there's a conversion from `LineData[]` to SVG path string

### Hypothesis 2: Asset Parameter Not Resolving

The macro sets:
```typescript
params: { asset: 'builtin:heart', sampleCount: 200, ... }
```

But SVGSampleDomain's input is defined as:
```typescript
input('asset', 'SVG Path Asset', 'Signal<string>', {
  tier: 'primary',
  defaultSource: {
    value: '',
    world: 'scalar',
    uiHint: { kind: 'text' },
  },
}),
```

**Question:** Is `'builtin:heart'` being passed correctly as a scalar value, or is it being treated as an empty string?

### Hypothesis 3: Domain Not Propagating

If SVGSampleDomain produces a domain with count=1 (or 0), then only 1 particle would render.

**To verify:**
1. Check the compiled program's domain count
2. Add logging in the SVGSampleDomain compiler's output

### Hypothesis 4: Position Field Not Connecting

The macro wires positions through a chain:
```
heart.pos0 → posAdd.a → posAdd.out → render.positions
```

If any connection fails, positions may not reach the renderer.

---

## Debugging Strategy

### Step 1: Check Console for Errors

Open browser DevTools (F12) → Console tab. Look for:
- Compilation errors
- Missing block type errors
- Connection errors

### Step 2: Inspect the Expanded Macro

After dropping the macro, check if all blocks appear:
- Should see 14 blocks total
- Check the Inspector panel for each block's params

### Step 3: Add Debug Logging to SVGSampleDomain Compiler

Edit `src/editor/compiler/blocks/domain/SVGSampleDomain.ts`:

```typescript
// At the start of the compile function:
console.log('[SVGSampleDomain] asset param:', params.asset);
console.log('[SVGSampleDomain] sampleCount:', params.sampleCount);

// After getting the path data:
console.log('[SVGSampleDomain] pathData:', pathData);

// After sampling:
console.log('[SVGSampleDomain] sampled positions:', positions.length);
```

### Step 4: Check Path Library Resolution

Edit `src/editor/pathLibrary/builtins.ts`:

```typescript
export function getBuiltinById(id: string): PathEntry | undefined {
  console.log('[builtins] Looking for:', id);
  const found = BUILTIN_PATHS.find(p => p.id === id);
  console.log('[builtins] Found:', found ? found.name : 'NOT FOUND');
  return found;
}
```

### Step 5: Verify Domain Count in Renderer

The RenderInstances2D block should log how many elements it's rendering. Check:
- `src/editor/compiler/blocks/domain/RenderInstances2D.ts`

---

## The Macro Expansion Code

Here's the full expansion for reference (`src/editor/macros.ts:906-999`):

```typescript
'macro:foreverYours': {
  blocks: [
    // Time - 6 second cycle

    // Heartbeat rhythm
    { ref: 'heartbeat', type: 'PulseDivider', laneKind: 'Phase', label: 'Heartbeat',
      params: { divisions: 2 } },
    { ref: 'beatEnv', type: 'EnvelopeAD', laneKind: 'Phase', label: 'Beat Pulse',
      params: { attack: 0.02, decay: 0.35, peak: 1.0 } },

    // Breathing
    { ref: 'breathOsc', type: 'Oscillator', laneKind: 'Phase', label: 'Breath',
      params: { shape: 'sine', amplitude: 0.3, bias: 0.5 } },
    { ref: 'breathShape', type: 'Shaper', laneKind: 'Phase', label: 'Smooth Breath',
      params: { kind: 'smoothstep', amount: 1 } },

    // Combine energies
    { ref: 'energyMix', type: 'AddSignal', laneKind: 'Phase', label: 'Love Energy' },

    // Color palette
    { ref: 'colorLfo', type: 'ColorLFO', laneKind: 'Phase', label: 'Heart Colors',
      params: { base: '#DC2626', hueSpan: 30, sat: 0.85, light: 0.55 } },

    // SVG Heart Domain - THIS IS THE CRITICAL BLOCK
    { ref: 'heart', type: 'SVGSampleDomain', laneKind: 'Scene', label: 'Heart Shape',
      params: { asset: 'builtin:heart', sampleCount: 200, seed: 14, distribution: 'even' } },

    // Per-element variation
    { ref: 'idHash', type: 'StableIdHash', laneKind: 'Fields', label: 'Particle Soul',
      params: { salt: 214 } },

    // Drift motion
    { ref: 'jitter', type: 'JitterFieldVec2', laneKind: 'Fields', label: 'Gentle Drift',
      params: { amount: 4, frequency: 0.8 } },
    { ref: 'posAdd', type: 'FieldAddVec2', laneKind: 'Fields', label: 'Final Position' },

    // Color variation
    { ref: 'colorize', type: 'FieldColorize', laneKind: 'Fields', label: 'Warm Gradient',
      params: { colorA: '#DC2626', colorB: '#F472B6', mode: 'lerp' } },

    // Opacity variation
    { ref: 'opacityField', type: 'FieldOpacity', laneKind: 'Fields', label: 'Glow Depth',
      params: { min: 0.6, max: 1.0, curve: 'smoothstep' } },

    // Render
    { ref: 'render', type: 'RenderInstances2D', laneKind: 'Program', label: 'Render Love',
      params: { opacity: 0.95, glow: true, glowIntensity: 2.5 } },
  ],
  connections: [
    // Heartbeat → Envelope
    { fromRef: 'heartbeat', fromSlot: 'tick', toRef: 'beatEnv', toSlot: 'trigger' },

    // Breath → Shaper
    { fromRef: 'breathOsc', fromSlot: 'out', toRef: 'breathShape', toSlot: 'in' },

    // Combine energies
    { fromRef: 'beatEnv', fromSlot: 'env', toRef: 'energyMix', toSlot: 'a' },
    { fromRef: 'breathShape', fromSlot: 'out', toRef: 'energyMix', toSlot: 'b' },

    // Domain chains
    { fromRef: 'heart', fromSlot: 'domain', toRef: 'idHash', toSlot: 'domain' },
    { fromRef: 'heart', fromSlot: 'domain', toRef: 'render', toSlot: 'domain' },

    // Position chain
    { fromRef: 'idHash', fromSlot: 'u01', toRef: 'jitter', toSlot: 'idRand' },
    { fromRef: 'heart', fromSlot: 'pos0', toRef: 'posAdd', toSlot: 'a' },
    { fromRef: 'jitter', fromSlot: 'drift', toRef: 'posAdd', toSlot: 'b' },
    { fromRef: 'posAdd', fromSlot: 'out', toRef: 'render', toSlot: 'positions' },

    // Color chain
    { fromRef: 'idHash', fromSlot: 'u01', toRef: 'colorize', toSlot: 'values' },
    { fromRef: 'colorize', fromSlot: 'colors', toRef: 'render', toSlot: 'color' },

    // Opacity (NOT CONNECTED TO RENDER - this might be a bug!)
    { fromRef: 'idHash', fromSlot: 'u01', toRef: 'opacityField', toSlot: 'values' },
  ],
  publishers: [
    { fromRef: 'energyMix', fromSlot: 'out', busName: 'energy' },
    { fromRef: 'colorLfo', fromSlot: 'color', busName: 'palette' },
  ],
  listeners: [
    { busName: 'phaseA', toRef: 'heartbeat', toSlot: 'phase' },
    { busName: 'phaseA', toRef: 'breathOsc', toSlot: 'phase' },
    { busName: 'phaseA', toRef: 'colorLfo', toSlot: 'phase' },
    { busName: 'phaseA', toRef: 'jitter', toSlot: 'phase' },
    { busName: 'energy', toRef: 'render', toSlot: 'radius',
      lens: { type: 'scale', params: { scale: 6, offset: 3 } } },
  ],
},
```

---

## Known Issues in the Macro

### Issue 1: FieldOpacity Not Connected to Render

The `opacityField` block creates per-element opacity values but they're never wired to the renderer. Missing connection:

```typescript
{ fromRef: 'opacityField', fromSlot: 'out', toRef: 'render', toSlot: 'opacity' },
```

But wait - the render's `opacity` input is `Signal<number>`, not `Field<number>`. This might be intentional, or might indicate the opacity variation won't work as designed.

### Issue 2: Glow Parameter Type

The macro sets `glow: true` (boolean), but the block definition expects a string in config world:

```typescript
input('glow', 'Glow', 'Signal<string>', {
  tier: 'secondary',
  defaultSource: {
    value: 'false',
    world: 'config',
    uiHint: { kind: 'boolean' },
  },
}),
```

Should possibly be `glow: 'true'` (string).

---

## Quick Test: Simplify the Macro

To isolate the SVGSampleDomain issue, try creating a minimal test macro:

```typescript
'macro:heartTest': {
  blocks: [
    { ref: 'heart', type: 'SVGSampleDomain', laneKind: 'Scene', label: 'Heart',
      params: { asset: 'builtin:heart', sampleCount: 100, seed: 0, distribution: 'even' } },
    { ref: 'render', type: 'RenderInstances2D', laneKind: 'Program', label: 'Render',
      params: { opacity: 1.0 } },
  ],
  connections: [
    { fromRef: 'heart', fromSlot: 'domain', toRef: 'render', toSlot: 'domain' },
    { fromRef: 'heart', fromSlot: 'pos0', toRef: 'render', toSlot: 'positions' },
  ],
  publishers: [],
  listeners: [],
},
```

If this also shows only 1 dot, the problem is in SVGSampleDomain or the path library.

---

## Next Steps

1. **Check browser console** for any errors when the macro expands
2. **Add logging** to SVGSampleDomain compiler to see what asset value it receives
3. **Verify path library** is returning the heart data correctly
4. **Test with GridDomain** instead of SVGSampleDomain to confirm rest of pipeline works
5. **Check the SVG parser** in SVGSampleDomain - does it handle `LineData[]` format?

---

## Files to Read in Order

1. `src/editor/pathLibrary/builtins.ts` - How builtin:heart is defined
2. `src/editor/compiler/blocks/domain/SVGSampleDomain.ts` - The runtime compiler
3. `src/data/pathData.ts:593-750` - The actual heart path data
4. `src/editor/macros.ts:906-999` - The macro expansion
5. `src/editor/stores/PatchStore.ts` - How macros get expanded (search for `getMacroExpansion`)

Good luck debugging!
