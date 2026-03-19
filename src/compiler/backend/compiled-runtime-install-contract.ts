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
import { resolveArenaAddress } from '../../runtime/ArenaValueStore';
import { packDrawPrepSinkTableV1 } from '../../runtime/DrawPrepSinkTablePacker';
import { getValueExprChildren } from '../../runtime/ValueExprTreeWalker';
import {
  SHAPE_BANK_HEADER_WORDS,
  ShapeBankHeaderWord,
} from '../../runtime/RuntimeState';
import { ShapeClass, TopologyMode } from '../../shapes/types';
import type { PathTopologyDef, ParametricTopologyDef, TopologyDef } from '../../shapes/types';
import { isParametricTopology } from '../../shapes/registry';
import { generateParametricTemplate, parametricRibbonVertexCount } from '../../shapes/registry';

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

  // [RECOVER-11] Pre-scan to compute total ShapeBank buffer size.
  // Type 1 headers are fixed at SHAPE_BANK_HEADER_WORDS each.
  // Type 2 headers also include a param block (template t-values) appended
  // after the header, so total size varies per shape class.
  const topologies = shapeRefSteps.map(({ expr }) => getProgramTopology(program, expr.topologyId));
  let totalWords = 0;
  for (const topology of topologies) {
    totalWords += SHAPE_BANK_HEADER_WORDS;
    if (isParametricTopology(topology)) {
      totalWords += topology.resolution + 1; // t-value template words
    }
  }

  const shapeBankWords = new Uint32Array(totalWords);
  const topologyIdByHandle = new Uint32Array(totalWords);

  let wordOffset = 0;
  for (let stepIdx = 0; stepIdx < shapeRefSteps.length; stepIdx++) {
    const { target, expr } = shapeRefSteps[stepIdx]!;
    const topology = topologies[stepIdx]!;
    const isParametric = isParametricTopology(topology);
    const isPath = !isParametric && isPathTopology(topology);

    // Resolve CP arena addressing from compile-time address table.
    // GPU simulation compute writes CP field values at this address;
    // vertex shader reads them via the ShapeBank header.
    let cpArenaBaseOffset = 0;
    let cpArenaLaneStride = 0;
    let cpArenaComponentStride = 0;
    if ((isPath || isParametric) && expr.controlPointField != null) {
      const slot = program.runtimeAddressTable.fieldExprToSlot.get(
        expr.controlPointField as number,
      );
      if (slot !== undefined) {
        const cpDescriptor = program.runtimeAddressTable.slotToArena.get(slot);
        if (cpDescriptor) {
          const cpAddress = resolveArenaAddress(cpDescriptor);
          cpArenaBaseOffset = cpAddress.baseOffset;
          cpArenaLaneStride = cpAddress.laneStride;
          cpArenaComponentStride = cpAddress.componentStride;
        }
      }
    }

    // [RECOVER-11] Shape-class-specific header generation.
    // // [LAW:one-type-per-behavior] Each shape class has its own header
    // // semantics — Type 1 stores rigid CP topology, Type 2 stores
    // // parametric template progression.
    if (isParametric) {
      // --- Type 2 Parametric path ---
      const vertexCount = parametricRibbonVertexCount(topology.resolution);
      const flags = topology.closed ? 1 : 0;
      const paramBlockOffset = wordOffset + SHAPE_BANK_HEADER_WORDS;
      const paramBlockWords = topology.resolution + 1;

      shapeBankWords[wordOffset + ShapeBankHeaderWord.Kind] = ShapeClass.Type2Parametric >>> 0;
      shapeBankWords[wordOffset + ShapeBankHeaderWord.TopologyMode] = TopologyMode.Path >>> 0;
      shapeBankWords[wordOffset + ShapeBankHeaderWord.Flags] = flags >>> 0;
      shapeBankWords[wordOffset + ShapeBankHeaderWord.MaterialClass] = 0;
      shapeBankWords[wordOffset + ShapeBankHeaderWord.IndexCount] = 0; // non-indexed draw
      shapeBankWords[wordOffset + ShapeBankHeaderWord.FirstIndex] = 0;
      shapeBankWords[wordOffset + ShapeBankHeaderWord.BaseVertex] = 0;
      shapeBankWords[wordOffset + ShapeBankHeaderWord.VertexCount] = vertexCount >>> 0;
      shapeBankWords[wordOffset + ShapeBankHeaderWord.FirstVertex] = 0;
      shapeBankWords[wordOffset + ShapeBankHeaderWord.ParamBlockOffset] = paramBlockOffset >>> 0;
      shapeBankWords[wordOffset + ShapeBankHeaderWord.ParamBlockWords] = paramBlockWords >>> 0;
      shapeBankWords[wordOffset + ShapeBankHeaderWord.CpArenaBaseOffset] = cpArenaBaseOffset >>> 0;
      // [RECOVER-11] Reuse BoundsMinPacked for curve degree (u32) — the shader
      // needs to know how many control points to fetch per instance.
      shapeBankWords[wordOffset + ShapeBankHeaderWord.BoundsMinPacked] = topology.degree >>> 0;
      // [RECOVER-11] Reuse BoundsMaxPacked for ribbon width (bitcast f32→u32).
      shapeBankWords[wordOffset + ShapeBankHeaderWord.BoundsMaxPacked] =
        new Uint32Array(new Float32Array([topology.ribbonWidth]).buffer)[0]! >>> 0;
      shapeBankWords[wordOffset + ShapeBankHeaderWord.CpArenaLaneStride] = cpArenaLaneStride >>> 0;
      shapeBankWords[wordOffset + ShapeBankHeaderWord.CpArenaComponentStride] = cpArenaComponentStride >>> 0;

      // Write template t-values into the param block.
      const template = generateParametricTemplate(topology.resolution);
      const templateU32 = new Uint32Array(template.buffer);
      for (let i = 0; i < templateU32.length; i++) {
        shapeBankWords[paramBlockOffset + i] = templateU32[i]!;
      }

      shapeWordOffsetBySlot.set(target, wordOffset);
      topologyIdByHandle[wordOffset] = (expr.topologyId as number) >>> 0;
      wordOffset += SHAPE_BANK_HEADER_WORDS + paramBlockWords;
    } else {
      // --- Type 1 Rigid path (existing behavior) ---
      // [RECOVER-04] Fan triangulation: the vertex shader generates triangle fans
      // from @builtin(vertex_index). For closed paths with N control points, the
      // fan produces (N-2) triangles × 3 vertices each. For open paths, vertices
      // are consumed sequentially (triangle list from CPs).
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

      // Map the materialize step's target slot to this word offset.
      shapeWordOffsetBySlot.set(target, wordOffset);

      // Record sidecar metadata (same contract as ShapeBankState sidecar).
      topologyIdByHandle[wordOffset] = (expr.topologyId as number) >>> 0;

      wordOffset += SHAPE_BANK_HEADER_WORDS;
    }
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
