# Spec: Compiler Passes Primitives

**Date:** 2025-12-28
**Status:** PROPOSED
**Category:** Compiler Passes
**Priority:** Tier 0-1

---

## Overview

Individual compiler passes have specific gaps that prevent correct IR generation. This spec covers pass-specific fixes.

---

## Backlog Checklist

- [ ] Remove placeholder signal emission in pass6 (per-block lowering).
- [ ] Remove placeholder field emission in pass6 (per-block lowering).
- [ ] Complete pass8 link resolution and fail on unresolved references.
- [ ] Implement pass3 TimeRoot extraction + time slot allocation.
- [ ] Fix dependency graph construction in pass4 (wire/bus/time edges).
- [ ] Improve SCC analysis in pass5 with feedback validation.

---

## Gap 1: Pass 6 - Placeholder Signal Emission (CRITICAL)

### Current State

**Location:** `src/editor/compiler/passes/pass6-block-lowering.ts`

```typescript
// Many blocks emit sigTimeAbsMs placeholder for all signal outputs
const sigId = builder.sigTimeAbsMs();  // WRONG: Should be actual computation
```

### Impact

- Signal computations return wrong values
- All signals are time instead of computed values

### Proposed Solution

```typescript
// Each block's lower function must emit actual computation
// Example: LFO block

// WRONG (current):
const lowerLFO: BlockLowerFn = ({ ctx, config }) => {
  const sigId = ctx.b.sigTimeAbsMs();  // Placeholder!
  return { outputs: [{ k: "sig", id: sigId }] };
};

// CORRECT:
const lowerLFO: BlockLowerFn = ({ ctx, inputs, config }) => {
  const phase = inputs.get("phase");  // Signal<phase01>
  const frequency = inputs.get("frequency");  // Signal<number>
  const waveform = config.waveform ?? "sine";

  // Actually compute LFO
  const scaled = ctx.b.sigMul(phase.id, frequency.id);
  const waveKernel = getWaveformKernel(waveform);
  const result = ctx.b.sigMap(scaled, waveKernel);

  const slot = ctx.b.allocValueSlot({ world: "signal", domain: "number" });
  ctx.b.registerSigSlot(result, slot);

  return { outputs: [{ k: "sig", id: result, slot }] };
};

// Audit all blocks for placeholder usage
const BLOCKS_WITH_PLACEHOLDERS = [
  "LFO",
  "Shaper",
  "SignalMath",
  "Mixer",
  "Envelope",
  // ... audit to find all
];
```

### Files to Audit

All files in `src/editor/compiler/blocks/signal/`:
- `LFO.ts`
- `Shaper.ts`
- `Mixer.ts`
- `SignalMath.ts`
- `Envelope.ts`
- `Quantizer.ts`

### Complexity

High - Each block needs individual fix.

---

## Gap 2: Pass 6 - Field Placeholder Emission (CRITICAL)

### Current State

```typescript
// Many blocks emit fieldConst(0) placeholder for field outputs
const fieldId = builder.fieldConst(0, type);  // WRONG
```

### Impact

- Field computations return zeros
- Field transformations don't work

### Proposed Solution

Similar to signals, each field block must emit actual computation.

```typescript
// Example: FieldHueGradient

// WRONG (current):
const lowerFieldHueGradient: BlockLowerFn = ({ ctx, config }) => {
  const fieldId = ctx.b.fieldConst(0, colorType);  // Placeholder!
  return { outputs: [{ k: "field", id: fieldId }] };
};

// CORRECT (requires SPEC-01 FieldExprMapIndexed):
const lowerFieldHueGradient: BlockLowerFn = ({ ctx, inputs, config }) => {
  const hueOffset = inputs.get("hueOffset")?.id;
  const spread = inputs.get("spread")?.id;
  const saturation = inputs.get("saturation")?.id;
  const lightness = inputs.get("lightness")?.id;

  // Use FieldExprMapIndexed with signals
  const fieldId = ctx.b.fieldMapIndexed(
    ctx.getDomainSlot(),
    {
      kind: "kernel",
      name: "hueGradient",
      params: { hueOffset, spread, saturation, lightness },
    },
    [hueOffset, spread, saturation, lightness]  // Signals to evaluate
  );

  const slot = ctx.b.allocValueSlot(colorType);
  ctx.b.registerFieldSlot(fieldId, slot);

  return { outputs: [{ k: "field", id: fieldId, slot }] };
};
```

### Complexity

High - Requires SPEC-01 primitives first.

---

## Gap 3: Pass 8 - Link Resolution Incomplete (HIGH)

### Current State

**Location:** `src/editor/compiler/passes/pass8-link-resolution.ts`

Pass 8 should:
1. Resolve all symbolic references to concrete slots
2. Validate all links are satisfied
3. Emit final linked IR

Currently some links remain unresolved.

### Impact

- Runtime errors for unresolved references
- Some signals/fields not accessible

### Proposed Solution

```typescript
// Comprehensive link resolution
interface LinkResolutionResult {
  program: LinkedProgramIR;
  unresolvedLinks: UnresolvedLink[];
  warnings: string[];
}

function pass8LinkResolution(input: Pass7Output): LinkResolutionResult {
  const unresolved: UnresolvedLink[] = [];
  const warnings: string[] = [];

  // 1. Resolve signal references
  for (const sigExpr of input.sigExprs) {
    if (sigExpr.kind === "inputSlot" && !isSlotAllocated(sigExpr.slot)) {
      unresolved.push({
        kind: "signal",
        exprId: sigExpr.id,
        slot: sigExpr.slot,
        reason: "Slot not allocated",
      });
    }
  }

  // 2. Resolve field references
  for (const fieldExpr of input.fieldExprs) {
    if (fieldExpr.kind === "inputSlot" && !isSlotAllocated(fieldExpr.slot)) {
      unresolved.push({
        kind: "field",
        exprId: fieldExpr.id,
        slot: fieldExpr.slot,
        reason: "Slot not allocated",
      });
    }
  }

  // 3. Resolve bus references
  for (const bus of input.busRoots) {
    for (const pubSlot of bus.publisherSlots) {
      if (!isSlotAllocated(pubSlot)) {
        unresolved.push({
          kind: "bus",
          busId: bus.busId,
          slot: pubSlot,
          reason: "Publisher slot not allocated",
        });
      }
    }
  }

  // 4. Fail if unresolved
  if (unresolved.length > 0) {
    throw new CompileError(
      `Link resolution failed:\n${unresolved.map(formatUnresolved).join("\n")}`
    );
  }

  return { program: buildLinkedProgram(input), unresolvedLinks: [], warnings };
}
```

### Complexity

Medium - Systematic validation.

---

## Gap 4: Pass 3 - TimeRoot Not Extracted (HIGH)

### Current State

TimeRoot configuration isn't extracted and threaded through.

### Impact

- All patches use infinite time
- Cyclic time doesn't work

### Proposed Solution

```typescript
// src/editor/compiler/passes/pass3-time-resolution.ts

interface Pass3Output {
  timeRoots: TimeRootBlock[];
  timeModel: TimeModelIR;
  timeSlots: TimeSlotAllocation;
}

interface TimeSlotAllocation {
  tAbsMsSlot: ValueSlot;
  tModelMsSlot: ValueSlot;
  phase01Slot?: ValueSlot;
  wrapEventSlot?: ValueSlot;
  progress01Slot?: ValueSlot;
}

function pass3TimeResolution(patch: Patch): Pass3Output {
  const timeRoots = findBlocksByType(patch, "TimeRoot");

  // Validate exactly one TimeRoot
  if (timeRoots.length > 1) {
    throw new CompileError(
      `Found ${timeRoots.length} TimeRoot blocks. Exactly one required.`
    );
  }

  const timeModel = timeRoots.length === 0
    ? { kind: "infinite" as const }
    : extractTimeModel(timeRoots[0]);

  // Allocate time slots based on model
  const timeSlots = allocateTimeSlots(timeModel);

  return { timeRoots, timeModel, timeSlots };
}

function extractTimeModel(block: Block): TimeModelIR {
  const config = block.config as TimeRootConfig;

  switch (config.mode) {
    case "infinite":
      return { kind: "infinite" };

    case "cyclic":
      if (!config.periodMs || config.periodMs <= 0) {
        throw new CompileError("Cyclic TimeRoot requires positive periodMs");
      }
      return {
        kind: "cyclic",
        periodMs: config.periodMs,
        offset: config.offsetMs ?? 0,
      };

    case "finite":
      if (!config.durationMs || config.durationMs <= 0) {
        throw new CompileError("Finite TimeRoot requires positive durationMs");
      }
      return {
        kind: "finite",
        durationMs: config.durationMs,
        fillMode: config.fillMode ?? "hold",
      };

    default:
      throw new CompileError(`Unknown TimeRoot mode: ${config.mode}`);
  }
}
```

### Complexity

Medium - Clear extraction logic.

---

## Gap 5: Pass 4 - Dependency Graph Incomplete (MEDIUM)

### Current State

Dependency graph misses some edge cases.

### Impact

- Wrong evaluation order in some cases
- Circular dependency detection incomplete

### Proposed Solution

```typescript
// Enhanced dependency analysis
function pass4DependencyGraph(patch: Patch, pass3: Pass3Output): Pass4Output {
  const graph = new DependencyGraph();

  // 1. Add all blocks as nodes
  for (const block of patch.blocks) {
    graph.addNode(block.id, {
      type: block.type,
      inputs: getBlockInputs(block),
      outputs: getBlockOutputs(block),
    });
  }

  // 2. Add wire edges
  for (const wire of patch.wires) {
    graph.addEdge(wire.from.blockId, wire.to.blockId, {
      kind: "wire",
      port: wire.to.portId,
    });
  }

  // 3. Add bus edges (publisher → listener)
  for (const bus of patch.buses) {
    const publishers = findBusPublishers(patch, bus.id);
    const listeners = findBusListeners(patch, bus.id);

    for (const pub of publishers) {
      for (const listener of listeners) {
        graph.addEdge(pub.blockId, listener.blockId, {
          kind: "bus",
          busId: bus.id,
        });
      }
    }
  }

  // 4. Add implicit time dependency
  // Blocks reading time depend on TimeRoot
  const timeRootId = pass3.timeRoots[0]?.id;
  if (timeRootId) {
    for (const block of patch.blocks) {
      if (blockReadsTime(block)) {
        graph.addEdge(timeRootId, block.id, { kind: "time" });
      }
    }
  }

  // 5. Detect cycles
  const cycles = graph.findCycles();
  if (cycles.length > 0) {
    throw new CompileError(
      `Circular dependency detected:\n${cycles.map(formatCycle).join("\n")}`
    );
  }

  return { graph, sortedBlocks: graph.topologicalSort() };
}
```

### Complexity

Medium - Graph algorithm improvements.

---

## Gap 6: Pass 5 - SCC Analysis Limited (MEDIUM)

### Current State

Strongly Connected Components analysis doesn't handle all feedback patterns.

### Impact

- Some feedback loops not detected
- Recursive structures may cause issues

### Proposed Solution

```typescript
// Enhanced SCC analysis with feedback handling
function pass5SCC(graph: DependencyGraph): Pass5Output {
  // Tarjan's algorithm for SCC detection
  const sccs = tarjanSCC(graph);

  // Classify SCCs
  const feedback: FeedbackLoop[] = [];
  const acyclic: string[][] = [];

  for (const scc of sccs) {
    if (scc.length === 1) {
      // Check for self-loop
      const node = scc[0];
      if (graph.hasEdge(node, node)) {
        feedback.push({
          kind: "self-loop",
          nodes: scc,
          breakpoint: node,
        });
      } else {
        acyclic.push(scc);
      }
    } else {
      // Multi-node cycle
      feedback.push({
        kind: "cycle",
        nodes: scc,
        breakpoint: selectBreakpoint(scc, graph),
      });
    }
  }

  // Validate feedback is intentional (has delay block)
  for (const loop of feedback) {
    if (!hasDelayInLoop(loop, graph)) {
      throw new CompileError(
        `Feedback loop without delay: ${loop.nodes.join(" → ")}. ` +
        `Add a Delay block to break the cycle.`
      );
    }
  }

  return { sccs, feedback, acyclic };
}

function selectBreakpoint(scc: string[], graph: DependencyGraph): string {
  // Prefer delay blocks as breakpoints
  for (const node of scc) {
    if (graph.getNode(node).type === "Delay") {
      return node;
    }
  }
  // Otherwise pick first node
  return scc[0];
}
```

### Complexity

Medium - Algorithm extension.

---

## Summary

| Gap | Severity | Complexity | Pass | Enables |
|-----|----------|------------|------|---------|
| Signal placeholders | CRITICAL | High | 6 | Correct signal computation |
| Field placeholders | CRITICAL | High | 6 | Correct field computation |
| Link resolution | HIGH | Medium | 8 | Complete IR linking |
| TimeRoot extraction | HIGH | Medium | 3 | Cyclic time support |
| Dependency graph | MEDIUM | Medium | 4 | Correct eval order |
| SCC analysis | MEDIUM | Medium | 5 | Feedback handling |

**Recommended order:** Pass 3 TimeRoot → Pass 6 placeholders → Pass 8 linking → Pass 4/5 improvements
