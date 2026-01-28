/**
 * Compiler Passes - Public API
 *
 * This module re-exports from the new frontend/backend structure.
 * Maintained for backward compatibility during migration.
 *
 * New code should import from:
 * - src/compiler/frontend/ for Frontend passes
 * - src/compiler/backend/ for Backend passes
 */

// Frontend passes (re-export for backward compatibility)
export { pass1TypeConstraints, getPortType } from "../frontend/analyze-type-constraints";
export type { TypeResolvedPatch, Pass1Result, Pass1Error, TypeConstraintError, PortKey } from "../frontend/analyze-type-constraints";

export { pass2TypeGraph } from "../frontend/analyze-type-graph";
export type { TypedPatch } from "../ir/patches";

// Backend passes (re-export for backward compatibility)
export { pass3Time } from "../backend/derive-time-model";
export type { TimeResolvedPatch } from "../ir/patches";

export { pass4DepGraph } from "../backend/derive-dep-graph";
export type { DepGraphWithTimeModel, DepGraph } from "../ir/patches";

export { pass5CycleValidation } from "../backend/schedule-scc";
export type { AcyclicOrLegalGraph } from "../ir/patches";

export { pass6BlockLowering } from "../backend/lower-blocks";
export type { UnlinkedIRFragments, Pass6Options } from "../backend/lower-blocks";

export { pass7Schedule } from "../backend/schedule-program";
export type { ScheduleIR } from "../backend/schedule-program";

