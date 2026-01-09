/**
 * Compiler Passes - Public API
 *
 * Canonical compilation pipeline.
 * Sprint 1: Passes 1-5 (normalization, types, time, deps, SCC)
 * Sprint 2: Passes 6-8 (block lowering, link resolution)
 * Sprint 3: Passes 9-11 (render lowering, constants, debug index)
 *
 * Note: Pass 7 (bus lowering) has been removed - buses are now treated
 * identically to other blocks in Pass 6.
 */
export { pass2TypeGraph } from "./pass2-types";
export type { TypedPatch } from "../ir/patches";
export { pass3TimeTopology } from "./pass3-time";
export type { TimeResolvedPatch } from "../ir/patches";
export { pass4DepGraph } from "./pass4-depgraph";
export type { DepGraphWithTimeModel } from "./pass4-depgraph";
export type { DepGraph } from "../ir/patches";
export { pass5CycleValidation } from "./pass5-scc";
export type { AcyclicOrLegalGraph } from "../ir/patches";
export { pass6BlockLowering } from "./pass6-block-lowering";
export type { UnlinkedIRFragments, ValueRefPacked } from "./pass6-block-lowering";
export { pass8LinkResolution } from "./pass8-link-resolution";
export type { LinkedGraphIR, BlockInputRootIR, BlockOutputRootIR } from "./pass8-link-resolution";
