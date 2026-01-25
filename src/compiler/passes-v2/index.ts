/**
 * Compiler Passes - Public API
 *
 * Compilation pipeline:
 * - Pass 1: Type Constraints (unit inference via constraint solving)
 * - Pass 2: Type Graph (type validation)
 * - Pass 3: Time Topology (time model)
 * - Pass 4: Dependency Graph
 * - Pass 5: SCC Validation (cycle check)
 * - Pass 6: Block Lowering
 * - Pass 7: Schedule Construction
 */

// Pass 1: Type Constraints (unit inference)
export { pass1TypeConstraints, getResolvedPortType } from "./pass1-type-constraints";
export type { ResolvedTypes, ResolvedTypesResult, ResolvedTypesError, TypeConstraintError, PortKey } from "./pass1-type-constraints";

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
export type { UnlinkedIRFragments, Pass6Options } from "./pass6-block-lowering";

// Pass 7: Schedule Construction
export { pass7Schedule } from "./pass7-schedule";
export type { ScheduleIR } from "./pass7-schedule";

