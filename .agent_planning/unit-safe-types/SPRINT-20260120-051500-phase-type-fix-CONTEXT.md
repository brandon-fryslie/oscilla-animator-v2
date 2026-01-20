# Implementation Context: phase-type-fix

**Sprint**: Consistent Phase Type Usage
**Generated**: 2026-01-20T05:15:00

## Key Files

| File | Purpose | Changes |
|------|---------|---------|
| `src/blocks/time-blocks.ts` | TimeRoot block definition | Fix output types |
| `src/blocks/signal-blocks.ts` | Oscillator block definition | Fix input type |
| `src/blocks/field-operations-blocks.ts` | Field operation blocks | Fix phase input types |
| `src/blocks/field-blocks.ts` | Other field blocks | Audit and fix phase inputs |
| `src/runtime/OpcodeInterpreter.ts` | Opcode-level math | Add documentation |
| `src/runtime/SignalEvaluator.ts` | Signal-level kernels | Add documentation |

## Current State

### TimeRoot (WRONG)
```typescript
outputs: [
  { id: 'tMs', label: 'Time (ms)', type: signalType('float') },
  { id: 'phaseA', label: 'Phase A', type: signalType('float') },  // WRONG
  { id: 'phaseB', label: 'Phase B', type: signalType('float') },  // WRONG
],
```

### TimeRoot (CORRECT)
```typescript
outputs: [
  { id: 'tMs', label: 'Time (ms)', type: signalType('float') },
  { id: 'phaseA', label: 'Phase A', type: signalType('phase') },  // CORRECT
  { id: 'phaseB', label: 'Phase B', type: signalType('phase') },  // CORRECT
],
```

## Helper: Find Phase Inputs

```bash
# Find all blocks with 'phase' in input labels
grep -rn "'phase'" src/blocks/ | grep -i "label.*phase\|id.*phase"
```

## Testing Commands

```bash
npm run typecheck
npm run test
npm run dev
```

## Notes

- The `phase` PayloadType already exists in `canonical-types.ts`
- This change is purely type annotation - no runtime behavior changes
- Future work (Sprint 2) will add unit annotations and validation
