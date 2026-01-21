# Implementation Context: Runtime Value Inspector

**Sprint**: runtime-inspector
**Generated**: 2026-01-20

---

## Purpose

This document provides implementation context for the Runtime Value Inspector feature. It captures architectural decisions, code patterns to follow, and specific implementation guidance.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Compiler                                                        │
│  ├── compileBusAwarePatch() → CompiledProgramIR                 │
│  │                             └── slotMeta: SlotMetaEntry[]    │
│  └── buildSchedule() → Schedule                                  │
│                        └── instances: Map<InstanceId, InstanceDecl>│
└────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (set after compilation)
┌─────────────────────────────────────────────────────────────────┐
│  DebugService (singleton)                                        │
│  ├── setRuntimeRefs(program, state)                             │
│  ├── setScheduleRef(schedule)                                    │
│  ├── getSlot(slot) → SlotValue                                  │
│  ├── getAllSlots() → SlotValue[]                                │
│  ├── getBuffer(slot) → BufferInfo                               │
│  ├── getInstanceInfo(id) → InstanceInfo                         │
│  └── getAllInstances() → InstanceInfo[]                         │
└────────────────────────────────────────────────────────────────────┘
                              ▲
                              │ (queries at 5 Hz)
┌─────────────────────────────────────────────────────────────────┐
│  RuntimeInspector (React component)                              │
│  ├── useEffect: 5 Hz update loop                                │
│  ├── SlotTable: renders slot values                             │
│  └── InstanceList: renders instance counts                      │
└────────────────────────────────────────────────────────────────────┘
```

---

## Key Data Structures

### SlotValue (to define)

```typescript
interface SlotValue {
  slot: ValueSlot;
  value: number | null;           // null if object slot
  type: SignalType;
  storage: 'f64' | 'f32' | 'i32' | 'u32' | 'object';
  debugName?: string;
  isBuffer: boolean;              // true if storage === 'object' and value is ArrayBufferView
}
```

### BufferInfo (to define)

```typescript
interface BufferInfo {
  slot: ValueSlot;
  length: number;
  min: number;
  max: number;
  mean: number;
  values: number[];               // First 10 values
  truncated: boolean;             // true if length > 10
}
```

### InstanceInfo (to define)

```typescript
interface InstanceInfo {
  instanceId: InstanceId;
  domainType: DomainType;
  count: number;                  // Resolved count (may come from dynamic expression)
  identityMode: 'stable' | 'unstable';
  layout?: LayoutSpec;
}
```

---

## Code Patterns to Follow

### Panel Registration (panelRegistry.ts)

```typescript
// Add to PANEL_DEFINITIONS array
{
  id: 'runtime-inspector',
  component: 'RuntimeInspectorPanel',
  title: 'Runtime Inspector',
  group: 'bottom-right',
}

// Add to PANEL_COMPONENTS map
RuntimeInspectorPanel: RuntimeInspectorPanel,
```

### Panel Wrapper Pattern (RuntimeInspectorPanel.tsx)

```typescript
import { IDockviewPanelProps } from 'dockview-react';
import { RuntimeInspector } from '../components/app/RuntimeInspector';

export const RuntimeInspectorPanel: React.FC<IDockviewPanelProps> = () => {
  return <RuntimeInspector />;
};
```

### Component Pattern (RuntimeInspector.tsx)

```typescript
import { observer } from 'mobx-react-lite';
import { colors } from '../../theme';
import { debugService } from '../../../services/DebugService';

export const RuntimeInspector: React.FC = observer(() => {
  const [paused, setPaused] = useState(false);
  const [slots, setSlots] = useState<SlotValue[]>([]);
  const [instances, setInstances] = useState<InstanceInfo[]>([]);

  useEffect(() => {
    if (paused) return;

    const interval = setInterval(() => {
      setSlots(debugService.getAllSlots());
      setInstances(debugService.getAllInstances());
    }, 200); // 5 Hz

    return () => clearInterval(interval);
  }, [paused]);

  return (
    <div style={{ ... }}>
      {/* Header with Pause/Resume */}
      {/* Slots section */}
      {/* Instances section */}
    </div>
  );
});
```

### Styling Pattern (from ContinuityPanel)

```typescript
const containerStyle: React.CSSProperties = {
  padding: '8px',
  backgroundColor: colors.background,
  color: colors.textPrimary,
  fontFamily: 'monospace',
  fontSize: '12px',
  height: '100%',
  overflow: 'auto',
};

const sectionStyle: React.CSSProperties = {
  marginBottom: '16px',
};

const headerStyle: React.CSSProperties = {
  fontWeight: 'bold',
  marginBottom: '8px',
  color: colors.textSecondary,
  cursor: 'pointer',
  userSelect: 'none',
};
```

---

## File Locations

### Files to Modify

| File | Changes |
|------|---------|
| `src/services/DebugService.ts` | Add new query methods and refs |
| `src/ui/dockview/panelRegistry.ts` | Add panel registration |
| `src/main.ts` (or similar) | Wire up ref setting after compilation |

### Files to Create

| File | Purpose |
|------|---------|
| `src/ui/dockview/panels/RuntimeInspectorPanel.tsx` | Panel wrapper |
| `src/ui/components/app/RuntimeInspector.tsx` | Main component |

---

## Implementation Details

### DebugService Extensions

```typescript
// Add to class fields
private programRef: CompiledProgramIR | null = null;
private stateRef: RuntimeState | null = null;
private scheduleRef: Schedule | null = null;

// New methods
setRuntimeRefs(program: CompiledProgramIR, state: RuntimeState): void {
  this.programRef = program;
  this.stateRef = state;
}

setScheduleRef(schedule: Schedule): void {
  this.scheduleRef = schedule;
}

getSlot(slot: ValueSlot): SlotValue | undefined {
  if (!this.programRef || !this.stateRef) return undefined;

  const meta = this.programRef.slotMeta.find(m => m.slot === slot);
  if (!meta) return undefined;

  let value: number | null = null;
  let isBuffer = false;

  if (meta.storage === 'object') {
    const obj = this.stateRef.values.objects.get(slot);
    isBuffer = obj instanceof Float32Array || obj instanceof Float64Array || ...;
    value = null;
  } else {
    value = this.stateRef.values.f64[meta.offset];
  }

  return {
    slot,
    value,
    type: meta.type,
    storage: meta.storage,
    debugName: meta.debugName,
    isBuffer,
  };
}

getAllSlots(): SlotValue[] {
  if (!this.programRef) return [];

  return this.programRef.slotMeta
    .map(meta => this.getSlot(meta.slot))
    .filter((v): v is SlotValue => v !== undefined)
    .sort((a, b) => (a.slot as number) - (b.slot as number));
}

getBuffer(slot: ValueSlot): BufferInfo | undefined {
  if (!this.stateRef) return undefined;

  const obj = this.stateRef.values.objects.get(slot);
  if (!obj || !(obj instanceof Float32Array || obj instanceof Float64Array)) {
    return undefined;
  }

  const arr = obj as Float32Array | Float64Array;
  const length = arr.length;

  let min = Infinity, max = -Infinity, sum = 0;
  for (let i = 0; i < length; i++) {
    const v = arr[i];
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }

  return {
    slot,
    length,
    min: length > 0 ? min : 0,
    max: length > 0 ? max : 0,
    mean: length > 0 ? sum / length : 0,
    values: Array.from(arr.slice(0, 10)),
    truncated: length > 10,
  };
}

getInstanceInfo(instanceId: InstanceId): InstanceInfo | undefined {
  if (!this.scheduleRef) return undefined;

  const decl = this.scheduleRef.instances.get(instanceId);
  if (!decl) return undefined;

  // Resolve count (may be static number or dynamic)
  const count = typeof decl.count === 'number'
    ? decl.count
    : this.resolveCount(decl.count); // Implement if dynamic

  return {
    instanceId,
    domainType: decl.domainType,
    count,
    identityMode: decl.identityMode,
    layout: decl.layout,
  };
}

getAllInstances(): InstanceInfo[] {
  if (!this.scheduleRef) return [];

  return Array.from(this.scheduleRef.instances.keys())
    .map(id => this.getInstanceInfo(id))
    .filter((i): i is InstanceInfo => i !== undefined);
}

clear(): void {
  this.edgeToSlotMap.clear();
  this.slotValues.clear();
  this.programRef = null;
  this.stateRef = null;
  this.scheduleRef = null;
}
```

### Finding the Compilation Hook

The existing `setEdgeToSlotMap()` call tells us where compilation results are wired. Look for:

```typescript
debugService.setEdgeToSlotMap(...);
```

Add the new calls nearby:

```typescript
debugService.setRuntimeRefs(program, state);
debugService.setScheduleRef(schedule);
```

---

## Type Imports

You'll need these imports in DebugService:

```typescript
import type { CompiledProgramIR, SlotMetaEntry } from '../compiler/ir/program';
import type { RuntimeState } from '../runtime/RuntimeState';
import type { Schedule, InstanceDecl, InstanceId } from '../compiler/ir/types';
import type { DomainType, LayoutSpec } from '../types';
```

---

## Testing Guidance

### Unit Test Mock Setup

```typescript
// Mock program with slotMeta
const mockProgram: Partial<CompiledProgramIR> = {
  slotMeta: [
    { slot: 1 as ValueSlot, storage: 'f64', offset: 0, type: { ... }, debugName: 'phase' },
    { slot: 2 as ValueSlot, storage: 'object', offset: 0, type: { ... } },
  ],
};

// Mock state with values
const mockState: Partial<RuntimeState> = {
  values: {
    f64: new Float64Array([0.5, 0.75, 1.0]),
    objects: new Map([
      [2 as ValueSlot, new Float32Array([1, 2, 3, 4, 5])],
    ]),
  },
};

// Set refs
debugService.setRuntimeRefs(mockProgram as any, mockState as any);

// Test
expect(debugService.getSlot(1 as ValueSlot)).toEqual({
  slot: 1,
  value: 0.5,
  type: { ... },
  storage: 'f64',
  debugName: 'phase',
  isBuffer: false,
});
```

---

## Edge Cases

1. **No runtime yet**: Return empty arrays, show "No runtime loaded" message
2. **Dynamic instance count**: May need to resolve SigExprId → number at query time
3. **Large buffers**: Only read first 10 values, don't iterate entire array for stats (perf)
4. **NaN/Inf values**: Display as "NaN" or "Inf" strings, don't crash
5. **Object slots that aren't buffers**: Show type name, don't show as buffer

---

## Spec References

- **08-observation-system.md**: DebugTap interface, DebugSnapshot sampling rates
- **09-debug-ui-spec.md**: UI patterns for value display (meters, badges)
- **05-runtime.md**: RuntimeState structure, slot storage model

The Runtime Inspector is a **low-level** complement to the high-level Probe/Trace UI described in topic 09. It shows raw slots while Probe mode shows semantic values.
