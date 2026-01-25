# Implementation Context: Channel Infrastructure

Generated: 2026-01-25
Plan: SPRINT-20260125-channel-infra-PLAN.md

## Key Files

### New Files to Create

- `src/runtime/ExternalChannel.ts` - All channel system classes

### Files to Modify

| File | Change |
|------|--------|
| `src/compiler/ir/types.ts` | SigExprExternal.which: string |
| `src/compiler/ir/IRBuilder.ts` | sigExternal(channel: string, type) |
| `src/compiler/ir/IRBuilderImpl.ts` | sigExternal implementation |
| `src/runtime/SignalEvaluator.ts` | Simplify 'external' case |
| `src/runtime/RuntimeState.ts` | Replace ExternalInputs with ExternalChannelSystem |
| `src/runtime/ScheduleExecutor.ts` | Add commit() call in executeFrame |
| `src/runtime/index.ts` | Export new types |

## Existing Patterns

### WriteRecord Pattern (from spec)
```typescript
// Follow the spec pattern for write records
type WriteRecord =
  | { op: 'set'; name: string; v: number }
  | { op: 'pulse'; name: string }
  | { op: 'add'; name: string; dv: number };
```

### Signal Expression Pattern (from types.ts)
```typescript
// Existing pattern to follow:
export interface SigExprTime {
  readonly kind: 'time';
  readonly which: 'tMs' | 'phaseA' | 'phaseB' | 'dt' | 'progress' | 'palette' | 'energy';
  readonly type: SignalType;
}

// Update to:
export interface SigExprExternal {
  readonly kind: 'external';
  readonly which: string;  // Was: 'mouseX' | 'mouseY' | 'mouseOver'
  readonly type: SignalType;
}
```

### IRBuilder Pattern (from IRBuilderImpl.ts)
```typescript
// Existing pattern at line 119-123:
sigTime(which: 'tMs' | 'phaseA' | 'phaseB' | 'dt' | 'progress' | 'palette' | 'energy', type: SignalType): SigExprId {
  const id = sigExprId(this.sigExprs.length);
  this.sigExprs.push({ kind: 'time', which, type });
  return id;
}

// Update sigExternal to:
sigExternal(channel: string, type: SignalType): SigExprId {
  const id = sigExprId(this.sigExprs.length);
  this.sigExprs.push({ kind: 'external', which: channel, type });
  return id;
}
```

### RuntimeState Pattern (from RuntimeState.ts lines 222-252)
```typescript
// Current ExternalInputs interface to replace:
export interface ExternalInputs {
  mouseX: number;
  mouseY: number;
  mouseOver: boolean;
  smoothX: number;
  smoothY: number;
}

// Replace with ExternalChannelSystem in SessionState.external
```

## Spec References

- design-docs/external-input/02-External-Input-Spec.md
  - Section 2.1-2.3: Runtime structures (write bus, snapshot)
  - Section 3: Commit algorithm
  - Section 4: Reader contract
  - Section 5: IRBuilder API
  - Section 10: Acceptance tests

## Code Snippets

### ExternalWriteBus Implementation
```typescript
// src/runtime/ExternalChannel.ts

type WriteRecord =
  | { op: 'set'; name: string; v: number }
  | { op: 'pulse'; name: string }
  | { op: 'add'; name: string; dv: number };

export class ExternalWriteBus {
  private queue: WriteRecord[] = [];

  set(name: string, v: number): void {
    this.queue.push({ op: 'set', name, v });
  }

  pulse(name: string): void {
    this.queue.push({ op: 'pulse', name });
  }

  add(name: string, dv: number): void {
    this.queue.push({ op: 'add', name, dv });
  }

  drain(): WriteRecord[] {
    const records = this.queue;
    this.queue = [];
    return records;
  }
}
```

### ExternalChannelSnapshot Implementation
```typescript
export class ExternalChannelSnapshot {
  constructor(private readonly values: Map<string, number>) {
    Object.freeze(this);
  }

  getFloat(name: string): number {
    return this.values.get(name) ?? 0;
  }

  getVec2(name: string): { x: number; y: number } {
    return {
      x: this.values.get(`${name}.x`) ?? 0,
      y: this.values.get(`${name}.y`) ?? 0,
    };
  }
}
```

### ExternalChannelSystem Implementation
```typescript
export class ExternalChannelSystem {
  readonly writeBus = new ExternalWriteBus();
  private staging = new Map<string, number>();
  private _snapshot = new ExternalChannelSnapshot(new Map());

  get snapshot(): ExternalChannelSnapshot {
    return this._snapshot;
  }

  commit(): void {
    const records = this.writeBus.drain();

    // Clear pulse/accum channels from previous frame
    // (tracked via naming convention or registry)
    for (const [name] of this.staging) {
      if (this.isPulse(name) || this.isAccum(name)) {
        this.staging.set(name, 0);
      }
    }

    // Apply records
    for (const record of records) {
      switch (record.op) {
        case 'set':
          this.staging.set(record.name, record.v);
          break;
        case 'pulse':
          this.staging.set(record.name, 1);
          break;
        case 'add':
          this.staging.set(record.name, (this.staging.get(record.name) ?? 0) + record.dv);
          break;
      }
    }

    // Swap snapshot
    this._snapshot = new ExternalChannelSnapshot(new Map(this.staging));
  }

  // Channel kind detection (naming convention for now)
  private isPulse(name: string): boolean {
    return name.includes('.down') || name.includes('.up');
  }

  private isAccum(name: string): boolean {
    return name.includes('.wheel.') || name.includes('.delta');
  }
}
```

### SignalEvaluator Update
```typescript
// src/runtime/SignalEvaluator.ts lines 175-181
// BEFORE:
case 'external': {
  const ext = expr as { which: 'mouseX' | 'mouseY' | 'mouseOver' };
  if (ext.which === 'mouseX') return state.external.smoothX;
  if (ext.which === 'mouseY') return state.external.smoothY;
  if (ext.which === 'mouseOver') return state.external.mouseOver ? 1 : 0;
  throw new Error(`Unknown external signal: ${ext.which}`);
}

// AFTER:
case 'external': {
  return state.external.snapshot.getFloat(expr.which);
}
```

### executeFrame Update
```typescript
// src/runtime/ScheduleExecutor.ts - at top of executeFrame function
export function executeFrame(
  program: CompiledProgramIR,
  state: RuntimeState,
  pool: BufferPool,
  tMs: number
): RenderFrameIR {
  // Commit external channels at frame start (spec section 3.1)
  state.external.commit();

  // ... rest of existing code
}
```

## Migration Notes

### Backward Compatibility

During this sprint, keep both systems working:
1. ExternalChannelSystem writes to its own storage
2. App code writes mouse to BOTH old ExternalInputs AND new writeBus
3. Sprint 3 will remove the old system

### Testing Strategy

1. Unit test ExternalWriteBus in isolation
2. Unit test ExternalChannelSnapshot in isolation
3. Integration test ExternalChannelSystem commit cycle
4. Integration test with SignalEvaluator
5. E2E test that mouse following still works
