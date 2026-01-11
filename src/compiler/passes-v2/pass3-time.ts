/**
 * Pass 3: Time Topology
 *
 * Determines the time model from TimeRoot blocks and generates derived time signals.
 */

import type { TypedPatch, TimeResolvedPatch, TimeSignals } from "../ir/patches";
import type { TimeModelIR } from "../ir/schedule";
import type { Block } from "../../graph/Patch";
import { IRBuilderImpl } from "../ir/IRBuilderImpl";
import { signalType } from "../../core/canonical-types";

/**
 * Pass 3: Resolve time topology and generate time signals.
 */
export function pass3TimeTopology(
  typed: TypedPatch
): TimeResolvedPatch {
  // Find all TimeRoot blocks
  const timeRoots = typed.blocks.filter(
    (b: Block) => b.type === "InfiniteTimeRoot" || b.type === "FiniteTimeRoot" || b.type === "TimeRoot"
  );

  // Validate TimeRoot count
  if (timeRoots.length === 0) {
    throw new Error("NoTimeRoot: Patch must have exactly one TimeRoot block");
  }

  if (timeRoots.length > 1) {
    throw new Error(`MultipleTimeRoots: Patch has ${timeRoots.length} TimeRoot blocks`);
  }

  const timeRoot = timeRoots[0];

  // Determine time model
  const timeModel = extractTimeModel(timeRoot);

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
  timeRoot: Block
): TimeModelIR {
  // FiniteTimeRoot block
  if (timeRoot.type === "FiniteTimeRoot") {
    const durationMs = (timeRoot.params?.durationMs as number) ?? 10000;
    if (durationMs <= 0) {
      throw new Error(`Pass 3 (Time Topology) failed: Invalid FiniteTimeRoot duration: ${durationMs}ms`);
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

  // All models have tModelMs - r1 (scalar real number)
  const tModelMs = builder.sigTime('tMs', signalType('r'));

  // All models have phaseA and phaseB - r1 (scalar real number)
  const phaseA = builder.sigTime('phaseA', signalType('r'));
  const phaseB = builder.sigTime('phaseB', signalType('r'));

  if (timeModel.kind === "finite") {
    const progress01 = builder.sigTime('progress', signalType('r'));
    return { tModelMs, phaseA, phaseB, progress01 };
  }

  // Infinite model
  return { tModelMs, phaseA, phaseB };
}
