/**
 * Pass 3: Time Topology
 *
 * Determines the time model from TimeRoot blocks and generates derived time signals.
 */

import type { TypedPatch, TimeResolvedPatch, TimeSignals } from "../ir/patches";
import type { TimeModelIR } from "../ir/schedule";
import { IRBuilderImpl } from "../ir/IRBuilderImpl";

/**
 * Pass 3: Resolve time topology and generate time signals.
 */
export function pass3TimeTopology(
  typed: TypedPatch,
  errors: string[]
): TimeResolvedPatch {
  // Find TimeRoot block
  const timeRoot = typed.normalizedPatch.blocks.find(
    (b) => b.kind === "InfiniteTimeRoot" || b.kind === "FiniteTimeRoot" || b.kind === "TimeRoot"
  );

  // Determine time model
  const timeModel = extractTimeModel(timeRoot, errors);

  // Generate time signals
  const timeSignals = generateTimeSignals(timeModel);

  return {
    ...typed,
    timeModel,
    timeSignals,
  };
}

/**
 * Extract time model from TimeRoot block.
 */
function extractTimeModel(
  timeRoot: { kind: string; params?: Record<string, unknown> } | undefined,
  errors: string[]
): TimeModelIR {
  if (!timeRoot) {
    // Default to infinite if no TimeRoot
    return { kind: "infinite" };
  }

  // FiniteTimeRoot block
  if (timeRoot.kind === "FiniteTimeRoot") {
    const durationMs = (timeRoot.params?.durationMs as number) ?? 10000;
    if (durationMs <= 0) {
      errors.push(`Invalid FiniteTimeRoot duration: ${durationMs}ms`);
    }
    return { kind: "finite", durationMs: Math.max(1, durationMs) };
  }

  // InfiniteTimeRoot or default
  return { kind: "infinite" };
}

/**
 * Generate time signals for the time model.
 */
function generateTimeSignals(timeModel: TimeModelIR): TimeSignals {
  const builder = new IRBuilderImpl();

  // All models have tModelMs
  const tModelMs = builder.sigTimeModelMs();

  // All models have phaseA and phaseB
  const phaseA = builder.sigPhase01();
  const phaseB = builder.sigPhase01(); // Second phase

  if (timeModel.kind === "finite") {
    const progress01 = builder.sigProgress01();
    return { tModelMs, phaseA, phaseB, progress01 };
  }

  // Infinite model
  return { tModelMs, phaseA, phaseB };
}
