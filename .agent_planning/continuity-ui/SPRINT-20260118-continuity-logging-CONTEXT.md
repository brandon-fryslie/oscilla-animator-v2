# Implementation Context: continuity-logging

## Key Files

### To Modify

1. **`src/runtime/ScheduleExecutor.ts`**
   - Replace placeholder handlers with real implementation
   - Wire continuity mapping and apply logic

2. **`src/runtime/ContinuityApply.ts`**
   - Add optional logging callback parameter
   - Or emit events via EventBus

### To Read

- `src/runtime/ContinuityMapping.ts` - detectDomainChange
- `src/runtime/ContinuityState.ts` - state management
- `src/stores/DiagnosticsStore.ts` - logging interface

## Implementation Notes

### ScheduleExecutor Integration

```typescript
// In ScheduleExecutor.ts executeStep()

case 'continuityMapBuild': {
  const { instanceId, outputMapping } = step;
  const domain = this.getDomainInstance(instanceId);

  // Detect domain change
  const result = detectDomainChange(
    instanceId,
    domain,
    state.continuity.prevDomains
  );

  if (result.changed) {
    // Store mapping
    if (result.mapping) {
      state.continuity.mappings.set(instanceId, result.mapping);
    }
    state.continuity.domainChangeThisFrame = true;

    // Log change
    const oldCount = state.continuity.prevDomains.get(instanceId)?.count ?? 0;
    const { mapped, unmapped } = result.mapping
      ? countMappedElements(result.mapping)
      : { mapped: 0, unmapped: domain.count };

    this.log?.(`Domain change: ${instanceId} ${oldCount}→${domain.count}`);
    this.log?.(`  Mapped: ${mapped}, New: ${unmapped}`);
  }

  // Update prev domain
  state.continuity.prevDomains.set(instanceId, domain);
  break;
}

case 'continuityApply': {
  const { targetKey, instanceId, policy, baseSlot, outputSlot, semantic } = step;

  // Get buffers
  const baseBuffer = this.getBuffer(baseSlot);
  const outputBuffer = baseSlot === outputSlot ? baseBuffer : this.getBuffer(outputSlot);

  // Apply continuity
  applyContinuity(step, state, (slot) => this.getBuffer(slot));
  break;
}
```

### Log Throttling

```typescript
// Throttle state per instance
const lastLogTime = new Map<string, number>();
const LOG_INTERVAL_MS = 200; // Max 5/sec

function throttledLog(instanceId: string, msg: string) {
  const now = performance.now();
  const last = lastLogTime.get(instanceId) ?? 0;

  if (now - last >= LOG_INTERVAL_MS) {
    log(msg, 'info');
    lastLogTime.set(instanceId, now);
  }
}
```

## Related Spec

- `topics/11-continuity-system.md` §3.3-3.5 - Mapping algorithms
- `topics/11-continuity-system.md` §5 - Runtime integration
