# Implementation Context: unified-inputs Sprint

**Generated:** 2026-01-20

## Files to Modify

### Type Definitions (1 file)
- `src/blocks/registry.ts` - InputDef, OutputDef, BlockDef, registerBlock validation

### Block Files (14 files)
- `src/blocks/array-blocks.ts`
- `src/blocks/color-blocks.ts`
- `src/blocks/field-blocks.ts`
- `src/blocks/field-operations-blocks.ts`
- `src/blocks/geometry-blocks.ts`
- `src/blocks/identity-blocks.ts`
- `src/blocks/instance-blocks.ts`
- `src/blocks/math-blocks.ts`
- `src/blocks/primitive-blocks.ts`
- `src/blocks/render-blocks.ts`
- `src/blocks/signal-blocks.ts`
- `src/blocks/test-blocks.ts`
- `src/blocks/time-blocks.ts`
- `src/blocks/registry.ts` (already counted above)

### Consumer Code (12 files)
- `src/ui/components/BlockInspector.tsx` - Heavy changes
- `src/ui/components/BlockLibrary.tsx`
- `src/ui/components/ConnectionPicker.tsx`
- `src/ui/reactFlowEditor/nodes.ts`
- `src/ui/reactFlowEditor/OscillaNode.tsx`
- `src/ui/reactFlowEditor/typeValidation.ts`
- `src/graph/passes/pass0-polymorphic-types.ts`
- `src/graph/passes/pass1-default-sources.ts`
- `src/graph/passes/pass2-adapters.ts`
- `src/compiler/passes-v2/pass2-types.ts`
- `src/compiler/passes-v2/pass6-block-lowering.ts`
- `src/compiler/passes-v2/resolveWriters.ts`
- `src/stores/PatchStore.ts`
- `src/stores/PortHighlightStore.ts`

## Conversion Patterns

### Array to Record (block registrations)

```typescript
// BEFORE
inputs: [
  { id: 'a', label: 'A', type: canonicalType('float') },
  { id: 'b', label: 'B', type: canonicalType('float') },
],
outputs: [
  { id: 'out', label: 'Output', type: canonicalType('float') },
],
params: {
  someConfig: 42,
},

// AFTER
inputs: {
  a: { label: 'A', type: canonicalType('float') },
  b: { label: 'B', type: canonicalType('float') },
  someConfig: { value: 42, exposedAsPort: false },
},
outputs: {
  out: { label: 'Output', type: canonicalType('float') },
},
```

### Consumer code patterns

```typescript
// Iteration
// BEFORE: inputs.map(input => ...)
// AFTER:  Object.entries(inputs).map(([id, input]) => ...)

// Lookup
// BEFORE: inputs.find(i => i.id === portId)
// AFTER:  inputs[portId]

// Length
// BEFORE: inputs.length
// AFTER:  Object.keys(inputs).length

// Filter exposed ports
// BEFORE: inputs (all were ports)
// AFTER:  Object.entries(inputs).filter(([_, d]) => d.exposedAsPort !== false)
```

### Config in lower functions

```typescript
// lower functions receive config which should be:
// { [key]: inputs[key].value for each input }

// The code that builds config needs to be found and updated
// Likely in pass6-block-lowering.ts or the normalizer
```

## Helper Function (consider adding)

```typescript
// In registry.ts - helper to get ports only
export function getExposedInputs(def: BlockDef): [string, InputDef][] {
  return Object.entries(def.inputs).filter(([_, d]) => d.exposedAsPort !== false);
}

export function getExposedOutputs(def: BlockDef): [string, OutputDef][] {
  return Object.entries(def.outputs).filter(([_, d]) => !d.hidden);
}
```

## Key Invariant

**`exposedAsPort` defaults to `true`** for backward compatibility. Only explicitly set to `false` for config-only inputs like:
- `Const.value` (no port, just config)
- `Const.payloadType` (hidden, set by normalizer)

## Testing Commands

```bash
npm run typecheck  # Check types
npm run build      # Full build
npm run test       # Run tests
npm run dev        # Manual testing
```
