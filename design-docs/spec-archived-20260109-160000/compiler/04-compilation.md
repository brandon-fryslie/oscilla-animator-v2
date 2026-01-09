# Compilation (Unified Spec)

## Pipeline

```
RawGraph
  -> GraphNormalization (expand derived blocks/edges)
  -> Validation
  -> Compilation (lower to IR/program)
  -> CompiledProgram { program, timeModel }
```

**GraphNormalization is mandatory.** The compiler consumes NormalizedGraph and never inserts blocks or edges.

## GraphNormalization Responsibilities

- Expand composites/macros into blocks + edges.
- Materialize DefaultSource blocks for inputs with zero writers.
- Materialize BusBlocks for bus UI wiring.
- Ensure global rail BusBlocks exist in every patch.
- Expand lens/adapter UI transforms into explicit derived blocks.
- Convert any stateful "wire operations" into explicit stateful blocks.
- Assign stable IDs using anchor-based rules.

## Validation Passes

1. **Type checking**
   - Port compatibility
   - CombineMode validity for TypeDesc
   - Transform compatibility

2. **Topology checks**
   - Exactly one TimeRoot
   - TimeRoot has no upstream dependencies
   - No TimeRoot inside composites

3. **Cycle checks**
   - Detect SCCs
   - Every cycle must cross a stateful block (UnitDelay or equivalent)

4. **Primitive/Composite checks**
   - Primitive blocks must have compiler implementations
   - Composite blocks must have graph definitions
   - Mismatches are compile errors (no fallback)

5. **Determinism checks**
   - Order-dependent combine uses stable writer ordering

## Input Resolution

For every input port:

1. Gather inbound edges.
2. Combine writers using the port CombinePolicy.
3. If no writers exist, use DefaultSource (already inserted in NormalizedGraph).

This is a compile-time resolution step. It does not mutate the graph.

## Output

```ts
interface CompiledProgram {
  program: Program<RenderFrame>
  timeModel: TimeModel
}
```

The compiler is a pure transform from NormalizedGraph to executable artifacts.

## Diagnostics (Compile Errors)

Compilation failures must return structured errors with locations for UI focus.

```ts
interface CompileError {
  code: string
  severity: 'error' | 'warning'
  title: string
  message: string
  details?: string[]
  locations?: ErrorLocation[]
}

type ErrorLocation =
  | { kind: 'Block'; blockId: string }
  | { kind: 'Port'; blockId: string; portId: string }
  | { kind: 'Bus'; busId: string }
  | { kind: 'Edge'; from: PortRef; to: PortRef }
  | { kind: 'Cycle'; nodes: string[] }
```
