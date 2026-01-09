/**
 * Pass 3: Time Topology Inference
 *
 * Infers time model from TimeRoot blocks and generates canonical time signals.
 *
 * Input: TypedPatch (from Pass 2)
 * Output: TimeResolvedPatch with TimeModelIR + TimeSignals
 *
 * Validation:
 * - Exactly one TimeRoot block (compile error otherwise)
 * - Time model is well-formed (period > 0, etc.)
 *
 * References:
 * - HANDOFF.md Topic 4: Pass 3 - Time Topology Inference
 * - design-docs/12-Compiler-Final/15-Canonical-Lowering-Pipeline.md § Pass 3
 * - design-docs/spec/TIME.md
 */
import type { TypedPatch } from "../ir/patches";
import type { TimeResolvedPatch } from "../ir/patches";
/**
 * Pass 3: Time Topology Inference
 *
 * Infers time model from TimeRoot block and generates canonical time signals.
 *
 * Accumulates all errors before throwing, so users see all problems at once.
 *
 * Algorithm:
 * 1. Find TimeRoot block (exactly one required)
 * 2. Extract TimeModel IR from TimeRoot parameters
 * 3. Generate canonical time signals
 * 4. Return TimeResolvedPatch
 *
 * @param typedPatch - TypedPatch from Pass 2
 * @returns TimeResolvedPatch with TimeModelIR + TimeSignals
 * @throws Error with all accumulated errors if validation fails
 */
export declare function pass3TimeTopology(typedPatch: TypedPatch): TimeResolvedPatch;
