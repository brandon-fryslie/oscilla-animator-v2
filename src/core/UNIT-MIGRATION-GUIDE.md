# Unit Annotation Migration Guide

## Overview

The Unit Annotation System adds optional unit tracking to numeric SignalTypes, enabling compile-time detection of unit mismatches (phase vs radians, ms vs seconds, etc.).

**Key principle**: Units are OPTIONAL and backwards-compatible. Existing blocks continue to work without changes.

## Quick Start

### Adding Units to a Block

```typescript
import { registerBlock } from '../blocks/registry';
import { signalTypeSignal } from '../core/canonical-types';

registerBlock({
  type: 'Oscillator',
  // ... other fields ...
  outputs: [
    {
      id: 'phase',
      label: 'Phase',
      type: signalTypeSignal('float', 'phase'), // <-- Add unit here
    },
  ],
});
```

### Available Units

| Unit | Range/Notes | Use Cases |
|------|-------------|-----------|
| `phase` | [0, 1) cyclic | sin/cos signal kernels, oscillators, phase arithmetic |
| `radians` | [0, 2π) or unbounded | Field polar conversions, angular calculations |
| `normalized` | [0, 1] clamped | Easing functions, opacity, normalizedIndex intrinsic |
| `scalar` | Dimensionless float | Arithmetic results, generic numbers |
| `ms` | Milliseconds | Time rail (tMs), duration values |
| `#` | Count/index | index intrinsic, array positions |
| `degrees` | [0, 360) | Future: user-facing angle inputs |
| `seconds` | Time in seconds | Future: user-facing time values |

## Unit Semantics

### Phase vs Radians

**Critical distinction**: Signal kernels and field kernels expect different units.

- **Signal kernels** (sin/cos/tan): Expect `phase` [0,1) and convert to radians internally
  - Example: `sin(phase)` → converts to `Math.sin(phase * 2π)`

- **Field kernels** (polar layouts, circular geometry): Work directly in `radians`
  - Example: `fieldPolarToCartesian(..., angle_radians)`

This is the PRIMARY unit mismatch we want to detect.

### Common Patterns

**Oscillator blocks**:
```typescript
outputs: [
  { id: 'phase', type: signalTypeSignal('float', 'phase') },
  { id: 'sine', type: signalTypeSignal('float', 'scalar') }, // output of trig function
]
```

**Time rails**:
```typescript
outputs: [
  { id: 'tMs', type: signalTypeSignal('int', 'ms') },
  { id: 'phaseA', type: signalTypeSignal('phase', 'phase') },
  { id: 'dt', type: signalTypeSignal('float', 'ms') },
]
```

**Intrinsic properties**:
```typescript
// In IRBuilder
const idxField = builder.fieldIntrinsic(instanceId, 'index',
  signalTypeField('int', instanceId, '#'));
const id01Field = builder.fieldIntrinsic(instanceId, 'normalizedIndex',
  signalTypeField('float', instanceId, 'normalized'));
```

## Validation Behavior

### When Warnings Are Emitted

**Rule**: Warning only if BOTH sides have units AND they differ.

```typescript
// WARNING: phase vs radians mismatch
Oscillator[phase] → FieldPolarLayout[angle]
// Output: [Unit Mismatch] connecting phase to radians. Consider adding conversion block.

// NO WARNING: units match
Oscillator[phase] → Sin[input]

// NO WARNING: no unit annotation (backwards compatible)
OldBlock[output] → AnotherOldBlock[input]

// NO WARNING: one side has no unit
Oscillator[phase] → GenericBlock[input]  // GenericBlock has no unit annotation
```

### Migration Strategy

1. **Start with critical blocks**: Oscillator, Time rails, Trig functions
2. **Add units gradually**: No rush - system is backwards compatible
3. **Follow the warnings**: When you see a unit mismatch, decide:
   - Is this a real bug? Add conversion block.
   - Are the units actually compatible? Update annotation.
   - Is unit tracking not needed here? Leave unannotated.

## Examples

### Example 1: Oscillator + Sin (No Warning)

```typescript
// Oscillator outputs phase
registerBlock({
  type: 'Oscillator',
  outputs: [
    { id: 'phase', type: signalTypeSignal('float', 'phase') },
  ],
});

// Sin expects phase
registerBlock({
  type: 'Sin',
  inputs: [
    { id: 'phase', type: signalTypeSignal('float', 'phase') },
  ],
  outputs: [
    { id: 'value', type: signalTypeSignal('float', 'scalar') },
  ],
});
```

When connected: Oscillator[phase] → Sin[phase]
Result: No warning (units match)

### Example 2: Phase to Field Polar (Warning)

```typescript
// Oscillator outputs phase
registerBlock({
  type: 'Oscillator',
  outputs: [
    { id: 'phase', type: signalTypeSignal('float', 'phase') },
  ],
});

// FieldPolarLayout expects radians
registerBlock({
  type: 'FieldPolarLayout',
  inputs: [
    { id: 'angle', type: signalTypeField('float', instanceId, 'radians') },
  ],
});
```

When connected: Oscillator[phase] → FieldPolarLayout[angle]
Result: **WARNING** - phase vs radians mismatch

Fix: Insert a phase→radians conversion:
```typescript
registerBlock({
  type: 'PhaseToRadians',
  inputs: [{ id: 'phase', type: signalTypeSignal('float', 'phase') }],
  outputs: [{ id: 'radians', type: signalTypeSignal('float', 'radians') }],
  // Implementation: radians = phase * 2π
});
```

### Example 3: Intrinsics with Units

```typescript
// In a block's lower() method
const b = ctx.builder;

// Index intrinsic - integer count
const indexField = b.fieldIntrinsic(instanceId, 'index',
  signalTypeField('int', instanceId, '#'));

// Normalized index - [0,1] for gradients
const id01Field = b.fieldIntrinsic(instanceId, 'normalizedIndex',
  signalTypeField('float', instanceId, 'normalized'));

// Random ID - normalized for randomness
const randField = b.fieldIntrinsic(instanceId, 'randomId',
  signalTypeField('float', instanceId, 'normalized'));
```

## Helper Functions

All `signalType*` helpers accept an optional unit parameter:

```typescript
// Signal (one + continuous)
signalTypeSignal('float', 'phase')

// Field (many + continuous)
signalTypeField('float', instanceId, 'normalized')

// Trigger (one + discrete)
signalTypeTrigger('float', 'ms')

// Static (zero + continuous)
signalTypeStatic('int', '#')
```

## Kernel Signatures

Kernel unit expectations are declared in `src/runtime/kernel-signatures.ts`:

```typescript
export const KERNEL_SIGNATURES = {
  sin: {
    inputs: [{ expectedUnit: 'phase' }],
    output: { unit: 'scalar' },
  },
  circleAngle: {
    inputs: [
      { expectedUnit: 'normalized' },
      { expectedUnit: 'phase' },
    ],
    output: { unit: 'radians' },
  },
  // ... etc
};
```

These signatures are for DOCUMENTATION and VALIDATION only. They do not affect runtime behavior.

## Future Work

### Diagnostic Integration (Sprint 3+)

Currently, unit mismatches emit `console.warn`. Future versions will integrate with DiagnosticHub for proper UI display:

```typescript
// TODO: Replace console.warn with diagnostic emission
diagnosticHub.emit({
  code: 'W_UNIT_MISMATCH',
  severity: 'warn',
  primaryTarget: { kind: 'port', blockId, portId },
  message: `Unit mismatch: connecting ${fromUnit} to ${toUnit}`,
});
```

### Auto-Conversion (Future)

Current policy: Explicit-only (warnings, no auto-insert).

Future option: Auto-insert conversion blocks with warnings:
```typescript
// Compiler could auto-insert phaseToRadians block
Oscillator[phase] → (auto: PhaseToRadians) → FieldPolar[radians]
```

This would require:
- Conversion block registry
- User preference setting
- Clear visual indication in graph editor

## Testing

### Unit Tests

See `src/compiler/passes-v2/__tests__/unit-validation.test.ts` for examples:

```typescript
it('should emit warning when connecting phase to radians', () => {
  // Create blocks with unit annotations
  // Connect with mismatched units
  // Verify warning emitted
});
```

### Integration Testing

1. Create test patch with intentional unit mismatch
2. Compile and verify warning in console
3. Fix mismatch, verify warning disappears

## FAQ

**Q: Do I need to add units to all my blocks?**
A: No! Units are optional. Add them when they help catch bugs.

**Q: What if I connect mismatched units?**
A: You'll see a warning in console. Patch still compiles and runs. Decide if it's a real issue.

**Q: Can I have different units for same payload type?**
A: Yes! That's the point. `float` with `phase` is different from `float` with `radians`.

**Q: What about runtime performance?**
A: Zero impact. Units are erased at compile time - they only exist during type checking.

**Q: Should I annotate all float ports?**
A: Only when the unit matters. Generic arithmetic doesn't need units.

## Related Files

- `src/core/canonical-types.ts` - NumericUnit type definition, SignalType extension
- `src/runtime/kernel-signatures.ts` - Kernel unit expectations
- `src/compiler/passes-v2/pass2-types.ts` - Unit validation implementation
- `src/compiler/passes-v2/__tests__/unit-validation.test.ts` - Tests

## Spec Reference

This feature is not yet in the canonical spec. It's an enhancement to the type system that maintains spec compatibility while adding safety.

Future spec section: `topics/02-type-system.md` - Unit Annotations subsection
