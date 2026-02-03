# Evaluation: Two-Result Model Gap
Generated: 2026-02-03

## Verdict: CONTINUE

## Current State (Sprint 1 Complete)
- `loweringPurity: 'pure'` tag on BlockDef
- `PureIRBuilder` interface (compile-time restriction, unused in practice)
- `LowerSandbox` with `lowerBlock()` for macro expansion
- `ValueRefExpr.slot` optional; orchestrator allocates for pure blocks inline
- Add, HueRainbow, DefaultSource migrated to pure pattern (slot: undefined)

## Gap: Two-Result Model (from 01-macro-lowering.md spec)

### What the spec requires
Lowerers return:
- `exprOutputs: Record<PortId, ValueExprId>` — pure IR expressions
- `effects?: LowerEffects` — declarative data: state cell requests, slot requests, step requests

A **separate compiler stage** turns effects into slot allocations and schedule steps.

### What we have
- Pure blocks return `LowerResult` with `slot: undefined`
- Stateful blocks directly call `allocStateSlot()`, `stepStateWrite()`, `allocSlot()` during `lower()`
- No `LowerEffects` type exists
- No separate effects-processing pass exists
- Slot allocation is inline in the orchestrator

### 6 Stateful Blocks to Migrate
| Block | State Kind | Two-Phase | Unique Patterns |
|-------|-----------|-----------|-----------------|
| Slew | slew | No | allocStateSlot, stateRead, stepStateWrite, allocSlot |
| Lag | lag | No | Same + constant for smoothing param |
| Phasor | phasor | No | Same + time('dt') |
| UnitDelay | delay | Yes | Only two-phase block (lowerOutputsOnly) |
| SampleHold | sample | No | Same + eventRead |
| Accumulator | accumulator | No | Same + constant for zero |

### Common Side-Effect Pattern (all 6 blocks)
1. `allocStateSlot(stableId, { initialValue })` — state request
2. `stateRead(stateSlot, type)` — pure expression (reads previous frame)
3. `stepStateWrite(stateSlot, valueExprId)` — step request
4. `allocSlot()` — slot request (output)

### Key Design Question (Resolved)
User decision: Real IRBuilder passes to blocks is fine. Enforcement via ESLint if needed.
Focus is on the effects return value + separate pass, not runtime sandboxing.
