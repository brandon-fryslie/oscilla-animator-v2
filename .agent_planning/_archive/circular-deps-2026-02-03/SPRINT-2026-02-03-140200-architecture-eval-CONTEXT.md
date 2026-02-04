# Implementation Context: architecture-eval
Generated: 2026-02-03-140200
Source: EVALUATION-2026-02-03-131723.md

## This Sprint Is Research Only

No code changes are expected. The deliverable is a decision document and (optionally) a throwaway prototype.

## Key Files for Option C Analysis

### Types that blocks/ imports from compiler/ir/

**OpCode enum** -- `src/compiler/ir/types.ts`
- Used by: oscillator.ts, lag.ts, phasor.ts, hash.ts, accumulator.ts, external-input.ts, external-gate.ts, sample-hold.ts (~10 files)
- Nature: Discriminant enum for IR operations (e.g., `OpCode.Add`, `OpCode.Mul`)
- Extractability: HIGH -- pure enum with no dependencies on compiler internals

**stableStateId function** -- `src/compiler/ir/types.ts`
- Used by: unit-delay.ts, phasor.ts, lag.ts, accumulator.ts, sample-hold.ts (~5 files)
- Nature: Creates a branded string ID for stateful blocks
- Extractability: HIGH -- likely a pure function

**ValueExprId type** -- `src/compiler/ir/Indices.ts`
- Used by: oscillator.ts, hash.ts, sample-hold.ts, test-signal.ts (~4 files)
- Nature: Branded type alias
- Extractability: HIGH -- just a type

**valueSlot, SYSTEM_PALETTE_SLOT** -- `src/compiler/ir/Indices.ts`
- Used by: infinite-time-root.ts (1 file)
- Nature: Slot index constants/factories
- Extractability: MEDIUM -- need to check what they depend on

**LowerSandbox class** -- `src/compiler/ir/LowerSandbox.ts`
- Used by: default-source.ts (1 file)
- Nature: Builder class with methods for creating IR expressions during lowering
- Extractability: LOW -- it imports from blocks/registry (requireBlockDef), creating the core cycle
- This is the HARDEST piece to extract. If it stays in compiler/, blocks/signal/default-source.ts still needs to import it.

### The Core Cycle Path

```
blocks/signal/default-source.ts
  -> imports LowerSandbox from compiler/ir/LowerSandbox.ts
    -> imports requireBlockDef from blocks/registry.ts
```

For Option C to work, LowerSandbox would need to either:
1. Move to the shared layer (but it depends on blocks/registry -- creates new cycle)
2. Accept requireBlockDef as a parameter instead of importing it (dependency injection)
3. Stay in compiler/ and default-source.ts uses a different mechanism

### Files to Examine for Option B Scoping

To count lower() functions:
```bash
grep -r "lower\s*(" src/blocks/ --include="*.ts" -l
```

Key pattern -- blocks define `lower` in their registration:
```typescript
// Typical pattern in src/blocks/signal/*.ts
defineBlock({
  type: 'Oscillator',
  // ...
  lower(ctx: LowerCtx, args: LowerArgs): LowerResult {
    // Block-specific IR generation
  }
});
```

### Module Dependency Architecture (from CLAUDE.md)

```
UI/React <-- Stores (MobX) <-- Compiler + Runtime
          |
        Graph <-- Patch (user-facing)
                    |
                  Blocks Registry
                    |
                  Types & Core
```

Note: This diagram shows blocks BELOW compiler, but the current code has blocks as a PEER of compiler (both import from each other). The question is whether this diagram is aspirational or whether blocks/ and compiler/ should be recognized as peers.

### Questions to Ask User

1. "The blocks/ and compiler/ modules have a bidirectional dependency because blocks define their own lowering to IR. This works in practice but violates the ONE-WAY DEPENDENCIES law. Do you consider blocks/ and compiler/ to be separate layers (in which case we should fix the cycle) or peers within a single 'compilation domain' (in which case the current structure is acceptable)?"

2. "If you want to fix it, Option C (extract shared IR primitives like OpCode into a small shared layer) is the least disruptive. Option B (move all lowering into compiler/) is the cleanest but most disruptive. Which appeals to you, or is the status quo acceptable?"
