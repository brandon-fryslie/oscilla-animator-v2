/**
 * Compiler Passes - Public API
 *
 * Canonical compilation pipeline.
 * Sprint 1: Passes 1-5 (normalization, types, time, deps, SCC)
 * Sprint 2: Passes 6-8 (block lowering, link resolution)
 * Sprint 3: Passes 9-11 (render lowering, constants, debug index)
 */

// Pass 2: Type Graph
export { pass2TypeGraph } from "./pass2-types";
export type { TypedPatch } from "../ir/patches";

// Pass 3: Time Topology
export { pass3TimeTopology } from "./pass3-time";
export type { TimeResolvedPatch } from "../ir/patches";

// Pass 4: Dependency Graph
export { pass4DepGraph } from "./pass4-depgraph";
export type { DepGraphWithTimeModel } from "./pass4-depgraph";
export type { DepGraph } from "../ir/patches";

// Pass 5: SCC Validation
export { pass5CycleValidation } from "./pass5-scc";
export type { AcyclicOrLegalGraph } from "../ir/patches";

// Pass 6: Block Lowering
export { pass6BlockLowering } from "./pass6-block-lowering";
export type { UnlinkedIRFragments, ValueRefPacked } from "./pass6-block-lowering";

export { pass8LinkResolution } from "./pass8-link-resolution";
export type { LinkedGraphIR, BlockInputRootIR, BlockOutputRootIR } from "./pass8-link-resolution";

// Pass 9: Codegen
// TODO: Re-enable when pass9-codegen type issues are fixed
// Currently using buildSchedule.ts directly in the IR pipeline
// export { pass9Codegen } from "./pass9-codegen";
