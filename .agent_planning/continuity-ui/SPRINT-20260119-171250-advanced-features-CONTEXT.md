# Implementation Context: Advanced Features

Sprint: advanced-features
Generated: 2026-01-19 17:12:50

## Background

After core controls (decay exponent, tau multiplier) are implemented, this sprint adds power-user debugging features:
1. **Selective Logging**: Choose which semantic types to log (reduces noise)
2. **Gauge Inspector**: See actual gauge buffer values to understand why elements are positioned where they are

These features are for developers debugging continuity behavior, not end-user features.

## Key Design Decisions

### 1. Replace DEBUG_CONTINUITY Constant with Config

**Decision**: Remove hardcoded `DEBUG_CONTINUITY` const, use `continuityConfig.debugLogSemantics` Set instead

**Rationale**:
- Compile-time constant → runtime toggleable
- Selective by semantic type (not all-or-nothing)
- User-controlled via UI (no code changes needed)

**Migration**:
```typescript
// Before:
if (DEBUG_CONTINUITY && semantic === 'position') {
  console.log(...);
}

// After:
if (shouldLogSemantic(state.continuityConfig, semantic)) {
  console.log(...);
}

// Helper:
function shouldLogSemantic(config: ContinuityConfig | undefined, semantic: string): boolean {
  if (!config) return false;
  if (config.debugLogSemantics.size === 0) return false; // Empty = no logging
  return config.debugLogSemantics.has(semantic);
}
```

### 2. Gauge Inspector Samples First 5 Elements

**Decision**: Display only first 5 elements of gauge buffer, not entire buffer

**Rationale**:
- Buffers can be hundreds of elements (e.g., 200 particles)
- Displaying all would overwhelm UI
- First 5 gives enough insight for debugging
- Pattern likely consistent across elements

**Display Format**:
```
Gauge Inspector: position:spiral_instance:out
[0]: gauge= 0.042  (green if positive, red if negative)
[1]: gauge=-0.018
[2]: gauge= 0.031
[3]: gauge= 0.009
[4]: gauge=-0.003
```

### 3. Inspector Updates at 5Hz (Same as Panel)

**Decision**: Sample gauge buffers during ContinuityStore's 5Hz update cycle, not every frame

**Rationale**:
- Consistent with existing panel update rate
- Avoids UI thrashing
- Buffers change gradually (slew/decay), 5Hz sufficient
- Maintains performance (no extra overhead)

**Implementation**: `updateFromRuntime()` in ContinuityStore samples gauge when inspector enabled

## Implementation Notes

### File: src/runtime/RuntimeState.ts

Extend config:
```typescript
export interface ContinuityConfig {
  decayExponent: number;
  tauMultiplier: number;
  // NEW:
  debugLogSemantics: Set<string>;      // 'position', 'radius', 'opacity', 'color'
  showGaugeInspector: boolean;
  inspectedTargetId: string | null;    // StableTargetId or null
}
```

### File: src/runtime/ContinuityApply.ts

Add helper and update logging:
```typescript
function shouldLogSemantic(config: ContinuityConfig | undefined, semantic: string): boolean {
  if (!config) return false;
  if (config.debugLogSemantics.size === 0) return false;
  return config.debugLogSemantics.has(semantic);
}

export function applyContinuity(...) {
  // Replace all DEBUG_CONTINUITY checks:
  if (shouldLogSemantic(state.continuityConfig, semantic)) {
    console.log('[Continuity] Domain change for', semantic, ...);
  }
}
```

### File: src/stores/ContinuityStore.ts

Add inspector support:
```typescript
@computed
get availableTargets(): Array<{ id: string, label: string }> {
  if (!this.runtimeStateRef) return [];
  const targets = this.runtimeStateRef.continuity.targets;
  return Array.from(targets.keys()).map(id => ({
    id,
    label: id, // Format: "semantic:instanceId:port"
  }));
}

getGaugeBufferSample(targetId: string, count: number = 5): number[] {
  if (!this.runtimeStateRef) return [];
  const target = this.runtimeStateRef.continuity.targets.get(targetId as StableTargetId);
  if (!target) return [];

  const sample: number[] = [];
  const limit = Math.min(count, target.gaugeBuffer.length);
  for (let i = 0; i < limit; i++) {
    sample.push(target.gaugeBuffer[i]);
  }
  return sample;
}

@action
toggleDebugSemantic(semantic: string): void {
  if (!this.runtimeStateRef) return;
  const set = this.runtimeStateRef.continuityConfig.debugLogSemantics;
  if (set.has(semantic)) {
    set.delete(semantic);
  } else {
    set.add(semantic);
  }
  // Ensure MobX detects change (may need observable.set)
}

@action
setShowGaugeInspector(show: boolean): void {
  if (this.runtimeStateRef) {
    this.runtimeStateRef.continuityConfig.showGaugeInspector = show;
  }
}

@action
setInspectedTarget(targetId: string | null): void {
  if (this.runtimeStateRef) {
    this.runtimeStateRef.continuityConfig.inspectedTargetId = targetId;
  }
}
```

### File: src/ui/components/app/ContinuityAdvancedControls.tsx

New component:
```typescript
import React from 'react';
import { observer } from 'mobx-react-lite';
import { rootStore } from '../../../stores';
import { colors } from '../../theme';

const SEMANTICS = ['position', 'radius', 'opacity', 'color'];

export const ContinuityAdvancedControls = observer(function ContinuityAdvancedControls() {
  const config = rootStore.continuity.runtimeStateRef?.continuityConfig;
  if (!config) return null;

  const { debugLogSemantics, showGaugeInspector } = config;

  return (
    <div style={{ padding: '0.5rem', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '4px' }}>
      {/* Logging Toggles */}
      <div style={{ marginBottom: '0.75rem' }}>
        <div style={{ fontSize: '0.75rem', marginBottom: '0.25rem', color: colors.textMuted }}>
          Debug Logging:
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {SEMANTICS.map(semantic => (
            <label key={semantic} style={{ display: 'flex', alignItems: 'center', fontSize: '0.75rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={debugLogSemantics.has(semantic)}
                onChange={() => rootStore.continuity.toggleDebugSemantic(semantic)}
                style={{ marginRight: '0.25rem' }}
              />
              <span style={{ color: getSemanticColor(semantic) }}>
                {semantic}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Gauge Inspector Toggle */}
      <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.75rem', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={showGaugeInspector}
          onChange={(e) => rootStore.continuity.setShowGaugeInspector(e.target.checked)}
          style={{ marginRight: '0.25rem' }}
        />
        Show Gauge Inspector
      </label>
    </div>
  );
});

function getSemanticColor(semantic: string): string {
  switch (semantic) {
    case 'position': return colors.primary;
    case 'radius': return '#6bff6b';
    case 'opacity': return '#ffd93d';
    case 'color': return '#ff6bff';
    default: return colors.textPrimary;
  }
}
```

### File: src/ui/components/app/GaugeInspector.tsx

New component:
```typescript
import React from 'react';
import { observer } from 'mobx-react-lite';
import { rootStore } from '../../../stores';
import { colors } from '../../theme';

export const GaugeInspector = observer(function GaugeInspector() {
  const config = rootStore.continuity.runtimeStateRef?.continuityConfig;
  const targets = rootStore.continuity.availableTargets;

  if (!config?.showGaugeInspector) return null;

  const selectedId = config.inspectedTargetId;
  const sample = selectedId ? rootStore.continuity.getGaugeBufferSample(selectedId, 5) : [];

  return (
    <div style={{
      marginTop: '0.5rem',
      padding: '0.5rem',
      background: 'rgba(255, 255, 255, 0.02)',
      borderRadius: '4px',
      fontFamily: "'SF Mono', Monaco, monospace",
    }}>
      <div style={{ fontSize: '0.75rem', marginBottom: '0.25rem', color: colors.textMuted }}>
        Gauge Inspector:
      </div>

      {/* Target Selector */}
      <select
        value={selectedId || ''}
        onChange={(e) => rootStore.continuity.setInspectedTarget(e.target.value || null)}
        style={{
          width: '100%',
          marginBottom: '0.5rem',
          padding: '0.25rem',
          fontSize: '0.75rem',
          background: '#1a1a2e',
          color: colors.textPrimary,
          border: `1px solid ${colors.border}`,
        }}
      >
        <option value="">-- Select Target --</option>
        {targets.map(t => (
          <option key={t.id} value={t.id}>{t.label}</option>
        ))}
      </select>

      {/* Buffer Values */}
      {!selectedId && (
        <div style={{ fontSize: '0.75rem', color: colors.textMuted, fontStyle: 'italic' }}>
          Select a target to inspect gauge buffer
        </div>
      )}
      {selectedId && sample.length === 0 && (
        <div style={{ fontSize: '0.75rem', color: colors.textMuted, fontStyle: 'italic' }}>
          No gauge data (all zeros)
        </div>
      )}
      {selectedId && sample.length > 0 && (
        <div style={{ fontSize: '0.75rem', lineHeight: '1.4' }}>
          {sample.map((value, i) => {
            const color = value > 0 ? '#6bff6b' : value < 0 ? '#ff6b6b' : colors.textMuted;
            return (
              <div key={i}>
                [{i}]: gauge=<span style={{ color, fontWeight: 'bold' }}>{value.toFixed(3).padStart(7)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});
```

### File: src/ui/components/app/ContinuityPanel.tsx

Integrate advanced section:
```typescript
const [advancedExpanded, setAdvancedExpanded] = useState(false);

// In render:
{/* Advanced Section (NEW) */}
<Section
  title={advancedExpanded ? '▼ Advanced' : '▶ Advanced'}
  onClick={() => setAdvancedExpanded(!advancedExpanded)}
  style={{ cursor: 'pointer' }}
>
  {advancedExpanded && (
    <>
      <ContinuityAdvancedControls />
      <GaugeInspector />
    </>
  )}
</Section>
```

## Testing Strategy

### Manual Testing

1. **Selective Logging**:
   - Start app with continuity active
   - Open continuity panel → Advanced
   - Check "position" only
   - Trigger domain change (change Array count)
   - Verify: Only position logs in console, no radius/opacity/color

2. **Gauge Inspector**:
   - Enable gauge inspector checkbox
   - Select a position target from dropdown
   - Trigger domain change
   - Verify: Gauge values appear and update in real-time
   - Values should decay toward zero over ~1800ms

3. **Edge Cases**:
   - No active targets: Dropdown shows "-- Select Target --"
   - Target with all-zero gauge: Shows "No gauge data"
   - Hot-swap: Config persists, inspector still works

### Automated Testing

- Not critical for this sprint (UI-focused)
- Existing tests should still pass (no regressions)

## Performance Considerations

| Operation | Frequency | Cost | Mitigation |
|-----------|-----------|------|------------|
| Logging check | Per-frame | O(1) Set.has() | Negligible |
| Gauge sampling | 5Hz | O(1) array slice | Negligible (only 5 elements) |
| MobX reactivity | On checkbox change | O(1) | No performance impact |

**Conclusion**: No measurable performance impact expected.

## Future Extensions

- **Preset Logging Profiles**: "All", "None", "Position Only"
- **Gauge History Graph**: Plot gauge values over time (like DevTools perf timeline)
- **Export Logs**: Button to save console logs to file
- **Visual Gauge Overlay**: Render gauge offsets as vectors on canvas
