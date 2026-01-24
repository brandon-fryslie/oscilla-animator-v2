---
parent: ../INDEX.md
topic: diagnostic-rules-engine
order: 8.5
---

# Diagnostic Rules Engine

> Deterministic rules that analyze DebugGraph and DebugSnapshot to surface actionable diagnostics for non-technical users.

**Related Topics**: [07-diagnostics-system](./07-diagnostics-system.md), [08-observation-system](./08-observation-system.md), [09-debug-ui-spec](./09-debug-ui-spec.md)

**Key Terms**: [Diagnostic](../GLOSSARY.md#diagnostic), [DebugGraph](../GLOSSARY.md#debuggraph), [DebugSnapshot](../GLOSSARY.md#debugsnapshot)

---

## Overview

The rules engine is the "brain" that makes the debugger feel like it understands the patch.

It takes:
- **DebugGraph** (topology)
- **DebugSnapshot** (current state + history)
- **User context** (what they're probing)

And produces:
- **Diagnostics** (structured problems with fix suggestions)
- **Evidence** (snippets of data showing why)

The rules are deterministic, bounded, and entirely specified here so junior engineers can implement them without inventing behavior.

---

## Design Principles

1. **Deterministic Evaluation Order** - Rules run in a fixed sequence to avoid flickering diagnostics
2. **Bounded Output** - Up to N diagnostics per category, not every possible issue
3. **Cheap Computation** - All rules are O(buses + bindings), not O(elements) or O(time windows)
4. **Evidence-Based** - Every diagnostic includes small data snippets proving the claim
5. **Actionable Fixes** - Fixes map to undoable store operations (user can undo immediately)

---

## Part 1: History Statistics

Before evaluating rules, compute incremental statistics from ring buffers. These must be cheap and bounded.

### Per-Bus Statistics

For each bus with a ring buffer (last N samples, e.g., N=150 for 10s at 15Hz):

**Numeric-like types** (`num`, `float(phase01)`, `vec2` components):
```typescript
interface NumericStats {
  min: number;
  max: number;
  mean: number;
  range: number;              // max - min
  deltaMean: number;          // mean(|x[i] - x[i-1]|)
  nanCount: number;
  infCount: number;
  wrapCount?: number;         // phase only: high→low crossings
  pulseCount?: number;        // trigger only: fired samples
}
```

**Color type** (treat as RGBA packed u32):
```typescript
interface ColorStats {
  minR, maxR, minG, maxG, minB, maxB, minA, maxA: number;
  changeRate: number;         // count of frames where rgba != prev rgba
}
```

Compute these **incrementally** as snapshots are appended to ring buffers, not during rule evaluation.

---

## Part 2: Rule Evaluation Order

**Critical**: Rules run in this fixed order to prevent conflicting diagnostics.

1. **Correctness** - NaN/Inf, missing TimeRoot, type impossible
2. **Connectivity** - Bus silent, port unbound, no path to TimeRoot
3. **Conflicts** - Multiple publishers + last mode, palette fights
4. **Behavior** - Flatline/stuck, jitter/sharp motion, clipping/saturation
5. **Cost** - Heavy materializations, expensive transforms

Within each category, evaluate in stable order:
- Buses: sorted by `bus.sortKey` then `bus.id`
- Bindings: sorted by `binding.id`
- Ports: sorted by `portKey`

---

## Part 3: Core Diagnostic Rules

### Rule A: NaN/Infinity Propagation

**Condition**:
- `snapshot.health.nanCount > 0` OR
- `snapshot.health.infCount > 0` OR
- Any `busNow[i]` is `{t: 'err'}`

**Severity**: `error`

**Target**: All affected buses + top contributing bindings (if TRACE available)

**Evidence**:
- Which buses are in error state
- NaN count, Inf count
- (if TRACE) which binding last contributed before error

**Message**: "3 buses have NaN values - patch cannot evaluate correctly"

**Fixes**:
```typescript
// Option 1: Disable the problematic binding
{ kind: 'DisableBinding', bindingId: string }

// Option 2: Insert safety lens
{ kind: 'AddLens', bindingId: string, lensId: 'Clamp', preset: 'safe' }

// Option 3: Replace dangerous lens
{
  kind: 'ReplaceLens',
  bindingId: string,
  lensIndex: number,
  lensId: 'Softclip',
  preset: 'safe'
}
```

---

### Rule B: Bus is Silent (No Enabled Publishers)

**Condition**:
- `bus.publisherIds` exists and has entries BUT
- All publishers have `enabled === false` AND
- Bus has at least one listener (ignore silent buses with no readers)

**Severity**: `warn`

**Target**: `busId` + all listener `portKey`s

**Evidence**:
- "0 enabled publishers"
- List of disabled publishers (why they're off)
- Which blocks depend on this bus

**Message**: "Bus 'energy' has no enabled publishers - blocks reading it will use default value"

**Fixes**:
```typescript
// Option 1: Enable a disabled publisher
{ kind: 'EnablePublisher', publisherId: string }

// Option 2: Set a fallback value
{ kind: 'SetBusSilentValue', busId: string, value: ValueSummary }

// Option 3: Create a new publisher
{
  kind: 'CreatePublisher',
  busId: string,
  fromBlockId: string,     // suggested block
  fromPortId: string
}
```

---

### Rule C: Port Has No Source (Unbound Input)

**Condition**:
- Port is an input
- No listener binding feeds it from a bus
- No wire feeds it
- OR it is fed by a DefaultSource block

**Severity**:
- `info` if DefaultSource present
- `warn` if truly unbound

**Target**: `portKey` + parent `blockId`

**Evidence**:
- Current value (from DefaultSource or undefined)
- What the port expects (type)

**Message**: "Block 'Repeat' input 'count' is using a default value (3) instead of a computed value"

**Fixes**:
```typescript
// Option 1: Bind to a bus
{ kind: 'BindPortToBus', portKey: string, busId: string }

// Option 2: Convert DefaultSource to visible block
{
  kind: 'ReplaceDefaultSourceWithBlock',
  portKey: string,
  blockType: string
}

// Option 3: Open UI for binding
{ kind: 'OpenBusPickerUI', portKey: string }
```

---

### Rule D: Last-Write Conflict

**Condition**:
- `bus.combineMode === 'last'` AND
- 2 or more publishers enabled

**Severity**: `warn`

**Target**: `busId` + conflicting publishers

**Evidence**:
- Publisher order (sortKey)
- Which one "wins" (last in order)
- Suggest: "The second publisher will always overwrite the first"

**Message**: "Bus 'radius' uses 'last' combine with 2 publishers - publication order determines result"

**Fixes**:
```typescript
// Option 1: Reorder publishers
{ kind: 'ReorderPublishers', busId: string, newOrder: PublisherId[] }

// Option 2: Disable all but one
{ kind: 'DisablePublisher', publisherId: string }

// Option 3: Change combine mode (domain-aware)
{
  kind: 'SetCombineMode',
  busId: string,
  mode: 'sum' | 'max' | 'avg'  // domain-aware default
}
```

**Domain-Aware Defaults**:
- Numeric/energy: suggest `sum`
- Phase: suggest reorder OR last (with warning)
- Palette: suggest `layer`
- Boolean: suggest `or`

---

### Rule E: Flatline / No Motion

**Condition**:
- `bus.range < threshold` AND
- `bus.deltaMean < threshold` AND
- History window > 1 second (meaningful signal)

**Severity**: `info`

**Target**: `busId` + all listeners

**Evidence**:
- Current value
- Range over last window (min/max)
- "Value hasn't changed for 5 seconds"

**Message**: "Bus 'y' is flat - value is stuck at 0.5"

**Fixes**:
```typescript
// Option 1: Add motion
{ kind: 'AddMotionLens', busId: string, lensId: 'Ramp' | 'Sine' }

// Option 2: Check input to source publisher
{ kind: 'ProbePublisher', publisherId: string }
```

---

### Rule F: Excessive Motion / Jitter

**Condition**:
- `bus.deltaMean > motion_threshold` AND
- `bus.range < saturation_threshold` (small range)

Indicates high-frequency noise or jitter, not useful motion.

**Severity**: `warn`

**Target**: `busId` + primary publisher

**Evidence**:
- "Value oscillates ±0.02 around 0.5 every frame"
- Show sparkline of last second

**Message**: "Bus 'phase' is jittery - small rapid oscillations"

**Fixes**:
```typescript
// Add smoothing
{ kind: 'AddLens', bindingId: string, lensId: 'Lag', preset: 'smooth' }

// Or disable the problematic publisher
{ kind: 'DisablePublisher', publisherId: string }
```

---

### Rule G: Clipping / Saturation

**Condition**:
- Numeric: `max >= upper_bound OR min <= lower_bound` for repeated frames
- Color: Similar per-channel checks
- Trigger: Excessive firing (>20 pulses/sec)

**Severity**: `warn`

**Target**: `busId` + destination listeners

**Evidence**:
- "Value clipped to 1.0 for 200ms"
- Show before/after sparkline

**Message**: "Bus 'scale' is clipping at the maximum (1.0) - may lose detail"

**Fixes**:
```typescript
// Add clipping lens
{ kind: 'AddLens', bindingId: string, lensId: 'Softclip', preset: 'safe' }

// Or scale the range
{ kind: 'AddLens', bindingId: string, lensId: 'Remap', params: {min: 0, max: 0.5} }

// Or warn user: expected behavior
{ kind: 'Dismiss', diagnosticId: string }
```

---

### Rule H: Field Materialization Heavy

**Condition**:
- `snapshot.perf.fieldMaterializations > threshold` in last sample OR
- `topMaterializers[0].count > threshold`

**Severity**: `info` (performance, not correctness)

**Target**: Top materializer block

**Evidence**:
- "RenderInstances2D materialized 8000 elements this frame"
- Show top 3 materializers

**Message**: "Large domain materialization: 8000 elements in RenderInstances2D"

**Fixes**:
```typescript
// Informational only; user decides
{ kind: 'ProbeBlock', blockId: string }  // Open block inspector

// Could suggest domain reduction if available
{ kind: 'SuggestDomainFilter', blockId: string }
```

---

## Part 4: Rule Execution Algorithm

```typescript
interface RuleContext {
  graph: DebugGraph;
  snapshot: DebugSnapshot;
  history: Map<BusId, NumericStats>;  // pre-computed
  userProbe?: ProbeTarget;             // optional: what user is looking at
}

function evaluateRules(ctx: RuleContext): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // Category 1: Correctness
  diagnostics.push(...evaluateNaNInf(ctx));

  // Category 2: Connectivity
  diagnostics.push(...evaluateSilentBuses(ctx));
  diagnostics.push(...evaluateUnboundPorts(ctx));

  // Category 3: Conflicts
  diagnostics.push(...evaluateLastConflict(ctx));

  // Category 4: Behavior
  diagnostics.push(...evaluateFlatline(ctx));
  diagnostics.push(...evaluateJitter(ctx));
  diagnostics.push(...evaluateClipping(ctx));

  // Category 5: Cost
  diagnostics.push(...evaluateMaterializationHeavy(ctx));

  // Deduplicate by ID and return
  return Array.from(
    new Map(diagnostics.map(d => [d.id, d])).values()
  );
}
```

---

## Part 5: Deterministic IDs

Each diagnostic must have a stable ID so UI can deduplicate across samples.

```typescript
function diagnosticId(
  rule: string,           // 'NaNInf', 'SilentBus', etc.
  targetId: string,       // busId, bindingId, portKey, blockId
  keyFacts: string[]      // e.g., ['count:3', 'mode:last']
): string {
  const input = `${rule}:${targetId}:${keyFacts.join('|')}`;
  return sha256(input).slice(0, 16);  // stable hash
}
```

Same ID = same root cause = deduplicated in UI.

---

## Part 6: Evidence and Presentation

Each diagnostic must include small, focused evidence:

```typescript
interface Diagnostic {
  id: string;
  severity: Severity;
  code: DiagnosticCode;          // from topic 07
  title: string;                 // "Bus 'energy' is silent"
  message: string;               // 1-2 lines
  targets: TargetRef[];          // where to navigate
  evidence: EvidenceItem[];      // small data snippets
  fixes: DiagnosticAction[];     // undoable operations
}

type EvidenceItem =
  | { kind: 'value'; label: string; value: ValueSummary }
  | { kind: 'count'; label: string; count: number }
  | { kind: 'text'; label: string; text: string }
  | { kind: 'sparkline'; label: string; series: ValueSummary[] };  // last N samples
```

**Example**:
```typescript
{
  id: 'sha-abc',
  severity: 'warn',
  code: 'W_BUS_SILENT',
  title: "Bus 'radius' has no enabled publishers",
  message: "All publishers are disabled. Listeners will use default value.",
  targets: [
    { kind: 'bus', busId: 'radius' },
    { kind: 'port', portKey: 'DotsRenderer:radius' }
  ],
  evidence: [
    { kind: 'count', label: 'Disabled publishers', count: 3 },
    { kind: 'value', label: 'Default value', value: { t: 'num', v: 10 } }
  ],
  fixes: [
    { kind: 'EnablePublisher', publisherId: 'pub-1', label: 'Enable from Slider' }
  ]
}
```

---

## Part 7: Thresholds (Tunable)

These should be configurable (with sensible defaults) based on domain and use case:

```typescript
interface RuleThresholds {
  // Flatline detection
  flatlineRangeThreshold: number = 0.001;      // range < this
  flatlineDeltaMeanThreshold: number = 0.0001; // deltaMean < this
  flatlineWindowMs: number = 1000;             // over this window

  // Jitter detection
  jitterDeltaMeanThreshold: number = 0.1;      // deltaMean > this
  jitterRangeCap: number = 0.2;                // but range < this

  // Clipping detection
  clipThreshold: number = 0.05;                // within 5% of bounds

  // Materialization cost
  materializationThreshold: number = 5000;     // elements per frame

  // History window
  historyWindowMs: number = 10000;             // 10 seconds
}
```

---

## Related Documents

- [07-diagnostics-system.md](./07-diagnostics-system.md) - Diagnostic infrastructure
- [08-observation-system.md](./08-observation-system.md) - Input data (DebugGraph, DebugSnapshot)
- [09-debug-ui-spec.md](./09-debug-ui-spec.md) - How rules are presented to users

---

## Invariants

- **I29**: Error Taxonomy - Diagnostics are categorized by domain (compile/runtime/authoring/perf) and severity

