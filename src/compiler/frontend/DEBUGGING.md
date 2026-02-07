# Frontend Compiler Debugging

## Cardinality Solver Trace

The cardinality solver resolves `one`/`many`/`zero` cardinality values across the graph using a union-find structure. A built-in trace mode logs every solver decision to the browser console, making it easy to diagnose issues like root sharing between ports or incorrect cardinality propagation.

### Enabling

1. Open the app
2. Open the **Settings** panel (right sidebar)
3. Under the **Debug** section, toggle **Trace Cardinality Solver** on
4. Edit the graph (or trigger a recompile)
5. Open the browser console (`Cmd+Option+J` / `F12`) to see trace output

The trace is opt-in and has zero overhead when disabled. It is controlled by the `traceCardinalitySolver` field in `debug-settings.ts` and flows through the compiler pipeline:

```
SettingsStore → CompileOrchestrator → compileFrontend() → pass1TypeConstraints() → solveCardinality()
```

### Reading the output

All lines are prefixed with `[CardinalitySolver]` for easy filtering. The solver runs in 6 phases:

**Phase 1: Constraints** — Lists each constraint (equal, zipBroadcast, fixed) with port names, then dumps the UF groups showing which ports share a root.

**Phase 2: Port type propagation** — Shows each port type assignment. Zip members with `card=one` are logged as `DEFERRED pendingOne` instead of being assigned immediately.

**Phase 3: Edge propagation** — For each edge, logs the union result:
- `OK root=... val=...` — union succeeded, shows the new shared root and value
- `SUPPRESSED` — one-vs-many conflict was suppressed (zip broadcast case)
- `CONFLICT` — real conflict that produces a compile error

After Phase 3, a full UF dump is printed. This is the most useful checkpoint for diagnosing root-sharing bugs — check whether two ports that shouldn't share a root have been unioned.

**Phase 4: ZipBroadcast resolution** — Iterates to resolve zip groups. Each decision is logged:
- `SKIP pendingOne` — input port shares a UF root with an external zip output, so committing `one` would poison it
- `COMMIT pendingOne` — safe to commit `one` (no external output sharing root)
- `ASSIGN` — unresolved port gets the group's best `many` value
- `UPGRADE` — placeholder `many` upgraded to concrete instance ref

Each iteration ends with a UF dump.

**Phase 4b: Remaining pendingOne** — Commits any deferred `one` values that weren't handled in Phase 4.

**Phase 5: Final resolution** — Lists the final `port → cardinality` mapping written back to port types.

### Example: diagnosing a root-sharing bug

If port `2:out:out` incorrectly gets `card=one` when it should be `many`, look at the Phase 3 UF dump:

```
[CardinalitySolver] === Phase 3: Edge propagation ===
  [Phase3] edge SineOsc.out → HueShift.h: OK root=port:2:out:out val=one
  ...
  [UF Dump] After Phase 3 (4 groups)
    root=port:2:out:out  val=one  members=[port:2:out:out, port:19:h:in, var:block:2]
```

This shows that `2:out:out` and `19:h:in` share a root after the edge union, and the root already has value `one`. The bug is that `19:h:in` brought a `one` value into a root that the output port needs to be `many`.

### Programmatic use

The trace is also available directly on the solver for unit tests or ad-hoc debugging:

```typescript
import { solveCardinality } from './solve-cardinality';

const result = solveCardinality({
  portTypes,
  constraints,
  edges,
  blockName: (idx) => `Block${idx}`,
  trace: true,  // logs to console
});
```

Pass `trace: false` or omit it for zero overhead.
