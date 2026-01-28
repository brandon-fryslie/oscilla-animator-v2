---
topic: 8b
name: diagnostic-rules-engine
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/topics/08b-diagnostic-rules-engine.md
category: unimplemented
audited: 2026-01-24T22:00:00Z
item_count: 12
---

# Topic 08b: Diagnostic Rules Engine - Gap Analysis

## Primary Category: UNIMPLEMENTED (12 items)

The diagnostic rules engine depends on DebugGraph and DebugSnapshot (Topic 08), which are not implemented. Therefore the entire rules engine is unimplemented. This is a T2/T3 feature that sits on top of the observation system.

### 1. History statistics computation (NumericStats, ColorStats)
- **Spec**: Per-bus incremental statistics from ring buffers (min, max, mean, range, deltaMean, nanCount, infCount, wrapCount, pulseCount)
- **Status**: UNIMPLEMENTED - No ring buffers exist for buses

### 2. Rule evaluation order (fixed sequence)
- **Spec**: Correctness -> Connectivity -> Conflicts -> Behavior -> Cost, with stable inner ordering
- **Status**: UNIMPLEMENTED

### 3. Rule A: NaN/Infinity Propagation
- **Spec**: Condition based on bus stats nanCount/infCount > 0, generates diagnostics with source tracing
- **Status**: PARTIALLY - HealthMonitor detects NaN/Inf but doesn't do source-tracing or bus-level attribution

### 4. Rule B: Silent/Dead Bus
- **Spec**: Bus with no publishers OR bus with listeners but publishers all disabled
- **Status**: UNIMPLEMENTED - Config flags exist (busWarningsEnabled) but no runtime bus analysis

### 5. Rule C: Combine Conflict
- **Spec**: Multiple publishers with incompatible combine modes
- **Status**: UNIMPLEMENTED

### 6. Rule D: Flatline/Stuck Signal
- **Spec**: Bus range < epsilon for last N samples (stuck at constant value)
- **Status**: UNIMPLEMENTED

### 7. Rule E: Jitter/Sharp Motion
- **Spec**: deltaMean > threshold (signal changing too fast, may look noisy)
- **Status**: UNIMPLEMENTED

### 8. Rule F: Clipping/Saturation
- **Spec**: Signal at min/max bounds for extended period
- **Status**: UNIMPLEMENTED

### 9. Rule G: Heavy Materialization
- **Spec**: Field materialization count > threshold per snapshot window
- **Status**: PARTIALLY - P_FIELD_MATERIALIZATION_HEAVY code exists in types but no rule generates it

### 10. Rule H: Expensive Transform
- **Spec**: Adapter/lens invocation count > threshold
- **Status**: UNIMPLEMENTED

### 11. Evidence snippets
- **Spec**: Every diagnostic includes small data proving the claim (sparkline data, value samples)
- **Status**: UNIMPLEMENTED

### 12. Suggested fixes from rules
- **Spec**: Each rule specifies fix suggestions (e.g., "Add publisher", "Check TimeRoot connections")
- **Status**: UNIMPLEMENTED

## Also

### DONE (1 item)
1. Basic NaN/Inf detection exists in HealthMonitor (batched, throttled) - serves as foundation for Rule A
