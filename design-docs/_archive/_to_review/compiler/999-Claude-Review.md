
This is the authoritative specification for migrating Oscilla from closure-based compilation to a data-driven IR + scheduled runtime architecture. Here's what each document covers:

  ---
Core Architecture (01-03)

| Doc                    | Topic                                                                                                                    |
  |------------------------|--------------------------------------------------------------------------------------------------------------------------|
| 01-Overview            | The "do it right" architecture: Compiled IR (no closures), deterministic VM, lazy Fields, stable IDs, central ValueStore |
| 01.1-Migration-Roadmap | 10-phase migration path from current closure world to IR-based system                                                    |
| 02-IR-Schema           | Full TypeScript types for CompiledProgramIR: time model, type tables, nodes, buses, schedule, determinism contract       |

  ---
IR Components (03-11)

| Doc                   | Topic                                                                                              |
  |-----------------------|----------------------------------------------------------------------------------------------------|
| 03-Nodes              | NodeTable, NodeIR, InputSourceIR (slot/bus/const/default/rail), capability tagging                 |
| 04-FieldExpr          | Lazy field representation as DAG, materialization plan, buffer layouts                             |
| 05-Lenses-Adapters    | Unified TransformChainIR, adapter/lens tables, transform impl refs                                 |
| 06-Default-Sources    | Constants + DefaultSource replacing params, UI widget hints                                        |
| 07-Buses              | BusTable, PublisherIR, ListenerIR, combine specs, silent values                                    |
| 08-Outputs            | OutputSpec for render tree / render commands                                                       |
| 09-Caching            | CacheKeySpec, per-step/per-materialization cache policies                                          |
| 10-Schedule-Semantics | ScheduleIR, step kinds (timeDerive, nodeEval, busEval, materialize, render), global ordering rules |
| 11-Opcode-Taxonomy    | OpCode enum: time, identity/domain, pure math, state, render, IO, transform ops                    |

  ---
SignalExpr & Evaluation (12-14)

| Doc                             | Topic                                                                                           |
  |---------------------------------|-------------------------------------------------------------------------------------------------|
| 12-SignalExpr                   | Signal as DAG (not closures): SignalExprIR, stateful ops, bus combine in signal world           |
| 13-SignalExpr-Evaluator         | Runtime data structures, SigEvaluator, per-frame caching, transform chains, state buffer layout |
| 14-Compiled-IR-Program-Contract | Full CompiledProgram shape: ProgramTables, ProgramRoots, DebugIndex, slot/wire/bus schemas      |

  ---
Compiler Pipeline (15-17)

| Doc                            | Topic                                                                                                                                                           |
  |--------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 15-Canonical-Lowering-Pipeline | 11-pass compiler: normalize → type graph → time topology → dep graph → SCC validation → block lowering → bus lowering → link → render → constants → debug index |
| 16-Block-Lowering              | BlockLowerFn contract, IRBuilder API, signal vs field rules, state allocation, render sinks                                                                     |
| 17-Scheduler-Full              | Per-frame runtime algorithm: transport → signal pass → field pass (lazy) → render pass, state/wrap semantics, no-jank hot swap                                  |

  ---
Power-User Debugger (18-20)

| Doc                   | Topic                                                                                               |
  |-----------------------|-----------------------------------------------------------------------------------------------------|
| 18-Debugger-Part-1    | IR instrumentation points: spans, ring buffers (SpanRing, ValueRing, EdgeRing), causal edge schema  |
| 19-Debugger-ValueKind | TypeKeyId, ValueRecord encoding (32 bytes fixed), field stats, hash policies, trace sampling knobs  |
| 20-TraceStorage       | Compile-time DebugIndex, runtime ring buffers, probe wrappers, causal links, cache visibility layer |

  ---
Relationship to Current Roadmap

Your roadmap already has topics that cover parts of this spec:

| Roadmap Topic             | 12-Compiler-Final Coverage                                |
  |---------------------------|-----------------------------------------------------------|
| wp0-lock-contracts        | Docs 02-03, 10 (TypeDesc, reserved buses, schedule rules) |
| wp1-timeroot-compilers    | Docs 01, 02, 10, 15 (TimeModel, timeDerive step)          |
| wp2-bus-aware-compiler    | Docs 07, 15 Pass 7 (bus lowering)                         |
| phase4-default-sources    | Doc 06 (Default Sources)                                  |
| wp4-lazy-field-core       | Docs 04, 12-14 (FieldExpr, SignalExpr)                    |
| Phase 5/6 Debugger topics | Docs 18-20 (instrumentation, trace storage)               |

  ---
Would you like me to:

1. Map each spec document to specific roadmap topics (identify gaps or missing topics)
2. Create new roadmap topics for uncovered sections of the spec
3. Compare implementation status - check what's already built vs what the spec requires

