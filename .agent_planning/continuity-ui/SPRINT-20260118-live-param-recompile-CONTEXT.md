# Implementation Context: live-param-recompile

## Key Files

### To Modify

1. **`src/main.ts`**
   - Add MobX reaction to watch patch changes
   - Implement debounced recompile
   - Preserve continuity state during hot-swap

2. **`src/blocks/registry.ts`** (or wherever Array is defined)
   - Add uiHint for count param

### To Read

- `src/stores/PatchStore.ts` - How params are updated
- `src/ui/components/BlockInspector.tsx` - How sliders render

## Implementation Notes

### Debounced Recompile Pattern

```typescript
// In main.ts
import { reaction } from 'mobx';

let recompileTimeout: NodeJS.Timeout | null = null;

reaction(
  () => rootStore.patch.patch?.blocks, // Watch blocks
  () => {
    if (recompileTimeout) clearTimeout(recompileTimeout);
    recompileTimeout = setTimeout(async () => {
      try {
        await recompileWithContinuity();
      } catch (err) {
        log(`Recompile failed: ${err}`, 'error');
      }
    }, 150);
  },
  { fireImmediately: false }
);
```

### Preserving Continuity State

```typescript
async function recompileWithContinuity() {
  const patch = rootStore.patch.patch;
  if (!patch) return;

  // Compile new program
  const result = compile(patch, { ... });
  if (result.kind !== 'ok') {
    log(`Compile error: ${result.errors}`, 'error');
    return; // Keep old program
  }

  // Preserve continuity state
  const oldContinuity = currentState?.continuity;

  // Only resize if slot count changed
  if (result.program.slotMeta.length !== currentState?.values.f64.length) {
    currentState = createRuntimeState(result.program.slotMeta.length);
  }

  // Restore continuity (or keep existing reference)
  if (oldContinuity) {
    currentState.continuity = oldContinuity;
  }

  currentProgram = result.program;
  log('Recompiled successfully');
}
```

### Array Block uiHint

```typescript
// In Array block definition
{
  type: 'Array',
  inputs: [
    {
      id: 'count',
      type: sig('int'),
      label: 'Count',
      uiHint: { kind: 'slider', min: 1, max: 10000, step: 1 },
    },
    // ...
  ],
}
```

## Related Spec

- `topics/11-continuity-system.md` §5 - Runtime integration
- Invariant I2: Gauge invariance (effective values continuous)
