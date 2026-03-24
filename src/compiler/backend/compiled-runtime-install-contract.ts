// [RECOVER-07] Canonical compile-time topology install.
//
// This module publishes canonical compile-time assets (ShapeBank topology
// headers and sink table descriptors) into compile-worker output. It does NOT
// call the CPU runtime materializer, instance count resolver, or ShapeBank
// allocator. The GPU pipeline handles all per-frame value computation for
// both the first frame and every subsequent frame.
//
// [LAW:one-source-of-truth] The compile worker is the single publisher of the
// static install contract. Runtime services consume that payload directly.
// [LAW:single-enforcer] This module is the one boundary that derives
// compile-time install metadata from CompiledProgramIR for worker transport.
// [LAW:one-way-deps] Compile-time install derivation lives in compiler/backend
// so runtime services consume compile-owned artifacts instead of owning a
// second compile boundary.

import type { CompiledProgramIR } from '../ir/program';
import type { ValueSlot } from '../ir/Indices';
import type { Step } from '../ir/types';
import type { ValueExpr, ValueExprShapeRef } from '../ir/value-expr';
import { getProgramTopology } from '../ir/program-topology';
import { packDrawPrepSinkTableV1 } from '../../runtime/DrawPrepSinkTablePacker';
import { getValueExprChildren } from '../../runtime/ValueExprTreeWalker';
import {
  SHAPE_BANK_HEADER_WORDS,
  ShapeBankHeaderWord,
} from '../../runtime/RuntimeState';
import { ShapeClass, TopologyMode } from '../../shapes/types';
import type { PathTopologyDef, TopologyDef } from '../../shapes/types';
import { packParametricShapeBankRecord, parametricRecordWordCount } from '../../shapes/parametric-templates';

export interface CompiledDrawPrepInstallArtifact {
  readonly words: Uint32Array;
  readonly wordCount: number;
}

export interface CompiledShapeBankInstallArtifact {
  readonly words: Uint32Array;
  readonly wordCount: number;
  readonly topologyIdByHandle: Uint32Array;
}

export interface CompiledRuntimeInstallContract {
  // [LAW:dataflow-not-control-flow] Compile output always publishes the same
  // install contract shape; empty payloads use zero counts, not missing fields.
  readonly drawPrep: CompiledDrawPrepInstallArtifact;
  readonly shapeBank: CompiledShapeBankInstallArtifact;
}

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

  const topologies = shapeRefSteps.map(({ expr }) => getProgramTopology(program, expr.topologyId));

  // [LAW:dataflow-not-control-flow] Compute total word count in a single pass.
  // Type 1 records are fixed-size (SHAPE_BANK_HEADER_WORDS).
  // Type 2 records are variable-size (header + template payload + optional indices).
  const recordSizes = shapeRefSteps.map(({ expr }) => {
    if (expr.parametricTemplate) {
      return parametricRecordWordCount(expr.parametricTemplate);
    }
    return SHAPE_BANK_HEADER_WORDS;
  });
  const totalWords = recordSizes.reduce((sum, n) => sum + n, 0);
  const shapeBankWords = new Uint32Array(totalWords);
  // Sidecar keyed by word offset — allocate full size for sparse O(1) lookup.
  const topologyIdByHandle = new Uint32Array(totalWords);

  let wordOffset = 0;
  for (let stepIdx = 0; stepIdx < shapeRefSteps.length; stepIdx++) {
    const { target, expr } = shapeRefSteps[stepIdx]!;
    const topology = topologies[stepIdx]!;

    // [LAW:one-source-of-truth] ShapeBank CP header words carry symbolic slot IDs.
    // Rust MMU is the single boundary that resolves physical base/stride words.
    let cpArenaBaseOffset = 0;
    let cpArenaLaneStride = 0;
    let cpArenaComponentStride = 0;
    if (expr.controlPointField != null) {
      const slot = program.runtimeAddressTable.fieldExprToSlot.get(
        expr.controlPointField as number,
      );
      if (slot !== undefined) {
        cpArenaBaseOffset = assertFiniteUint32(
          Number(slot),
          `shapeRef(${String(expr.topologyId)}).controlPointSlotId`,
        );
      }
    }

    if (expr.parametricTemplate) {
      // -- Type 2 Parametric: pack header + template payload --
      // [LAW:one-source-of-truth] packParametricShapeBankRecord is the single
      // producer of Type 2 ShapeBank records. Writes directly into the
      // pre-allocated shapeBankWords buffer — no intermediate allocation.
      packParametricShapeBankRecord(
        shapeBankWords,
        wordOffset,
        expr.parametricTemplate,
        cpArenaBaseOffset,
        cpArenaLaneStride,
        cpArenaComponentStride,
      );
    } else {
      // -- Type 1 Rigid: write 16-word header --
      const isPath = isPathTopology(topology);

      // [RECOVER-04] Fan triangulation: the vertex shader generates triangle fans
      // from @builtin(vertex_index). For closed paths with N control points, the
      // fan produces (N-2) triangles × 3 vertices each. For open paths, vertices
      // are consumed sequentially (triangle list from CPs).
      // [LAW:one-source-of-truth] Vertex cardinality comes from topology
      // metadata for both path and non-path records.
      const cpCount = isPath ? topology.totalControlPoints : 0;
      const vertexCount = isPath && topology.closed && cpCount >= 3
        ? (cpCount - 2) * 3
        : cpCount;
      const indexCount = isPath && topology.closed && cpCount >= 3
        ? (cpCount - 2) * 3
        : 0;
      // [LAW:one-source-of-truth] ShapeBank header flags are encoded directly
      // from compile-time topology metadata (bit0 = closed path).
      const flags = isPath && topology.closed ? 1 : 0;

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
    }

    // Map the materialize step's target slot to this word offset.
    shapeWordOffsetBySlot.set(target, wordOffset);

    // Record sidecar metadata (same contract as ShapeBankState sidecar).
    topologyIdByHandle[wordOffset] = (expr.topologyId as number) >>> 0;

    wordOffset += recordSizes[stepIdx]!;
  }

  return {
    shapeBankWords,
    shapeBankWordCount: totalWords,
    shapeWordOffsetBySlot,
    topologyIdByHandle,
  };
}

// ---------------------------------------------------------------------------
// Public install planes API
// ---------------------------------------------------------------------------

// [RECOVER-07] Build the worker-owned runtime install contract from compile-time data only.
//
// No materializeValueExpr. No allocShapeBankWords. No writeShapeBankHeader.
// No resolveInstanceLaneCount. No RuntimeState mutation.
//
// The compile-time topology install stage (buildCanonicalTopologyHeaders)
// is the single GPU-visible runtime stage that owns canonical shape-handle
// production from topology metadata.
export function buildCompiledRuntimeInstallContract(
  program: CompiledProgramIR,
): CompiledRuntimeInstallContract {
  const topology = buildCanonicalTopologyHeaders(program);

  // [RECOVER-07] Sink table packer receives compile-time shape word offsets
  // directly — no arena round-trip through CPU materialization.
  const packed = packDrawPrepSinkTableV1(program, topology.shapeWordOffsetBySlot);
  const drawPrepWords = packed
    ? new Uint32Array(packed.words.subarray(0, packed.wordCount))
    : new Uint32Array(0);
  const drawPrepWordCount = packed?.wordCount ?? 0;
  const shapeBankWordCount = assertFiniteUint32(
    topology.shapeBankWordCount,
    'gpuDrivenShapeBank.wordCount',
  );

  return {
    drawPrep: {
      words: drawPrepWords,
      wordCount: drawPrepWordCount,
    },
    shapeBank: {
      words: topology.shapeBankWords,
      wordCount: shapeBankWordCount,
      topologyIdByHandle: topology.topologyIdByHandle,
    },
  };
}
