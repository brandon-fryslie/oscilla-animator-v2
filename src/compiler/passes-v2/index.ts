/**
 * Compiler Passes - Public API
 *
 * Compilation pipeline:
 * - Pass 2: Type Graph (type resolution)
 * - Pass 3: Time Topology (time model)
 * - Pass 4: Dependency Graph
 * - Pass 5: SCC Validation (cycle check)
 * - Pass 6: Block Lowering
 * - Pass 7: Schedule Construction
 * - Pass 8: Link Resolution
 */

// Pass 2: Type Graph
export { pass2TypeGraph } from "./pass2-types";
export type { TypedPatch } from "../ir/patches";

// Pass 3: Time Topology
export { pass3Time } from "./pass3-time";
export type { TimeResolvedPatch } from "../ir/patches";

// Pass 4: Dependency Graph
export { pass4DepGraph } from "./pass4-depgraph";
export type { DepGraphWithTimeModel } from "../ir/patches";
export type { DepGraph } from "../ir/patches";

// Pass 5: SCC Validation
export { pass5CycleValidation } from "./pass5-scc";
export type { AcyclicOrLegalGraph } from "../ir/patches";

// Pass 6: Block Lowering
export { pass6BlockLowering } from "./pass6-block-lowering";
export type { UnlinkedIRFragments } from "./pass6-block-lowering";

// Pass 7: Schedule Construction
export { pass7Schedule } from "./pass7-schedule";
export type { ScheduleIR } from "./pass7-schedule";

// Pass 8: Link Resolution
// TODO: Fix pass8LinkResolution exports
// export { pass8LinkResolution } from "./pass8-link-resolution";
