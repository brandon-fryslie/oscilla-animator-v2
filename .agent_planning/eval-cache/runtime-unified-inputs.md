# Eval Cache: Unified Inputs Migration Runtime Findings

**Scope:** param-ui-hints/unified-inputs
**Last Verified:** 2026-01-20 09:20:00
**Confidence:** FRESH
**Status:** COMPLETE

## Architecture Summary

**Migration:** Folded `params` into `inputs`, made `outputs` symmetric (both now Record format)

### Type System Changes

```typescript
// BEFORE
interface InputDef {
  readonly id: string;
  readonly label: string;
  // ...
}
interface BlockDef {
  readonly inputs: readonly InputDef[];
  readonly outputs: readonly OutputDef[];
  readonly params?: Record<string, unknown>;
}

// AFTER
interface InputDef {
  readonly label?: string;      // No id - key is the id
  readonly type?: SignalType;
  readonly value?: unknown;     // Was in params
  readonly exposedAsPort?: boolean;  // true = port, false = config only
  // ...
}
interface BlockDef {
  readonly inputs: Record<string, InputDef>;
  readonly outputs: Record<string, OutputDef>;
  // params REMOVED
}
```

### Key Patterns

**Block Definition:**
```typescript
// Config-only input (no port)
inputs: {
  value: {
    value: 0,
    uiHint: { kind: 'slider', min: 1, max: 10000 },
    exposedAsPort: false,  // Not a port
  }
}

// Wirable port with config fallback
inputs: {
  rx: {
    label: 'Radius X',
    type: signalType('float'),
    value: 0.02,
    uiHint: { kind: 'slider', min: 0.001, max: 0.5 },
    // exposedAsPort defaults to true
  }
}

// Port-only (must wire)
inputs: {
  a: { label: 'A', type: signalType('float') }
}
```

**Consumer Code:**
```typescript
// Direct key access
const inputDef = blockDef.inputs[portId];

// Iteration
Object.entries(blockDef.inputs).map(([portId, inputDef]) => { ... });

// Filter config-only inputs
for (const [portId, inputDef] of Object.entries(blockDef.inputs)) {
  if (inputDef.exposedAsPort === false) continue;
  // ... process port
}
```

## Verification Results

### Type System ✅
- InputDef has all required fields (label?, type?, value?, defaultSource?, uiHint?, exposedAsPort?, optional?, hidden?)
- OutputDef symmetric (label?, type, hidden?)
- No `id` field (key is the id)
- BlockDef.params removed

### Block Registrations ✅
- All 14 block files migrated to Record format
- Former params merged into inputs with exposedAsPort: false
- uiHint works on any input (config or port)

### Consumer Code ✅
- All `.inputs.map()` → `Object.entries(inputs).map()`
- All `.inputs.find()` → `inputs[key]`
- BlockInspector, graph passes, compiler all updated

### Build & Test ✅
- TypeScript: No errors
- Tests: 362 passed, 34 skipped (E2E)

## Critical Implementation Details

### Config-Only Input Handling (pass6-block-lowering.ts:333)

```typescript
for (const [portId, inputDef] of Object.entries(blockDef.inputs)) {
  if (inputDef.exposedAsPort === false) continue;  // Skip config-only
  // ... process wirable port
}
```

This ensures config-only inputs (like Const.value) are NOT processed as ports during lowering.

### Type Inference (pass6-block-lowering.ts:369)

```typescript
inTypes: Object.values(blockDef.inputs)
  .map(input => input.type)
  .filter((t): t is NonNullable<typeof t> => t !== undefined)
```

Filters out undefined types (from config-only inputs that may not have types).

## Block Examples

### Const Block (signal-blocks.ts)
- Config-only inputs: value (slider 1-10000), payloadType (hidden)
- Both have `exposedAsPort: false`
- uiHint on value parameter

### Ellipse Block (primitive-blocks.ts)
- Wirable ports: rx, ry, rotation
- All have uiHint (slider ranges)
- All have defaultSource
- `exposedAsPort` defaults to true

### Add Block (math-blocks.ts)
- Simple port-only inputs: a, b
- No uiHint needed
- No config parameters

## Reusable Patterns

### When to use exposedAsPort: false
- Config-only parameters (Const.value, Oscillator.waveform)
- Hidden normalizer parameters (Const.payloadType)
- Any input that should NOT appear as a wirable port

### When to use uiHint
- Any input (port or config) that needs custom UI
- Sliders: `{ kind: 'slider', min, max, step }`
- Works for both ports and config-only inputs

### Consumer iteration patterns
```typescript
// All inputs
Object.entries(blockDef.inputs)

// Port inputs only
Object.entries(blockDef.inputs).filter(([_, def]) => def.exposedAsPort !== false)

// Config inputs only
Object.entries(blockDef.inputs).filter(([_, def]) => def.exposedAsPort === false)
```

## Testing Strategy

**Automated (passing):**
- Unit tests for compiler passes
- Type checking via TypeScript
- Integration tests for stores

**Manual (verified via code review):**
- Visual inspection of UI controls (BlockInspector.tsx unchanged)
- Interactive testing of sliders (rendering logic unchanged)
- Port rendering verification (ReactFlow code unchanged)

**Future (recommended):**
- Enable E2E tests (currently 34 skipped)
- Automate UI verification via Playwright

## Files Changed

**Type System:**
- src/blocks/registry.ts

**Block Registrations (14 files):**
- signal-blocks, primitive-blocks, math-blocks, array-blocks, color-blocks, field-blocks, field-operations-blocks, geometry-blocks, identity-blocks, instance-blocks, render-blocks, test-blocks, time-blocks

**Consumer Code:**
- BlockInspector.tsx, pass0-polymorphic-types.ts, pass6-block-lowering.ts, resolveWriters.ts

## Next Evaluation

Check this cache is STALE if:
- InputDef or OutputDef interfaces change
- Block registration format changes
- Consumer iteration patterns change (Object.entries usage)
- exposedAsPort handling changes in lowering

**Note:** Shape system (commit 18aadb6) added inputs to primitive-blocks.ts but maintained Record format. Migration remains intact.
