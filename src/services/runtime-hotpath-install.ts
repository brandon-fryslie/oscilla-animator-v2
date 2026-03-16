// [RECOVER-07] Canonical compile-time topology install.
//
// This module publishes canonical compile-time assets (ShapeBank topology
// headers and sink table descriptors) to the renderer worker. It does NOT
// call the CPU runtime materializer, instance count resolver, or ShapeBank
// allocator. The GPU pipeline handles all per-frame value computation for
// both the first frame and every subsequent frame.
//
// [LAW:one-source-of-truth] The GPU pipeline is the single runtime
// execution authority. Install publishes static compile-time assets only.
// [LAW:single-enforcer] This module is the single GPU-visible runtime
// stage that owns canonical shape-handle production from compile-time
// topology metadata.

import type { CompiledProgramIR } from '../compiler/ir/program';
import type { ValueSlot } from '../compiler/ir/Indices';
import type { Step } from '../compiler/ir/types';
import type { ValueExpr, ValueExprShapeRef } from '../compiler/ir/value-expr';
import { getProgramTopology } from '../compiler/ir/program-topology';
import { resolveArenaAddress } from '../runtime/ArenaValueStore';
import { packDrawPrepSinkTableV1 } from '../runtime/DrawPrepSinkTablePacker';
import { getValueExprChildren } from '../runtime/ValueExprTreeWalker';
import {
  SHAPE_BANK_HEADER_WORDS,
  SHAPE_BANK_NO_CONTROL_POINT_SLOT,
  ShapeBankHeaderWord,
} from '../runtime/RuntimeState';
import { ShapeClass, TopologyMode } from '../shapes/types';
import type { PathTopologyDef, TopologyDef } from '../shapes/types';

const MAX_UINT32 = 0xFFFF_FFFF;

function assertFiniteUint32(value: number, context: string): number {
  if (
    !Number.isFinite(value)
    || !Number.isInteger(value)
    || !Number.isSafeInteger(value)
    || value < 0
    || value > MAX_UINT32
  ) {
    throw new Error(`${context} must be a uint32 (got ${String(value)})`);
  }
  return value;
}

function isPathTopology(topology: TopologyDef): topology is PathTopologyDef {
  return 'verbs' in topology;
}

// [RECOVER-04] Resolve through expression wrappers (broadcast, etc.) to find
// the underlying shapeRef expression. The compiler wraps shapeRef in a broadcast
// when the source isn't already a field extent, so materialize steps may point
// to a broadcast rather than the shapeRef directly.
function findShapeRefExpr(
  rootExprIndex: number,
  valueExprNodes: readonly ValueExpr[],
): ValueExprShapeRef | undefined {
  const stack = [rootExprIndex];
  const visited = new Set<number>();
  while (stack.length > 0) {
    const idx = stack.pop()!;
    if (visited.has(idx)) continue;
    visited.add(idx);
    const expr = valueExprNodes[idx];
    if (!expr) continue;
    if (expr.kind === 'shapeRef') return expr as ValueExprShapeRef;
    for (const child of getValueExprChildren(expr)) {
      stack.push(child as number);
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Compile-time topology install — the GPU-visible runtime stage
// ---------------------------------------------------------------------------

interface CanonicalTopologyInstall {
  readonly shapeBankWords: Uint32Array;
  readonly shapeBankWordCount: number;
  // [RECOVER-07] Shape word offsets keyed by ValueSlot (materialize step target).
  // Passed to the sink table packer so it does not need to read from the arena.
  readonly shapeWordOffsetBySlot: ReadonlyMap<ValueSlot, number>;
  // Sidecar metadata for the renderer (same contract as ShapeBankState).
  readonly topologyIdByHandle: Uint32Array;
  readonly controlPointSlotByHandle: Int32Array;
}

// [RECOVER-07] Build ShapeBank topology headers from compile-time data only.
//
// This function replaces the old materializeCanonicalShapeAssets path which
// called materializeValueExpr, allocShapeBankWords, writeShapeBankHeader,
// and resolveInstanceLaneCount. None of those appear here.
//
// Topology metadata (vertex counts, closed flags, CP arena addressing) is
// derived entirely from the compiled program's topology table and runtime
// address table — both compile-time artifacts.
function buildCanonicalTopologyHeaders(
  program: CompiledProgramIR,
): CanonicalTopologyInstall {
  const valueExprNodes = program.valueExprs.nodes;
  const shapeWordOffsetBySlot = new Map<ValueSlot, number>();

  // Collect shapeRef materialize steps from the schedule.
  // Each produces one SHAPE_BANK_HEADER_WORDS header at a deterministic offset.
  // [RECOVER-04] The compiler may wrap shapeRef in a broadcast when the source
  // isn't already a field extent, so we resolve through expression wrappers
  // rather than checking only the direct expression kind.
  const shapeRefSteps: { target: ValueSlot; expr: ValueExprShapeRef }[] = [];
  for (const step of program.schedule.steps as readonly Step[]) {
    if (step.kind !== 'materialize') continue;
    const shapeRef = findShapeRefExpr(step.field as number, valueExprNodes);
    if (!shapeRef) continue;
    shapeRefSteps.push({ target: step.target, expr: shapeRef });
  }

  const totalWords = shapeRefSteps.length * SHAPE_BANK_HEADER_WORDS;
  const shapeBankWords = new Uint32Array(totalWords);
  const topologyIdByHandle = new Uint32Array(totalWords);
  const controlPointSlotByHandle = new Int32Array(totalWords).fill(
    SHAPE_BANK_NO_CONTROL_POINT_SLOT,
  );

  let wordOffset = 0;
  for (const { target, expr } of shapeRefSteps) {
    const topology = getProgramTopology(program, expr.topologyId);
    const isPath = isPathTopology(topology);
    const vertexCount = isPath ? topology.totalControlPoints : 0;
    const indexCount = isPath && topology.closed && vertexCount >= 3
      ? (vertexCount - 2) * 3
      : 0;
    // [LAW:one-source-of-truth] ShapeBank header flags are encoded directly
    // from compile-time topology metadata (bit0 = closed path).
    const flags = isPath && topology.closed ? 1 : 0;

    // Resolve CP arena addressing from compile-time address table.
    // GPU simulation compute writes CP field values at this address;
    // vertex shader reads them via the ShapeBank header.
    let cpArenaBaseOffset = 0;
    let cpArenaLaneStride = 0;
    let cpArenaComponentStride = 0;
    let controlPointSlot = SHAPE_BANK_NO_CONTROL_POINT_SLOT;

    if (isPath && expr.controlPointField != null) {
      const slot = program.runtimeAddressTable.fieldExprToSlot.get(
        expr.controlPointField as number,
      );
      if (slot !== undefined) {
        controlPointSlot = slot as number;
        const cpDescriptor = program.runtimeAddressTable.slotToArena.get(slot);
        if (cpDescriptor) {
          const cpAddress = resolveArenaAddress(cpDescriptor);
          cpArenaBaseOffset = cpAddress.baseOffset;
          cpArenaLaneStride = cpAddress.laneStride;
          cpArenaComponentStride = cpAddress.componentStride;
        }
      }
    }

    // [RECOVER-07] Write header directly into the output buffer.
    // No allocShapeBankWords, no writeShapeBankHeader, no ShapeBankState mutation.
    shapeBankWords[wordOffset + ShapeBankHeaderWord.Kind] = ShapeClass.Type1Rigid >>> 0;
    shapeBankWords[wordOffset + ShapeBankHeaderWord.TopologyMode] =
      (isPath ? TopologyMode.Path : TopologyMode.NonPath) >>> 0;
    shapeBankWords[wordOffset + ShapeBankHeaderWord.Flags] = flags >>> 0;
    shapeBankWords[wordOffset + ShapeBankHeaderWord.MaterialClass] = 0;
    shapeBankWords[wordOffset + ShapeBankHeaderWord.IndexCount] = indexCount >>> 0;
    shapeBankWords[wordOffset + ShapeBankHeaderWord.FirstIndex] = 0;
    shapeBankWords[wordOffset + ShapeBankHeaderWord.BaseVertex] = 0;
    shapeBankWords[wordOffset + ShapeBankHeaderWord.VertexCount] = vertexCount >>> 0;
    shapeBankWords[wordOffset + ShapeBankHeaderWord.FirstVertex] = 0;
    shapeBankWords[wordOffset + ShapeBankHeaderWord.ParamBlockOffset] = 0;
    shapeBankWords[wordOffset + ShapeBankHeaderWord.ParamBlockWords] = 0;
    shapeBankWords[wordOffset + ShapeBankHeaderWord.CpArenaBaseOffset] = cpArenaBaseOffset >>> 0;
    shapeBankWords[wordOffset + ShapeBankHeaderWord.BoundsMinPacked] = 0;
    shapeBankWords[wordOffset + ShapeBankHeaderWord.BoundsMaxPacked] = 0;
    shapeBankWords[wordOffset + ShapeBankHeaderWord.CpArenaLaneStride] = cpArenaLaneStride >>> 0;
    shapeBankWords[wordOffset + ShapeBankHeaderWord.CpArenaComponentStride] = cpArenaComponentStride >>> 0;

    // Map the materialize step's target slot to this word offset.
    shapeWordOffsetBySlot.set(target, wordOffset);

    // Record sidecar metadata (same contract as ShapeBankState sidecar).
    topologyIdByHandle[wordOffset] = (expr.topologyId as number) >>> 0;
    controlPointSlotByHandle[wordOffset] = controlPointSlot;

    wordOffset += SHAPE_BANK_HEADER_WORDS;
  }

  return {
    shapeBankWords,
    shapeBankWordCount: totalWords,
    shapeWordOffsetBySlot,
    topologyIdByHandle,
    controlPointSlotByHandle,
  };
}

// ---------------------------------------------------------------------------
// Public install planes API
// ---------------------------------------------------------------------------

export interface RuntimeHotpathInstallPlanes {
  readonly sinkTableWords: Uint32Array | null;
  readonly sinkTableWordCount: number;
  readonly shapeBankWords: Uint32Array;
  readonly shapeBankWordCount: number;
  // [RECOVER-07] Sidecar metadata for the renderer, produced by the
  // compile-time topology install stage (not from ShapeBankState).
  readonly topologyIdByHandle: Uint32Array;
  readonly controlPointSlotByHandle: Int32Array;
}

// [RECOVER-07] Build install planes from compile-time topology data only.
//
// No materializeValueExpr. No allocShapeBankWords. No writeShapeBankHeader.
// No resolveInstanceLaneCount. No RuntimeState mutation.
//
// The compile-time topology install stage (buildCanonicalTopologyHeaders)
// is the single GPU-visible runtime stage that owns canonical shape-handle
// production from topology metadata.
export function buildRuntimeHotpathInstallPlanes(
  program: CompiledProgramIR,
): RuntimeHotpathInstallPlanes {
  const topology = buildCanonicalTopologyHeaders(program);

  // [RECOVER-07] Sink table packer receives compile-time shape word offsets
  // directly — no arena round-trip through CPU materialization.
  const packed = packDrawPrepSinkTableV1(program, topology.shapeWordOffsetBySlot);
  const sinkTableWords = packed
    ? new Uint32Array(packed.words.subarray(0, packed.wordCount))
    : null;
  const sinkTableWordCount = packed?.wordCount ?? 0;
  const shapeBankWordCount = assertFiniteUint32(
    topology.shapeBankWordCount,
    'gpuDrivenShapeBank.wordCount',
  );

  return {
    sinkTableWords,
    sinkTableWordCount,
    shapeBankWords: topology.shapeBankWords,
    shapeBankWordCount,
    topologyIdByHandle: topology.topologyIdByHandle,
    controlPointSlotByHandle: topology.controlPointSlotByHandle,
  };
}
