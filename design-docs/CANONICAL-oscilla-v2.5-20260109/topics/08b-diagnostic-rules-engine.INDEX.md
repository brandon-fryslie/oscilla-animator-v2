# Diagnostic Rules Engine - Indexed Summary

**Tier**: T2 (Debugging)
**Size**: 514 lines → ~120 lines (23% compression)

## Overview [L1-31]
Takes DebugGraph + DebugSnapshot + user context → Diagnostics + Evidence

**Deterministic**, bounded, O(buses + bindings), evidence-based, actionable fixes

## Part 1: History Statistics [L44-75]
**Per-bus statistics** from ring buffers (incremental, not at rule eval time)

```typescript
interface NumericStats {
  min, max, mean, range;
  deltaMean: number;        // mean(|x[i] - x[i-1]|)
  nanCount, infCount;
  wrapCount?: number;       // phase only
  pulseCount?: number;      // trigger only
}

interface ColorStats {
  minR, maxR, minG, maxG, minB, maxB, minA, maxA;
  changeRate: number;
}
```

## Part 2: Rule Evaluation Order [L79-93]
**Fixed order** (prevents conflicting diagnostics):
1. **Correctness**: NaN/Inf, missing TimeRoot, impossible type
2. **Connectivity**: Bus silent, port unbound, no path to TimeRoot
3. **Conflicts**: Multiple publishers + last mode
4. **Behavior**: Flatline, jitter, clipping
5. **Cost**: Heavy materializations

Within category: Stable order (sortKey then id)

## Part 3: Core Rules [L96-364]

### Rule A: NaN/Infinity [L98-132]
**Condition**: `nanCount > 0 OR infCount > 0 OR busNow is err`
**Severity**: error
**Fixes**: DisableBinding, AddLens, ReplaceLens

### Rule B: Bus Silent [L135-169]
**Condition**: All publishers disabled, has listeners
**Severity**: warn
**Fixes**: EnablePublisher, SetBusSilentValue, CreatePublisher

### Rule C: Unbound Input [L172-207]
**Condition**: Input with no listener/wire/DefaultSource OR using DefaultSource
**Severity**: info/warn
**Fixes**: BindPortToBus, ReplaceDefaultSourceWithBlock, OpenBusPickerUI

### Rule D: Last-Write Conflict [L210-249]
**Condition**: combine='last' AND 2+ publishers enabled
**Severity**: warn
**Fixes**: ReorderPublishers, DisablePublisher, SetCombineMode (domain-aware)

### Rule E: Flatline [L252-277]
**Condition**: range < threshold AND deltaMean < threshold AND window > 1s
**Severity**: info
**Fixes**: AddMotionLens, ProbePublisher

### Rule F: Excessive Jitter [L280-306]
**Condition**: deltaMean > threshold AND range < saturation_threshold
**Severity**: warn
**Fixes**: AddLens (Lag), DisablePublisher

### Rule G: Clipping/Saturation [L309-337]
**Condition**: Numeric/color/trigger bounds hit repeatedly
**Severity**: warn
**Fixes**: AddLens (Softclip/Remap), Dismiss

### Rule H: Field Materialization Heavy [L340-364]
**Condition**: fieldMaterializations > threshold OR topMaterializers[0].count > threshold
**Severity**: info (perf)
**Fixes**: ProbeBlock, SuggestDomainFilter

## Part 4: Rule Execution [L368-404]
```typescript
interface RuleContext {
  graph: DebugGraph;
  snapshot: DebugSnapshot;
  history: Map<BusId, NumericStats>;
  userProbe?: ProbeTarget;
}

function evaluateRules(ctx): Diagnostic[] {
  // Evaluate in fixed order (A, B, C, ...)
  // Deduplicate by ID
  // Return <N diagnostics
}
```

## Part 5: Deterministic IDs [L408-423]
```typescript
function diagnosticId(
  rule: string,           // 'NaNInf', 'SilentBus', etc.
  targetId: string,       // busId, bindingId, etc.
  keyFacts: string[]      // context
): string {
  const input = `${rule}:${targetId}:${keyFacts.join('|')}`;
  return sha256(input).slice(0, 16);
}
```

Same ID = same root cause = deduplicated

## Part 6: Evidence & Presentation [L428-470]
```typescript
interface Diagnostic {
  id: string;
  severity: Severity;
  code: DiagnosticCode;
  title, message: string;
  targets: TargetRef[];
  evidence: EvidenceItem[];
  fixes: DiagnosticAction[];
}

type EvidenceItem =
  | { kind: 'value'; label: string; value: ValueSummary }
  | { kind: 'count'; label: string; count: number }
  | { kind: 'text'; label: string; text: string }
  | { kind: 'sparkline'; label: string; series: ValueSummary[] };
```

Small focused evidence snippets only

## Part 7: Thresholds (Tunable) [L474-497]
```typescript
interface RuleThresholds {
  flatlineRangeThreshold: 0.001;
  flatlineDeltaMeanThreshold: 0.0001;
  flatlineWindowMs: 1000;
  jitterDeltaMeanThreshold: 0.1;
  jitterRangeCap: 0.2;
  clipThreshold: 0.05;
  materializationThreshold: 5000;
  historyWindowMs: 10000;
}
```

## Related
- [07-diagnostics-system](./07-diagnostics-system.md) - Infrastructure
- [08-observation-system](./08-observation-system.md) - Input data
- [09-debug-ui-spec](./09-debug-ui-spec.md) - Presentation
- [Invariants](../INVARIANTS.md) - I29 (error taxonomy)
