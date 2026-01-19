# Implementation Context: Complete inputDefaults Removal

Sprint: inputdefaults-removal-complete
Generated: 2026-01-19

---

## Why P0 (Registry Defaults) Must Come First

The demo patches use `inputDefaults` to override these inputs:

| Input | Block | inputDefaults Value | Registry Default |
|-------|-------|---------------------|------------------|
| spin | FieldAngularOffset | 2.0, 3.0 | **1.0** (exists) |
| radius | FieldRadiusSqrt | 0.35 | **MISSING** |
| sat | HsvToRgb | 0.8-0.95 | **MISSING** |
| val | HsvToRgb | 0.9-0.95 | **MISSING** |
| size | RenderInstances2D | 3-5 | **MISSING** |

If we remove `inputDefaults` before adding registry defaults for `radius`, `sat`, `val`, and `size`, Pass1 will have NO default to use and compilation will fail.

---

## P0: Adding Registry Defaults

### src/blocks/color-blocks.ts - HsvToRgb

**Before (line ~121-123):**
```typescript
inputs: [
  { id: 'hue', label: 'Hue', type: signalTypeField('float', 'default') },
  { id: 'sat', label: 'Saturation', type: signalType('float') },
  { id: 'val', label: 'Value', type: signalType('float') },
],
```

**After:**
```typescript
inputs: [
  { id: 'hue', label: 'Hue', type: signalTypeField('float', 'default') },
  { id: 'sat', label: 'Saturation', type: signalType('float'), defaultSource: defaultSourceConstant(1.0) },
  { id: 'val', label: 'Value', type: signalType('float'), defaultSource: defaultSourceConstant(1.0) },
],
```

**Note:** Import `defaultSourceConstant` from `'../types'` if not already imported.

### src/blocks/field-operations-blocks.ts - FieldRadiusSqrt

**Before (line ~596):**
```typescript
{ id: 'radius', label: 'Radius', type: signalTypeField('float', 'default') },
```

**After:**
```typescript
{ id: 'radius', label: 'Radius', type: signalTypeField('float', 'default'), defaultSource: defaultSourceConstant(0.35) },
```

### src/blocks/render-blocks.ts - RenderInstances2D

**Before (line ~129):**
```typescript
{ id: 'size', label: 'Size', type: signalTypeField('float', 'default') },
```

**After:**
```typescript
{ id: 'size', label: 'Size', type: signalTypeField('float', 'default'), defaultSource: defaultSourceConstant(5) },
```

### src/blocks/render-blocks.ts - RenderCircle

**Before (line ~30):**
```typescript
{ id: 'size', label: 'Size', type: signalTypeField('float', 'default') },
```

**After:**
```typescript
{ id: 'size', label: 'Size', type: signalTypeField('float', 'default'), defaultSource: defaultSourceConstant(5) },
```

### src/blocks/render-blocks.ts - RenderRect

**Before (lines ~78-79):**
```typescript
{ id: 'width', label: 'Width', type: signalTypeField('float', 'default') },
{ id: 'height', label: 'Height', type: signalTypeField('float', 'default') },
```

**After:**
```typescript
{ id: 'width', label: 'Width', type: signalTypeField('float', 'default'), defaultSource: defaultSourceConstant(10) },
{ id: 'height', label: 'Height', type: signalTypeField('float', 'default'), defaultSource: defaultSourceConstant(10) },
```

---

## P1-P2: Removal Locations

### src/graph/Patch.ts

**Line 31 - Block interface:**
```typescript
// DELETE THIS LINE
readonly inputDefaults?: Readonly<Record<string, DefaultSource>>;
```

**Line 103 - Options type:**
```typescript
// DELETE THIS LINE
inputDefaults?: Record<string, DefaultSource>;
```

**Line 116 - Assignment:**
```typescript
// DELETE THIS LINE
inputDefaults: options?.inputDefaults,
```

### src/graph/passes/pass1-default-sources.ts

**Lines 49-54 - Override check:**
```typescript
// DELETE THIS BLOCK
const instanceOverride = block.inputDefaults?.[input.id];
if (instanceOverride) {
  // use override
}
```

**Keep only:**
```typescript
const ds = input.defaultSource;
if (ds) {
  // create DefaultSource block
}
```

### src/stores/PatchStore.ts

**Lines 250-260 - Default handling:**
```typescript
// DELETE THIS ENTIRE BLOCK
const newDefaults = { ...block.inputDefaults };
// ...
inputDefaults: Object.keys(newDefaults).length > 0 ? newDefaults : undefined,
```

### src/ui/reactFlowEditor/nodes.ts

**Line 47 - Override check:**
```typescript
// DELETE THIS LINE
const instanceOverride = block.inputDefaults?.[input.id];
```

---

## P3: Demo Patch Fixes

### Strategy

For each `inputDefaults` usage, decide:

1. **Use registry default** - If the inputDefaults value equals or is close to a sensible registry default
2. **Wire explicit Const** - If the inputDefaults value is significantly different and needs to be preserved

### patchOriginal (lines 83-116)

| Block | Input | inputDefaults Value | Action |
|-------|-------|---------------------|--------|
| FieldAngularOffset | spin | 2.0 | Wire Const (differs from 1.0 default) |
| FieldRadiusSqrt | radius | 0.35 | Use registry default (we're adding 0.35) |
| HsvToRgb | sat | 0.85 | Use registry default (close to 1.0) |
| HsvToRgb | val | 0.9 | Use registry default (close to 1.0) |
| RenderInstances2D | size | 3 | Use registry default (close to 5) |

### patchPhyllotaxis (lines 167-186)

| Block | Input | inputDefaults Value | Action |
|-------|-------|---------------------|--------|
| FieldRadiusSqrt | radius | 0.35 | Use registry default |
| HsvToRgb | sat | 0.9 | Use registry default |
| HsvToRgb | val | 0.95 | Use registry default |
| RenderInstances2D | size | 4 | Use registry default |

### patchSpiral (lines 238-265)

| Block | Input | inputDefaults Value | Action |
|-------|-------|---------------------|--------|
| FieldAngularOffset | spin | 3.0 | Wire Const (differs from 1.0 default) |
| FieldRadiusSqrt | radius | 0.35 | Use registry default |
| HsvToRgb | sat | 0.95 | Use registry default |
| HsvToRgb | val | 0.95 | Use registry default |
| RenderInstances2D | size | 4 | Use registry default |

### patchModular (lines 316-335)

| Block | Input | inputDefaults Value | Action |
|-------|-------|---------------------|--------|
| FieldRadiusSqrt | radius | 0.35 | Use registry default |
| HsvToRgb | sat | 0.8 | Use registry default |
| HsvToRgb | val | 0.9 | Use registry default |
| RenderInstances2D | size | 5 | Use registry default |

---

## What the Correct Flow Looks Like

After this sprint, the data flow will be:

```
Block has unconnected input
       │
       ▼
Pass1 checks input.defaultSource (from BlockSpec registry)
       │
       ▼
Creates Const block with registry default value
       │
       ▼
Creates edge from Const → input with role: 'default'
       │
       ▼
Compilation uses Const block value
       │
       ▼
If user edits block.params, recompile picks up new value
```

**This flow already works in the codebase.** The inputDefaults short-circuit just needs to be removed.

---

## Testing Checklist

After implementation:

```bash
# Verify no inputDefaults references
grep -r "inputDefaults" src/
# Expected: 0 results

# Type check
npm run typecheck
# Expected: 0 errors

# Unit tests
npm run test
# Expected: all pass

# Build
npm run build
# Expected: success

# Manual test
npm run dev
# Expected: animation displays correctly
# Expected: inspector edits affect visual output
```
