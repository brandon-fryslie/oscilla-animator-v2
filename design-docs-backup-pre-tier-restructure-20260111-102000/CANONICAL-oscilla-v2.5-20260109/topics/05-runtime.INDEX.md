# Runtime - Indexed Summary

**Tier**: T2 (Execution Model)
**Size**: 455 lines → ~110 lines (24% compression)

## Execution Model [L28-45]
**One Tick (Frame)**:
1. Sample inputs (UI, MIDI)
2. Update time rails
3. Execute continuous subgraph (topological)
4. Process events
5. Write render sinks

**Timing**: 5-10ms per frame (60-200 fps)
**No type checking/dispatch at runtime** [L43-44]

## Storage Model [L48-94]
```typescript
type ScalarSlot = { kind: 'scalar_slot'; id: number; value: number | boolean | vec2 | color };
type FieldSlot = { kind: 'field_slot'; id: number; domain: DomainId; values: typed array };
type EventSlot = { kind: 'event_slot'; id: number; events: EventPayload[] };
type StateSlot = { kind: 'state_slot'; id: number; value: number | Float32Array };
```

**Slot Layout** [L83-93]:
```typescript
interface RuntimeState {
  scalars: Float32Array;
  fields: Map<number, Float32Array>;
  events: Map<number, EventPayload[]>;
  state: Map<number, Float32Array>;
}
```

## State Management [L99-140]
**State Slots**: Only stateful primitives (UnitDelay, Lag, Phasor, SampleAndHold)

**Keying** [L104-113]: `(blockId, laneIndex)`

**Allocation by cardinality**:
| Cardinality | Allocation |
|-------------|-----------|
| one | Single value |
| many(domain) | Array of N values |
| zero | No state |

**I3**: State migration (hot-swap) [L123-139]
- Same StateId + compatible → Copy/Transform
- Different StateId → Reset with diagnostic

## Scheduling [L143-185]
**Schedule execution** [L145-175]: Loop through steps in order
**Deterministic order** [L178-184]:
1. Topologically sorted
2. State reads before dependents
3. State writes after
4. Render sinks last

## Domain Loops [L188-216]
**Fixed Count**: Single contiguous loop [L195-198]
**Grid 2D**: Helper coordinates (x, y) optional [L200-205]
**Loop bounds**: Compile-time constants

## Event Processing [L219-250]
**Event Buffer Model** [L222-235]:
- Per-tick scratch buffers
- EventPayload: key (string) + value (number)

**I4**: Event ordering - deterministic [L237-242]
- Stable across combines
- Matches writer connection order

**Event-to-Continuous**: Explicit blocks (SampleAndHold, Accumulator) [L244-249]

## Performance Constraints [L252-286]
**I8**: Slot-addressed execution - NO string lookups in hot loops [L267-273]
**Dense arrays, not sparse maps** [L276-285]
**No type info at runtime** [L254-263]

## Hot-Swap [L290-318]
**Continuity guarantees** [L292-303]:
| What | Behavior |
|------|----------|
| tMs | Continues |
| Rails | Continue |
| State (matching StateId) | Preserved or migrated |
| State (changed StateId) | Reset + diagnostic |
| Caches | Invalidated, rebuilt |

**Atomic swap** [L304-309]: Old renders until new ready, swap is atomic

## Caching [L321-350]
**I14**: Cache keys - explicit [L324-340]
```typescript
interface CacheKey {
  stepId: StepId;
  frame: number | 'stable';
  inputs: number[];
  params: number;
}
```

**Invalidation**: Input changes, params change, hot-swap, frame changes [L345-349]

## Traceability [L353-368]
**I20**: Every value attributable to node + transform chain + combine bus + materialization

## Deterministic Replay [L371-385]
**I21**: Given (PatchRevision, Seed, InputRecord) → identical output
- No Math.random()
- Deterministic event ordering
- Stable scheduling
- Reproducible IEEE 754 floating-point

## Debugging Support [L388-420]
**Low-overhead tracing** [L390-409]: Ring buffers with circular write
**Structural instrumentation** [L411-419]: NodeId, StepId, ExprId, ValueSlot (stable)
**Not heuristic** - mapped to IR identifiers

## Error Handling [L423-445]
**No silent fallbacks** - explicit errors [L427-435]
**Error recovery**: Log + safe fallback (0, NaN marker) + continue + surface in UI

## Related
- [04-compilation](./04-compilation.md) - IR generation
- [03-time-system](./03-time-system.md) - Time management
- [06-renderer](./06-renderer.md) - Output
- [Invariants](../INVARIANTS.md) - I3, I4, I8, I14, I20, I21
