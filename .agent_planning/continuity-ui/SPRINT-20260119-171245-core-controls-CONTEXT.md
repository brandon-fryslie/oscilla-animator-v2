# Implementation Context: Core Controls

Sprint: core-controls
Generated: 2026-01-19 17:12:45

## Background

This sprint adds user-facing controls for the recently-implemented gauge decay feature. Previously, gauge decay parameters (exponent=0.7, tau=360ms) were hardcoded. Now users can tune these parameters in real-time to:
- Debug continuity behavior
- Experiment with different animation feels
- Understand how parameters affect transitions

## Key Design Decisions

### 1. Config Lives in RuntimeState

**Decision**: Store control values in `RuntimeState.continuityConfig`, not in ContinuityStore

**Rationale**:
- RuntimeState survives hot-swap (recompilation)
- ContinuityApply.ts needs direct access to config (runs per-frame)
- Avoiding prop-drilling through layers
- Consistent with other runtime config patterns

**Implication**: ContinuityStore needs reference to RuntimeState to update config

### 2. Collapsible Controls Section

**Decision**: Add controls as collapsible section in existing ContinuityPanel (default: collapsed)

**Rationale**:
- Single source of truth (one panel for all continuity)
- Avoids clutter while keeping discoverability
- Consistent with evaluation recommendation (Option A)

**Alternative Considered**: Separate "Continuity Settings" panel
- Rejected: Too many panels to manage, splits attention

### 3. Real-Time Application

**Decision**: Config changes apply immediately on next frame (no "Apply" button)

**Rationale**:
- Allows live tuning while watching animation
- Consistent with other real-time dev tools (Chrome DevTools)
- Simpler UX (no state discrepancy between slider and actual behavior)

**Risk**: Mid-slew changes could cause artifacts
**Mitigation**: Test empirically; likely smooth due to exponential math

## Implementation Notes

### File: src/runtime/RuntimeState.ts

Add config interface and field:
```typescript
export interface ContinuityConfig {
  decayExponent: number;      // 0.1-2.0, default 0.7
  tauMultiplier: number;      // 0.5-3.0, default 1.0
}

export interface RuntimeState {
  // ... existing fields ...
  continuityConfig: ContinuityConfig;
}
```

### File: src/runtime/index.ts (or createRuntimeState location)

Initialize config:
```typescript
continuityConfig: {
  decayExponent: 0.7,
  tauMultiplier: 1.0,
}
```

### File: src/runtime/ContinuityApply.ts

Modify `decayGauge()`:
```typescript
export function decayGauge(
  gaugeBuffer: Float32Array,
  tauMs: number,
  dtMs: number,
  length: number,
  exponent: number  // NEW: from config
): void {
  const baseDecay = Math.exp(-dtMs / tauMs);
  const decay = Math.pow(baseDecay, exponent);
  for (let i = 0; i < length; i++) {
    gaugeBuffer[i] *= decay;
  }
}
```

In `applyContinuity()`, read config:
```typescript
const config = state.continuityConfig;
const exponent = config?.decayExponent ?? 0.7;
const tauMultiplier = config?.tauMultiplier ?? 1.0;
const effectiveTau = policy.tauMs * tauMultiplier;

// Call with config values:
decayGauge(targetState.gaugeBuffer, effectiveTau, dtMs, bufferLength, exponent);
applySlewFilter(..., effectiveTau, ...);
```

### File: src/stores/ContinuityStore.ts

Add config observables and actions:
```typescript
@observable
get decayExponent(): number {
  return this.runtimeStateRef?.continuityConfig.decayExponent ?? 0.7;
}

@observable
get tauMultiplier(): number {
  return this.runtimeStateRef?.continuityConfig.tauMultiplier ?? 1.0;
}

@action
setDecayExponent(value: number): void {
  if (this.runtimeStateRef) {
    this.runtimeStateRef.continuityConfig.decayExponent = value;
  }
}

@action
setTauMultiplier(value: number): void {
  if (this.runtimeStateRef) {
    this.runtimeStateRef.continuityConfig.tauMultiplier = value;
  }
}

@action
resetToDefaults(): void {
  if (this.runtimeStateRef) {
    this.runtimeStateRef.continuityConfig.decayExponent = 0.7;
    this.runtimeStateRef.continuityConfig.tauMultiplier = 1.0;
  }
}

@action
clearContinuityState(): void {
  if (this.runtimeStateRef) {
    this.runtimeStateRef.continuity.targets.clear();
    this.runtimeStateRef.continuity.mappings.clear();
    this.runtimeStateRef.continuity.lastTModelMs = 0;
    this.runtimeStateRef.continuity.domainChangeThisFrame = false;
  }
}
```

### File: src/ui/components/app/ContinuityControls.tsx

New component:
```typescript
import React from 'react';
import { observer } from 'mobx-react-lite';
import { rootStore } from '../../../stores';
import { colors } from '../../theme';

export const ContinuityControls = observer(function ContinuityControls() {
  const { decayExponent, tauMultiplier } = rootStore.continuity;

  return (
    <div style={{ padding: '0.5rem', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '4px' }}>
      {/* Decay Exponent Slider */}
      <ControlRow
        label="Decay Curve"
        value={decayExponent}
        min={0.1}
        max={2.0}
        step={0.1}
        onChange={(v) => rootStore.continuity.setDecayExponent(v)}
        helpText="<0.7 = gentler start, >0.7 = more linear"
      />

      {/* Tau Multiplier Slider */}
      <ControlRow
        label="Time Scale"
        value={tauMultiplier}
        min={0.5}
        max={3.0}
        step={0.1}
        onChange={(v) => rootStore.continuity.setTauMultiplier(v)}
        helpText="Multiplier for all transition times"
      />

      {/* Buttons */}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
        <button
          onClick={() => rootStore.continuity.resetToDefaults()}
          style={{ flex: 1, padding: '0.375rem', fontSize: '0.75rem' }}
        >
          Reset to Defaults
        </button>
        <button
          onClick={() => {
            if (window.confirm('Clear all continuity state?')) {
              rootStore.continuity.clearContinuityState();
            }
          }}
          style={{ flex: 1, padding: '0.375rem', fontSize: '0.75rem', color: colors.warning }}
        >
          Clear State
        </button>
      </div>
    </div>
  );
});

interface ControlRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  helpText: string;
}

function ControlRow({ label, value, min, max, step, onChange, helpText }: ControlRowProps) {
  return (
    <div style={{ marginBottom: '0.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
        <span>{label}</span>
        <span style={{ color: colors.primary, fontWeight: 'bold' }}>{value.toFixed(1)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: '100%' }}
      />
      <div style={{ fontSize: '0.675rem', color: colors.textMuted, fontStyle: 'italic' }}>
        {helpText}
      </div>
    </div>
  );
}
```

### File: src/ui/components/app/ContinuityPanel.tsx

Add collapsible section:
```typescript
const [controlsExpanded, setControlsExpanded] = useState(false);

return (
  <div style={{...}}>
    {/* Header (existing) */}
    <div>...</div>

    {/* Controls Section (NEW) */}
    <Section
      title={controlsExpanded ? '▼ Controls' : '▶ Controls'}
      onClick={() => setControlsExpanded(!controlsExpanded)}
      style={{ cursor: 'pointer' }}
    >
      {controlsExpanded && <ContinuityControls />}
    </Section>

    {/* Recent Changes (existing) */}
    <Section title={...}>...</Section>
    ...
  </div>
);
```

## Testing Strategy

1. **Unit Tests**: Not critical for this sprint (UI-heavy, hard to unit test sliders)
2. **Integration Testing**: Manual testing with real continuity operations
3. **Visual Verification**: Record before/after videos of decay curves

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Config access overhead | Low | Low | Simple field read, negligible cost |
| Mid-slew artifacts | Medium | Low | Test empirically; exponential math likely smooth |
| State sync bugs | Low | Medium | Use direct RuntimeState ref for clarity |
| UX confusion | Low | Low | Clear labels and help text |

## Future Extensions

After core controls work:
- Per-semantic tau overrides (position vs radius)
- Gauge buffer inspector (show actual values)
- Per-semantic debug logging toggles
- Preset buttons ("Snappy", "Smooth", "Slow")
- Visual curve preview (graph showing decay over time)
