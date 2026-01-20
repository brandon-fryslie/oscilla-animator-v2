# Sprint: editable-defaults - Editable Default Sources
Generated: 2026-01-20T06:55:00Z
Updated: 2026-01-20T09:10:00Z
Confidence: HIGH
Status: READY FOR IMPLEMENTATION

## Sprint Goal

Allow users to edit default source values directly from the Block Inspector. Currently defaults are display-only.

## Research Findings (2026-01-20)

### Infrastructure Already Exists!

The per-instance default source override mechanism is **already implemented**:

1. **InputPort type** (Patch.ts:18-23):
   ```typescript
   export interface InputPort {
     readonly id: string;
     readonly defaultSource?: DefaultSource;  // Per-instance override!
   }
   ```

2. **PatchStore.updateInputPort()** (PatchStore.ts:259-280):
   - Already supports updating `defaultSource` on any port
   - Just call `patchStore.updateInputPort(blockId, portId, { defaultSource: newDefault })`

3. **pass1-default-sources.ts** (line 145):
   - Already checks port-level override FIRST: `block.inputPorts.get(input.id)?.defaultSource`
   - Falls back to registry default only if no override

**This means we only need to build the UI!**

### Edit Control Strategy: Use SliderWithInput

The codebase already has `SliderWithInput` component used in ContinuityControls. Use this for float values.

### DefaultSource Types to Support

| Default Type | blockType | Edit Control |
|--------------|-----------|--------------|
| Constant float | 'Const' | SliderWithInput |
| Constant int | 'Const' | SliderWithInput (step=1) |
| TimeRoot output | 'TimeRoot' | Dropdown (phaseA, phaseB, tMs, etc.) |
| Other block | varies | "Connect to..." button (Sprint 3) |

## Deliverables

**Bead**: oscilla-animator-v2-471

### 1. Default Value Editor in PortInspector

For unconnected inputs with Const default sources, show editable slider:

```tsx
// When port is unconnected and has defaultSource.blockType === 'Const'
<SliderWithInput
  value={defaultSource.params?.value as number ?? 0}
  onChange={(newValue) => {
    patchStore.updateInputPort(blockId, portId, {
      defaultSource: { ...defaultSource, params: { value: newValue } }
    });
  }}
  min={0}
  max={1}
  step={0.01}
/>
```

### 2. TimeRoot Default Dropdown

For inputs with TimeRoot defaults, show dropdown to select output:
- phaseA, phaseB, tMs, pulse, palette, energy

### 3. Reset to Registry Default

Button to clear per-instance override and revert to registry default:
```tsx
<Button onClick={() => patchStore.updateInputPort(blockId, portId, { defaultSource: undefined })}>
  Reset to Default
</Button>
```

## Research Tasks (COMPLETED)

- [x] Decide edit mechanism → Per-instance InputPort.defaultSource (already exists!)
- [x] Find slider component → SliderWithInput from ContinuityControls
- [x] Verify live recompile → updateInputPort triggers recompile via MobX reactions
- [x] Determine rail defaults scope → Support TimeRoot output selection via dropdown

## UI Design

### In Block Inspector (existing port list)
```
┌─────────────────────────────────────┐
│ INPUTS                              │
├─────────────────────────────────────┤
│ base      Signal<float>             │
│ (not connected)                     │
│ Default: [====•=====] 0.35          │  ← Slider!
│                                     │
├─────────────────────────────────────┤
│ spread    Signal<float>             │
│ (not connected)                     │
│ Default: phaseA (rail) [Change]     │  ← Rail dropdown?
└─────────────────────────────────────┘
```

### Control Types by Value Type

| Type | Control |
|------|---------|
| float | Slider with number input |
| int | Slider (integer steps) or spinner |
| bool | Toggle switch |
| vec2 | Two sliders or XY picker |
| vec3/vec4 | Multiple sliders |
| color | Color picker |
| phase | Slider 0-1 |

## Exit Criteria (ACHIEVED)

- [x] Edit mechanism decided → Use existing InputPort.defaultSource override
- [x] UIControlHint for defaults resolved → Use SliderWithInput with type-based ranges
- [x] Integration with live recompile tested → MobX already triggers recompile on port changes
- [x] Rail editing scope decided → Yes, dropdown for TimeRoot outputs

## Dependencies

- Sprint 1 (port-foundation) - Port Inspector shows defaults ✅

## Risks

1. **Performance**: Slider dragging triggers many recompiles
   - Mitigation: Debounce already exists (16ms compile debounce)

2. **Type-specific ranges**: Need min/max for different value types
   - Mitigation: Use sensible defaults (0-1 for phase, 0-10 for generic float)

## Files to Modify

**Modified files:**
- `src/ui/components/BlockInspector.tsx` - Add edit controls to PortInspector
- `src/ui/components/SliderWithInput.tsx` - May need to import/expose

**No changes needed:**
- `src/types/index.ts` - Already has DefaultSource
- `src/graph/Patch.ts` - Already has InputPort.defaultSource
- `src/stores/PatchStore.ts` - Already has updateInputPort()
