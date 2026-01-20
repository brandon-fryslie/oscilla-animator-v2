# Sprint: editable-defaults - Editable Default Sources
Generated: 2026-01-20T06:55:00Z
Confidence: MEDIUM
Status: RESEARCH REQUIRED

## Sprint Goal

Allow users to edit default source values directly from the Block Inspector. Currently defaults are display-only.

## Known Elements

- Default sources defined in block registry (`InputDef.defaultSource`)
- Default sources synthesized as blocks during compilation (pass1-default-sources.ts)
- Live recompile triggers on PatchStore changes
- Inspector already displays default source info

## Unknowns to Resolve

1. **Edit mechanism for different default types**
   - Constant values: What control type? (slider, number input, both?)
   - Rail references: Can these be changed? What are valid options?
   - Should edits update the block registry or the patch?

2. **State management for edits**
   - Default sources are in the registry, not the patch
   - Editing would need to override registry defaults
   - Where to store user overrides?

3. **UIControlHint integration**
   - Block params already have UIControlHint for sliders
   - Should default source edits use same hints?
   - How to get hints for default source values?

## Design Options

### Option A: Edit as Block Params Override
Store edited default values as block params. When compiling, use these instead of registry defaults.

```typescript
// Block in patch
{
  id: 'block_1',
  type: 'FieldPulse',
  params: {
    // Explicit block params
  },
  defaultOverrides: {  // NEW
    base: { value: 0.5 },  // Override default for 'base' input
  }
}
```

**Pros**: Clean separation, easy to serialize
**Cons**: Changes Block type, adds complexity

### Option B: Edit Registry Defaults (Session-Only)
Store edits in a runtime-only store, don't persist.

**Pros**: Simple, no schema changes
**Cons**: Edits lost on page refresh

### Option C: Synthesize User Blocks
When user edits a default, create an actual Const block in the patch and wire it.

**Pros**: Uses existing architecture
**Cons**: Clutters graph with many small blocks

## Tentative Deliverables

**Bead**: oscilla-animator-v2-471

- Edit controls in Block Inspector for unconnected inputs
- Support for constant value editing (sliders, number inputs)
- Integration with live recompile
- Consider rail reference editing (dropdown?)

## Research Tasks

- [ ] Decide edit mechanism (Options A/B/C or new)
- [ ] Prototype slider control for default values
- [ ] Test live recompile with default changes
- [ ] Determine if rail defaults should be editable

## Tentative UI

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

## Exit Criteria (to reach HIGH confidence)

- [ ] Edit mechanism decided (A, B, C, or new)
- [ ] UIControlHint for defaults resolved
- [ ] Integration with live recompile tested
- [ ] Rail editing scope decided (yes/no)

## Dependencies

- Sprint 1 (port-foundation) - Port Inspector shows defaults
- Understanding of pass1-default-sources.ts compilation

## Risks

1. **Architecture decision**: Wrong choice could require refactor
   - Mitigation: Prototype both options before committing

2. **UIControlHint availability**: Defaults might not have hints
   - Mitigation: Add hints to registry, or use type-based defaults

3. **Performance**: Slider dragging triggers many recompiles
   - Mitigation: Debounce recompile (already exists, 16ms)

## Files to Modify (tentative)

**Modified files:**
- `src/types/index.ts` - DefaultSource or Block type changes
- `src/ui/components/BlockInspector.tsx` - Edit controls
- `src/graph/Patch.ts` - If Block type changes
- `src/compiler/pass1-default-sources.ts` - Honor overrides
- `src/stores/PatchStore.ts` - Method to update defaults
