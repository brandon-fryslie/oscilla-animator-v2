# Implementation Context: continuity-panel

## Key Files

### To Create

1. **`src/stores/ContinuityStore.ts`**
   - MobX store for continuity state
   - Observable: targets, mappings, lastChange

2. **`src/ui/dockview/panels/ContinuityPanel.tsx`**
   - React component for panel
   - observer() for MobX

### To Modify

1. **`src/stores/RootStore.ts`**
   - Add continuity store

2. **`src/ui/dockview/panelRegistry.ts`**
   - Register ContinuityPanel

3. **`src/ui/dockview/defaultLayout.ts`**
   - Add to bottom panel group

4. **`src/main.ts`**
   - Update continuity store from animation loop

## Implementation Notes

### ContinuityStore

```typescript
// src/stores/ContinuityStore.ts
import { makeObservable, observable, action, runInAction } from 'mobx';
import type { ContinuityState, StableTargetId } from '../runtime/ContinuityState';

export interface TargetSummary {
  id: StableTargetId;
  semantic: string;
  instanceId: string;
  count: number;
  slewProgress: number; // 0-1
}

export interface MappingSummary {
  instanceId: string;
  kind: 'identity' | 'byId' | 'byPosition';
  mapped: number;
  unmapped: number;
}

export class ContinuityStore {
  targets: TargetSummary[] = [];
  mappings: MappingSummary[] = [];
  lastDomainChangeMs: number = 0;
  domainChangeThisFrame: boolean = false;

  constructor() {
    makeObservable(this, {
      targets: observable,
      mappings: observable,
      lastDomainChangeMs: observable,
      domainChangeThisFrame: observable,
      updateFromRuntime: action,
    });
  }

  updateFromRuntime(continuity: ContinuityState, tMs: number): void {
    // Extract target summaries
    const targets: TargetSummary[] = [];
    for (const [id, state] of continuity.targets) {
      const parts = (id as string).split(':');
      targets.push({
        id,
        semantic: parts[0],
        instanceId: parts[1],
        count: state.count,
        slewProgress: 1.0, // TODO: compute actual progress
      });
    }

    // Extract mapping summaries
    const mappings: MappingSummary[] = [];
    for (const [instanceId, mapping] of continuity.mappings) {
      let mapped = 0, unmapped = 0;
      if (mapping.kind === 'identity') {
        mapped = mapping.count;
      } else {
        for (const idx of mapping.newToOld) {
          if (idx >= 0) mapped++;
          else unmapped++;
        }
      }
      mappings.push({ instanceId, kind: mapping.kind, mapped, unmapped });
    }

    runInAction(() => {
      this.targets = targets;
      this.mappings = mappings;
      this.domainChangeThisFrame = continuity.domainChangeThisFrame;
      if (continuity.domainChangeThisFrame) {
        this.lastDomainChangeMs = tMs;
      }
    });
  }
}
```

### ContinuityPanel

```tsx
// src/ui/dockview/panels/ContinuityPanel.tsx
import React from 'react';
import { observer } from 'mobx-react-lite';
import { rootStore } from '../../../stores';
import { colors } from '../../theme';

export const ContinuityPanel = observer(function ContinuityPanel() {
  const { targets, mappings, lastDomainChangeMs, domainChangeThisFrame } = rootStore.continuity;

  return (
    <div style={{ padding: '12px', fontSize: '13px', color: colors.textPrimary }}>
      <div style={{ marginBottom: '16px' }}>
        <h4 style={{ margin: '0 0 8px', color: colors.textSecondary }}>
          Continuity State
          {domainChangeThisFrame && (
            <span style={{ color: colors.warning, marginLeft: '8px' }}>
              (domain changed)
            </span>
          )}
        </h4>
        <div style={{ fontSize: '12px', color: colors.textMuted }}>
          Last change: {lastDomainChangeMs.toFixed(0)}ms
        </div>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <h4 style={{ margin: '0 0 8px', color: colors.textSecondary }}>
          Active Targets ({targets.length})
        </h4>
        {targets.length === 0 ? (
          <div style={{ color: colors.textMuted }}>No active targets</div>
        ) : (
          targets.map(t => (
            <div key={t.id} style={{
              padding: '8px',
              background: colors.bgPanel,
              borderRadius: '4px',
              marginBottom: '4px',
            }}>
              <div><strong>{t.semantic}</strong>: {t.instanceId}</div>
              <div style={{ fontSize: '12px', color: colors.textMuted }}>
                Count: {t.count}
              </div>
            </div>
          ))
        )}
      </div>

      <div>
        <h4 style={{ margin: '0 0 8px', color: colors.textSecondary }}>
          Mappings ({mappings.length})
        </h4>
        {mappings.map(m => (
          <div key={m.instanceId} style={{
            padding: '8px',
            background: colors.bgPanel,
            borderRadius: '4px',
            marginBottom: '4px',
          }}>
            <div><strong>{m.instanceId}</strong> ({m.kind})</div>
            <div style={{ fontSize: '12px', color: colors.textMuted }}>
              Mapped: {m.mapped}, New: {m.unmapped}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});
```

### Batched Updates (in main.ts)

```typescript
// Update continuity store at 5Hz (every 200ms)
let lastContinuityUpdate = 0;
const CONTINUITY_UPDATE_INTERVAL = 200;

function animate(tMs: number) {
  // ... existing code ...

  // Update continuity store (batched)
  if (tMs - lastContinuityUpdate >= CONTINUITY_UPDATE_INTERVAL) {
    rootStore.continuity.updateFromRuntime(currentState.continuity, tMs);
    lastContinuityUpdate = tMs;
  }
}
```

## Related Spec

- `topics/11-continuity-system.md` - All sections
