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

import type { Block } from "../../types";
import type { TypedPatch } from "../ir/patches";
import type { TimeModelIR } from "../ir/schedule";
import type { TimeResolvedPatch, TimeSignals } from "../ir/patches";
import { IRBuilderImpl } from "../ir/IRBuilderImpl";

/**
 * Find the TimeRoot block in the patch.
 *
 * There must be exactly one TimeRoot block (FiniteTimeRoot or InfiniteTimeRoot).
 *
 * @param blocks - All blocks in the patch
 * @param errors - Error accumulator
 * @returns The TimeRoot block (first one if multiple found for continued validation)
 */
function findTimeRoot(blocks: ReadonlyMap<string, unknown>, errors: string[]): Block {
  const timeRoots: Block[] = [];

  // Use Array.from() to avoid downlevelIteration issues
  for (const blockData of Array.from(blocks.values())) {
    const block = blockData as Block;
    // Accept FiniteTimeRoot, InfiniteTimeRoot, or legacy TimeRoot
    if (block.type === "FiniteTimeRoot" || block.type === "InfiniteTimeRoot" || block.type === "TimeRoot") {
      timeRoots.push(block);
    }
  }

  if (timeRoots.length === 0) {
    errors.push("No TimeRoot block found. Every patch must have exactly one TimeRoot.");
    // Return a dummy block to allow continued validation - errors will be thrown at end
    return { id: '__missing__', type: 'FiniteTimeRoot', label: '', params: {}, position: { x: 0, y: 0 }, form: 'primitive' } as Block;
  }

  if (timeRoots.length > 1) {
    errors.push(`Multiple TimeRoot blocks found (${timeRoots.length}). Every patch must have exactly one TimeRoot. Block IDs: ${timeRoots.map(b => b.id).join(', ')}`);
  }

  return timeRoots[0];
}

/**
 * Extract TimeModel IR from TimeRoot block.
 *
 * Reads the TimeRoot's parameters and creates the canonical TimeModelIR.
 *
 * @param timeRoot - The TimeRoot block
 * @param errors - Error accumulator
 * @returns TimeModelIR specification
 */
function extractTimeModel(timeRoot: Block, errors: string[]): TimeModelIR {
  // For FiniteTimeRoot blocks
  if (timeRoot.type === "FiniteTimeRoot") {
    const durationMs = timeRoot.params?.durationMs as number | undefined;
    const duration = durationMs ?? 10000; // Default 10s duration

    if (duration <= 0) {
      errors.push(`Invalid TimeRoot duration: ${duration}ms. Duration must be > 0. (block: ${timeRoot.id})`);
    }

    return {
      kind: "finite",
      durationMs: Math.max(1, duration), // Use valid value to continue validation
    };
  }

  // For InfiniteTimeRoot blocks (produce cyclic time model)
  if (timeRoot.type === "InfiniteTimeRoot") {
    const periodMs = timeRoot.params?.periodMs as number | undefined;
    const period = periodMs ?? 4000; // Default 4s loop
    const mode = (timeRoot.params?.mode as "loop" | "pingpong") ?? "loop";

    if (period <= 0) {
      errors.push(`Invalid TimeRoot period: ${period}ms. Period must be > 0. (block: ${timeRoot.id})`);
    }

    return {
      kind: "cyclic",
      periodMs: Math.max(1, period), // Use valid value to continue validation
      mode,
      phaseDomain: "0..1",
    };
  }

  // Legacy "TimeRoot" block type - use params to determine time model
  const periodMs = timeRoot.params?.periodMs as number | undefined;
  const duration = timeRoot.params?.duration as number | undefined;
  const topology = timeRoot.params?.topology as string | undefined;

  // Determine time model kind based on topology
  if (topology === "cyclic" || (topology === undefined && periodMs !== undefined)) {
    // Cyclic time model (default if periodMs is set)
    const period = periodMs ?? 4000; // Default 4s loop
    const mode = (timeRoot.params?.mode as "loop" | "pingpong") ?? "loop";

    if (period <= 0) {
      errors.push(`Invalid TimeRoot period: ${period}ms. Period must be > 0. (block: ${timeRoot.id})`);
    }

    return {
      kind: "cyclic",
      periodMs: Math.max(1, period),
      mode,
      phaseDomain: "0..1",
    };
  }

  if (topology === "finite") {
    // Finite time model
    const dur = duration ?? 10000; // Default 10s duration

    if (dur <= 0) {
      errors.push(`Invalid TimeRoot duration: ${dur}ms. Duration must be > 0. (block: ${timeRoot.id})`);
    }

    return {
      kind: "finite",
      durationMs: Math.max(1, dur),
    };
  }

  if (topology === "infinite") {
    // Infinite time model (unbounded, no wrapping)
    return {
      kind: "infinite",
      windowMs: 60000, // Default 1 minute window for exports/sampling
    };
  }

  // Default: cyclic with 4s period
  return {
    kind: "cyclic",
    periodMs: 4000,
    mode: "loop",
    phaseDomain: "0..1",
  };
}

/**
 * Generate canonical time signals for the time model.
 *
 * Creates SignalExpr nodes for:
 * - tModelMs: Model time in milliseconds
 * - phase01: Phase 0..1 (cyclic only)
 * - wrapEvent: Wrap event (cyclic only)
 * - progress01: Progress 0..1 (finite only)
 *
 * NOTE: tAbsMs was removed - absolute time is implicit in player state,
 * not a signal expression.
 *
 * @param timeModel - TimeModel IR
 * @returns TimeSignals mapping
 */
function generateTimeSignals(timeModel: TimeModelIR): TimeSignals {
  const builder = new IRBuilderImpl();

  // All time models have tModelMs
  const tModelMs = builder.sigTimeModelMs();

  // Cyclic models also have phase01 and wrapEvent
  if (timeModel.kind === "cyclic") {
    const phase01 = builder.sigPhase01();
    const wrapEvent = builder.sigWrapEvent();

    return {
      tModelMs,
      phase01,
      wrapEvent,
    };
  }

  // Finite and infinite models only have model time
  return {
    tModelMs,
  };
}

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
export function pass3TimeTopology(
  typedPatch: TypedPatch
): TimeResolvedPatch {
  const errors: string[] = [];

  // Step 1: Find TimeRoot block
  const timeRoot = findTimeRoot(typedPatch.blocks, errors);

  // Step 2: Extract TimeModel IR
  const timeModel = extractTimeModel(timeRoot, errors);

  // Step 3: Generate canonical time signals
  const timeSignals = generateTimeSignals(timeModel);

  // Throw all accumulated errors at once
  if (errors.length > 0) {
    const errorSummary = errors.map((e) => `  - ${e}`).join("\n");
    throw new Error(
      `Pass 3 (Time Topology) failed with ${errors.length} error(s):\n${errorSummary}`
    );
  }

  // Step 4: Return TimeResolvedPatch
  return {
    ...typedPatch,
    timeModel,
    timeSignals,
  };
}
