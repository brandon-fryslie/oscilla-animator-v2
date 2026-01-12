# Spec: Debug System Primitives

**Date:** 2025-12-28
**Status:** PROPOSED
**Category:** Debug System
**Priority:** Tier 2

---

## Overview

The debug system has gaps in IR-compatible debugging, signal probing, and visualization of runtime state.

---

## Backlog Checklist

- [ ] Add IR-compatible DebugDisplay with debug probe step + registry.
- [ ] Add signal history buffer + waveform visualization UI.
- [ ] Add field visualization modes (heatmap/histogram/scatter/list).
- [ ] Add runtime state inspector (values/state/events snapshot).

---

## Gap 1: DebugDisplay Not IR-Compatible (HIGH)

### Current State

**Location:** `src/editor/compiler/blocks/debug/DebugDisplay.ts`

DebugDisplay block only works in closure mode.

### Impact

- Can't debug values in IR mode
- No visual feedback during IR execution

### Proposed Solution

```typescript
// Debug probe step in IR
interface StepDebugProbe {
  kind: "debugProbe";
  probeId: string;
  slot: ValueSlot;
  type: TypeDesc;
  label: string;
  format: DebugFormat;
}

type DebugFormat =
  | { kind: "raw" }
  | { kind: "number"; precision: number }
  | { kind: "phase"; format: "degrees" | "radians" | "percent" }
  | { kind: "color"; format: "hex" | "rgb" | "hsl" }
  | { kind: "vec2"; precision: number };

// Debug probe registry (accumulates values per frame)
class DebugProbeRegistry {
  private probes = new Map<string, DebugProbeValue>();

  record(probeId: string, value: unknown, type: TypeDesc, format: DebugFormat): void {
    this.probes.set(probeId, {
      value,
      type,
      format,
      timestamp: performance.now(),
      formatted: this.formatValue(value, type, format),
    });
  }

  getProbes(): Map<string, DebugProbeValue> {
    return new Map(this.probes);
  }

  clear(): void {
    this.probes.clear();
  }

  private formatValue(value: unknown, type: TypeDesc, format: DebugFormat): string {
    switch (format.kind) {
      case "raw":
        return String(value);

      case "number":
        return (value as number).toFixed(format.precision);

      case "phase":
        const phase = value as number;
        switch (format.format) {
          case "degrees": return `${(phase * 360).toFixed(1)}°`;
          case "radians": return `${(phase * Math.PI * 2).toFixed(3)} rad`;
          case "percent": return `${(phase * 100).toFixed(1)}%`;
        }

      case "color":
        return formatColor(value as Color, format.format);

      case "vec2":
        const v = value as Vec2;
        return `(${v.x.toFixed(format.precision)}, ${v.y.toFixed(format.precision)})`;
    }
  }
}

// Execute debug probe step
function executeDebugProbe(
  step: StepDebugProbe,
  runtime: RuntimeState,
  debugRegistry: DebugProbeRegistry
): void {
  const value = runtime.values.read(step.slot);
  debugRegistry.record(step.probeId, value, step.type, step.format);
}
```

### Files to Modify

1. `src/editor/compiler/ir/schedule.ts` - Add StepDebugProbe
2. `src/editor/runtime/executor/ScheduleExecutor.ts` - Execute debug probes
3. `src/editor/debug-ui/` - Display probe values
4. `src/editor/compiler/blocks/debug/DebugDisplay.ts` - IR lowering

### Complexity

Medium - Clear pattern, needs UI integration.

---

## Gap 2: Signal Visualization (HIGH)

### Current State

No way to visualize signal waveforms over time.

### Impact

- Hard to debug oscillating signals
- Can't see signal behavior over time

### Proposed Solution

```typescript
// Signal history buffer for visualization
interface SignalHistory {
  probeId: string;
  samples: Float32Array;
  sampleCount: number;
  maxSamples: number;
  startTime: number;
  sampleRate: number;  // samples per second
}

class SignalHistoryBuffer {
  private histories = new Map<string, SignalHistory>();

  constructor(private maxSamples: number = 1000) {}

  record(probeId: string, value: number, tMs: number): void {
    let history = this.histories.get(probeId);

    if (!history) {
      history = {
        probeId,
        samples: new Float32Array(this.maxSamples),
        sampleCount: 0,
        maxSamples: this.maxSamples,
        startTime: tMs,
        sampleRate: 60,  // Assume 60fps
      };
      this.histories.set(probeId, history);
    }

    // Ring buffer write
    const idx = history.sampleCount % history.maxSamples;
    history.samples[idx] = value;
    history.sampleCount++;
  }

  getHistory(probeId: string): SignalHistory | undefined {
    return this.histories.get(probeId);
  }

  getSamples(probeId: string, count?: number): Float32Array {
    const history = this.histories.get(probeId);
    if (!history) return new Float32Array(0);

    const available = Math.min(history.sampleCount, history.maxSamples);
    const requested = count ?? available;
    const samples = new Float32Array(requested);

    // Read from ring buffer (oldest to newest)
    const startIdx = history.sampleCount > history.maxSamples
      ? history.sampleCount % history.maxSamples
      : 0;

    for (let i = 0; i < requested; i++) {
      const idx = (startIdx + i) % history.maxSamples;
      samples[i] = history.samples[idx];
    }

    return samples;
  }
}

// React component for signal visualization
interface SignalGraphProps {
  probeId: string;
  historyBuffer: SignalHistoryBuffer;
  width: number;
  height: number;
  minValue?: number;
  maxValue?: number;
}

function SignalGraph({ probeId, historyBuffer, width, height, minValue, maxValue }: SignalGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d')!;
    const samples = historyBuffer.getSamples(probeId, width);

    // Auto-scale if bounds not provided
    const min = minValue ?? Math.min(...samples);
    const max = maxValue ?? Math.max(...samples);
    const range = max - min || 1;

    // Clear
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = '#333';
    ctx.beginPath();
    for (let y = 0; y < height; y += height / 4) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();

    // Draw signal
    ctx.strokeStyle = '#4af';
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    for (let i = 0; i < samples.length; i++) {
      const x = i;
      const y = height - ((samples[i] - min) / range) * height;

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

  }, [probeId, historyBuffer, width, height, minValue, maxValue]);

  return <canvas ref={canvasRef} width={width} height={height} />;
}
```

### Complexity

Medium - Ring buffer + Canvas rendering.

---

## Gap 3: Field Visualization (MEDIUM)

### Current State

Can't visualize per-element field values.

### Impact

- Hard to debug field patterns
- Can't see field distributions

### Proposed Solution

```typescript
// Field visualization modes
type FieldVizMode =
  | { kind: "heatmap"; colormap: string }
  | { kind: "histogram"; bins: number }
  | { kind: "scatter"; xField?: string; yField?: string }
  | { kind: "list"; maxItems: number };

interface FieldDebugValue {
  fieldId: string;
  data: Float32Array;
  domain: TypeDomain;
  stats: {
    min: number;
    max: number;
    mean: number;
    stdDev: number;
  };
}

function computeFieldStats(data: Float32Array): FieldDebugValue["stats"] {
  const n = data.length;
  if (n === 0) return { min: 0, max: 0, mean: 0, stdDev: 0 };

  let min = data[0], max = data[0], sum = 0;
  for (let i = 0; i < n; i++) {
    min = Math.min(min, data[i]);
    max = Math.max(max, data[i]);
    sum += data[i];
  }
  const mean = sum / n;

  let variance = 0;
  for (let i = 0; i < n; i++) {
    variance += (data[i] - mean) ** 2;
  }
  const stdDev = Math.sqrt(variance / n);

  return { min, max, mean, stdDev };
}

// Heatmap visualization component
function FieldHeatmap({ field, colormap, width, height }: FieldHeatmapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d')!;
    const { data, stats } = field;
    const n = data.length;

    // Determine grid layout (roughly square)
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    const cellW = width / cols;
    const cellH = height / rows;

    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const x = col * cellW;
      const y = row * cellH;

      // Normalize value
      const normalized = (data[i] - stats.min) / (stats.max - stats.min || 1);
      const color = colormapLookup(colormap, normalized);

      ctx.fillStyle = color;
      ctx.fillRect(x, y, cellW, cellH);
    }
  }, [field, colormap, width, height]);

  return <canvas ref={canvasRef} width={width} height={height} />;
}
```

### Complexity

Medium - Field stats + heatmap rendering.

---

## Gap 4: Runtime State Inspector (MEDIUM)

### Current State

No way to inspect runtime state (value store, state buffer, etc.).

### Impact

- Can't debug slot values
- Can't inspect stateful operation state

### Proposed Solution

```typescript
// Runtime state snapshot
interface RuntimeStateSnapshot {
  frameId: number;
  timestamp: number;
  slots: SlotSnapshot[];
  stateBuffer: StateBufferSnapshot[];
  events: EventSnapshot[];
}

interface SlotSnapshot {
  slot: number;
  name?: string;
  type: TypeDesc;
  value: unknown;
  formatted: string;
}

function captureRuntimeSnapshot(runtime: RuntimeState, program: CompiledProgramIR): RuntimeStateSnapshot {
  const slots: SlotSnapshot[] = [];

  // Capture all allocated slots
  for (const slotInfo of program.slotMeta) {
    const value = runtime.values.read(slotInfo.slot);
    slots.push({
      slot: slotInfo.slot,
      name: slotInfo.label,
      type: slotInfo.type,
      value,
      formatted: formatDebugValue(value, slotInfo.type),
    });
  }

  // Capture state buffer
  const stateBuffer: StateBufferSnapshot[] = [];
  for (const stateInfo of program.stateLayout.cells) {
    const value = runtime.state.read(stateInfo.id);
    stateBuffer.push({
      id: stateInfo.id,
      label: stateInfo.label,
      slots: stateInfo.slots,
      value,
    });
  }

  // Capture active events
  const events: EventSnapshot[] = [];
  for (const [slot, event] of runtime.events.entries()) {
    if (event.triggered) {
      events.push({ slot, triggered: true, payload: event.payload });
    }
  }

  return {
    frameId: runtime.frameId,
    timestamp: performance.now(),
    slots,
    stateBuffer,
    events,
  };
}

// React component for state tree
function RuntimeStateTree({ snapshot }: { snapshot: RuntimeStateSnapshot }) {
  return (
    <div className="state-tree">
      <h3>Frame {snapshot.frameId}</h3>

      <section>
        <h4>Value Slots ({snapshot.slots.length})</h4>
        <ul>
          {snapshot.slots.map(slot => (
            <li key={slot.slot}>
              <span className="slot-id">[{slot.slot}]</span>
              <span className="slot-name">{slot.name ?? '(unnamed)'}</span>
              <span className="slot-value">{slot.formatted}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h4>State Buffer ({snapshot.stateBuffer.length})</h4>
        <ul>
          {snapshot.stateBuffer.map(state => (
            <li key={state.id}>
              <span className="state-label">{state.label}</span>
              <span className="state-value">{JSON.stringify(state.value)}</span>
            </li>
          ))}
        </ul>
      </section>

      {snapshot.events.length > 0 && (
        <section>
          <h4>Active Events ({snapshot.events.length})</h4>
          <ul>
            {snapshot.events.map(event => (
              <li key={event.slot}>
                <span className="event-slot">[{event.slot}]</span>
                <span className="event-payload">{JSON.stringify(event.payload)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
```

### Complexity

Medium - Snapshot capture + tree UI.

---

## Gap 5: Compile-Time Debug Output (LOW)

### Current State

Limited visibility into compilation process.

### Impact

- Hard to debug compile errors
- Can't see intermediate IR

### Proposed Solution

```typescript
// Compile diagnostics output
interface CompileDiagnostics {
  passes: PassDiagnostic[];
  ir: {
    sigExprs: SignalExprIR[];
    fieldExprs: FieldExprIR[];
    schedule: StepIR[];
    slotAllocation: SlotAllocation[];
  };
  timing: {
    totalMs: number;
    perPass: Record<string, number>;
  };
  warnings: CompileWarning[];
}

interface PassDiagnostic {
  name: string;
  inputSize: number;
  outputSize: number;
  durationMs: number;
  transformations: string[];
}

function compileWithDiagnostics(
  patch: Patch,
  options?: CompileOptions
): { program: CompiledProgramIR; diagnostics: CompileDiagnostics } {
  const diagnostics: CompileDiagnostics = {
    passes: [],
    ir: { sigExprs: [], fieldExprs: [], schedule: [], slotAllocation: [] },
    timing: { totalMs: 0, perPass: {} },
    warnings: [],
  };

  const startTime = performance.now();

  // Run each pass with timing
  const pass1Start = performance.now();
  const pass1Result = pass1Validation(patch);
  diagnostics.passes.push({
    name: "pass1-validation",
    inputSize: patch.blocks.length,
    outputSize: 1,
    durationMs: performance.now() - pass1Start,
    transformations: [],
  });
  diagnostics.timing.perPass["pass1"] = performance.now() - pass1Start;

  // ... continue for each pass

  diagnostics.timing.totalMs = performance.now() - startTime;

  return { program, diagnostics };
}

// Debug UI for IR visualization
function IRDebugPanel({ diagnostics }: { diagnostics: CompileDiagnostics }) {
  const [selectedPass, setSelectedPass] = useState(0);

  return (
    <div className="ir-debug">
      <div className="pass-timeline">
        {diagnostics.passes.map((pass, i) => (
          <div
            key={pass.name}
            className={`pass-bar ${i === selectedPass ? 'selected' : ''}`}
            style={{ width: `${pass.durationMs / diagnostics.timing.totalMs * 100}%` }}
            onClick={() => setSelectedPass(i)}
          >
            {pass.name}
          </div>
        ))}
      </div>

      <div className="ir-view">
        <h4>Signal Expressions ({diagnostics.ir.sigExprs.length})</h4>
        <pre>{JSON.stringify(diagnostics.ir.sigExprs, null, 2)}</pre>

        <h4>Schedule ({diagnostics.ir.schedule.length} steps)</h4>
        <pre>{JSON.stringify(diagnostics.ir.schedule, null, 2)}</pre>
      </div>
    </div>
  );
}
```

### Complexity

Low-Medium - Instrumentation + UI.

---

## Summary

| Gap | Severity | Complexity | Enables |
|-----|----------|------------|---------|
| DebugDisplay IR | HIGH | Medium | Debug in IR mode |
| Signal visualization | HIGH | Medium | Waveform debugging |
| Field visualization | MEDIUM | Medium | Pattern debugging |
| Runtime state inspector | MEDIUM | Medium | Deep debugging |
| Compile diagnostics | LOW | Low-Medium | Compile debugging |

**Recommended order:** DebugDisplay IR → Signal viz → Runtime inspector → Field viz → Compile diagnostics
