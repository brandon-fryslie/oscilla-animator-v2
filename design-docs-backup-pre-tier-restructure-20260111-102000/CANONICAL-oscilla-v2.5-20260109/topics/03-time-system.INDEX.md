# Time System - Indexed Summary

**Tier**: T2 (Core Invariants)
**Size**: 438 lines → ~105 lines (24% compression)

## Definitions
- **tMs**: Monotonic time (int, never wraps) [L262-272]
- **TimeRoot**: Single authoritative time source (system-managed, one per patch) [L53-69]
- **phaseA/phaseB**: Phase rails (range [0,1), wrap-aware) [L282-289]
- **dt**: Delta time since last frame [L273-280]
- **progress**: [0..1] for finite TimeRoot only [L291-299]
- **pulse**: Frame tick trigger (discrete) [L300-307]
- **palette**: Default color atmosphere [L308-316]
- **energy**: Animation intensity signal [L317-326]

## Core Invariants
- **I1**: Time is monotonic, unbounded [L30-37]
- **I5**: Single time authority [L39-43]
- **I2**: Transport continuity (hot-swap preserves tMs) [L45-49]

## TimeRoot Kinds
| Kind | progress Output | Behavior |
|------|-----------------|----------|
| `finite` | Active (0..1 over duration) | Has duration, loops or ends |
| `infinite` | Constant 0 | Runs forever |

## Outputs (SignalType)
- `tMs`: one + continuous + int
- `dt`: one + continuous + float
- `phaseA`, `phaseB`: one + continuous + phase
- `pulse`: one + discrete + unit
- `palette`: one + continuous + color
- `progress`: one + continuous + unit (finite only)
- `energy`: one + continuous + float

## Phase Arithmetic [L205-222]
- `phase + float` → `phase` (offset, wrap)
- `phase * float` → `phase` (scale, wrap)
- `phase + phase` → **TYPE ERROR**
- `phase - phase` → `float` (distance, unwrapped)
- **Phase continuity rule**: `new_phase = old_phase + (new_speed - old_speed) * elapsed_time`

## Phase Conversion [L226-258]
- **PhaseToFloat**: Unwrap phase to [0,1)
- **FloatToPhase**: Wrap float to phase
- **PhaseDistance**: Signed shortest path distance

## Rails [L151-176]
Immutable system buses (cannot be deleted/renamed):
- `time`: TimeRoot.tMs
- `phaseA`, `phaseB`: Phase rails
- `pulse`: Frame tick
- `palette`: Color reference

Rails are derived blocks: `{ kind: 'derived', meta: { kind: 'rail', target: { kind: 'bus', busId } } }` [L167-172]

## Scheduling [L370-394]
**One Tick Model**:
1. Sample external inputs
2. Update time rails
3. Execute continuous subgraph
4. Apply discrete events
5. Produce render outputs

**Continuous**: Scalars computed once/tick; Fields loop over domain
**Discrete**: Events as set of occurrences per tick

## Event Payload [L396-410]
```typescript
interface EventPayload {
  key: string;
  value: float | int;
}
```
Versioned, no optional fields, strictly typed.

## Hot-Swap Behavior [L329-345]
| What | Behavior |
|------|----------|
| `tMs` | Continues unchanged |
| Rails | Continue |
| State cells (matching StateId) | Preserved |
| State (changed StateId) | Reset with diagnostic |
| Caches | Invalidated, rebuilt |
| Swap | Atomic, no flicker [L342-344] |

## Determinism [L414-428]
- **No Math.random()** - All randomness seeded
- **Replay**: Given patch, seed, input record → identical output
- **Order-dependent combine**: Writer ordering stable + explicit

## Related
- [02-block-system](./02-block-system.md) - TimeRoot block
- [05-runtime](./05-runtime.md) - Execution
- [Invariants.md](../INVARIANTS.md) - I1, I2, I5
- [Glossary](../GLOSSARY.md) - TimeRoot, Rail, tMs
