---
index: true
source_file: 08b-diagnostic-rules-engine.md
source_hash: 51a03ae7d5cb
generated_at: 2026-01-12
tier: T2
---

# 08b-diagnostic-rules-engine.md INDEX

## Section 1: Metadata

- **Parent**: ../INDEX.md
- **Topic**: diagnostic-rules-engine
- **Order**: 8.5
- **Tier**: T2 (Structural)
- **Related Topics**: 07-diagnostics-system, 08-observation-system, 09-debug-ui-spec
- **Key Terms**: Diagnostic, DebugGraph, DebugSnapshot
- **Source Lines**: 1-514
- **Compression**: 514 lines → ~150 lines (29% compression)

## Section 2: Overview & Purpose

The rules engine is the "brain" that analyzes DebugGraph and DebugSnapshot to surface actionable diagnostics for non-technical users.

**Input Data**:
- DebugGraph (patch topology)
- DebugSnapshot (current state + history ring buffers)
- User context (optional: what they're currently probing)

**Output**:
- Diagnostics (structured problems with severity, codes, and fix suggestions)
- Evidence (small data snippets proving each claim)

**Key Constraint**: Deterministic, bounded, O(buses + bindings) complexity, entirely specified so junior engineers can implement without inventing behavior.

## Section 3: Design Principles

1. **Deterministic Evaluation Order** - Rules run in fixed sequence to prevent flickering/conflicting diagnostics
2. **Bounded Output** - Up to N diagnostics per category, not every possible issue
3. **Cheap Computation** - All rules O(buses + bindings), never O(elements) or O(time windows)
4. **Evidence-Based** - Every diagnostic includes small, focused data snippets proving the claim
5. **Actionable Fixes** - All suggested fixes map to undoable store operations (users can undo immediately)

## Section 4: Core Concepts

### Part 1: History Statistics (L44-75)
Pre-computed incremental statistics from ring buffers (last N samples, e.g., N=150 for 10s at 15Hz):

**NumericStats** (num, phase, vec2 components):
- `min, max, mean, range` - basic bounds
- `deltaMean` - mean(|x[i] - x[i-1]|) for motion detection
- `nanCount, infCount` - error propagation
- `wrapCount?` (phase only) - high→low crossings
- `pulseCount?` (trigger only) - fired samples

**ColorStats** (RGBA packed u32):
- Per-channel min/max (minR, maxR, minG, maxG, minB, maxB, minA, maxA)
- `changeRate` - frames where rgba != prev rgba

Computed incrementally as snapshots append, not during rule evaluation.

### Part 2: Rule Evaluation Order (L79-93)
Fixed sequence prevents conflicting diagnostics:

1. **Correctness** - NaN/Inf, missing TimeRoot, type impossible
2. **Connectivity** - Bus silent, port unbound, no path to TimeRoot
3. **Conflicts** - Multiple publishers + last mode, palette fights
4. **Behavior** - Flatline/stuck, jitter/sharp motion, clipping/saturation
5. **Cost** - Heavy materializations, expensive transforms

**Stable Ordering Within Category**:
- Buses: sorted by `bus.sortKey` then `bus.id`
- Bindings: sorted by `binding.id`
- Ports: sorted by `portKey`

### Part 3: Core Diagnostic Rules (L96-364)

| Rule | Condition | Severity | Key Fixes |
|------|-----------|----------|-----------|
| **A: NaN/Infinity** | `nanCount > 0 OR infCount > 0 OR busNow is err` | error | DisableBinding, AddLens, ReplaceLens |
| **B: Bus Silent** | All publishers disabled + has listeners | warn | EnablePublisher, SetBusSilentValue, CreatePublisher |
| **C: Unbound Input** | No source binding/wire OR using DefaultSource | info/warn | BindPortToBus, ReplaceDefaultSourceWithBlock, OpenBusPickerUI |
| **D: Last-Write Conflict** | combine='last' AND 2+ publishers enabled | warn | ReorderPublishers, SetCombineMode (domain-aware), DisablePublisher |
| **E: Flatline** | range < threshold AND deltaMean < threshold AND window > 1s | info | AddMotionLens, ProbePublisher |
| **F: Excessive Jitter** | deltaMean > threshold AND range < saturation_threshold | warn | AddLens (Lag), DisablePublisher |
| **G: Clipping/Saturation** | Value at bounds repeatedly (numeric/color/trigger) | warn | AddLens (Softclip/Remap), Dismiss |
| **H: Materialization Heavy** | fieldMaterializations > threshold OR topMaterializers[0].count > threshold | info | ProbeBlock, SuggestDomainFilter |

## Section 5: Technical Specifications

### Part 4: Rule Execution Algorithm (L368-404)
```typescript
interface RuleContext {
  graph: DebugGraph;
  snapshot: DebugSnapshot;
  history: Map<BusId, NumericStats>;  // pre-computed
  userProbe?: ProbeTarget;             // optional
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
  // Deduplicate by ID
  return Array.from(
    new Map(diagnostics.map(d => [d.id, d])).values()
  );
}
```

### Part 5: Deterministic ID Generation (L408-423)
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

Same ID = same root cause = deduplicated in UI across samples.

### Part 6: Evidence & Presentation (L428-470)
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
  | { kind: 'sparkline'; label: string; series: ValueSummary[] };
```

Evidence must be **small and focused**—only enough to prove the diagnostic claim.

## Section 6: Tunable Thresholds (L474-497)

Configuration interface with sensible defaults:

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

**Domain-Aware Combine Defaults** (Rule D):
- Numeric/energy: suggest `sum`
- Phase: suggest reorder OR last (with warning)
- Palette: suggest `layer`
- Boolean: suggest `or`

## Section 7: Related Specifications & Invariants

**Upstream Dependencies**:
- [07-diagnostics-system.md](./07-diagnostics-system.md) - Diagnostic infrastructure, codes (DiagnosticCode enum)
- [08-observation-system.md](./08-observation-system.md) - Input data structures (DebugGraph, DebugSnapshot, ring buffers)

**Downstream Dependencies**:
- [09-debug-ui-spec.md](./09-debug-ui-spec.md) - How diagnostics are presented to non-technical users

**Invariants**:
- **I29**: Error Taxonomy - Diagnostics are categorized by domain (compile/runtime/authoring/perf) and severity

**Key Design Constraints**:
- Rules must be implementable by junior engineers without behavior invention
- All fix operations must be undoable (store/undo-redo compatible)
- No silent fallbacks or hidden compatibility paths
- Deduplication happens at UI boundary (stable ID generation)
