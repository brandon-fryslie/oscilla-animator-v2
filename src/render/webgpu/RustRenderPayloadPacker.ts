import type { DrawPathInstancesOp, PathStyle, RenderFrameIR } from '../types';
import type { RenderShapeBankSource } from './WebGPUShapeBankManager';
import { PathTessellator, type TessellatedPathMesh } from './PathTessellator';

const SHAPE_BANK_HEADER_WORDS = 4;
export const RUST_RENDER_INSTANCE_FLOATS = 12;
const INSTANCE_FLOATS = RUST_RENDER_INSTANCE_FLOATS;
const INDIRECT_ARGS_WORDS = 5;
const MAX_UINT32 = 0xFFFF_FFFF;

export interface DrawPrepSinkDescriptor {
  readonly sinkIndex: number;
  readonly indirectRecordIndex: number;
  readonly instanceCountMode: 'static' | 'dynamic';
  readonly staticInstanceCount?: number;
}

export interface RustRenderPayload {
  readonly topologyWords: Uint32Array;
  readonly instanceFloats: Float32Array;
  readonly indirectArgsWords: Uint32Array;
  readonly vertexFloats: Float32Array;
  readonly indexWords: Uint32Array;
  readonly drawRecordCount: number;
}

interface PackedMesh {
  readonly cacheKey: string;
  readonly baseVertex: number;
  readonly firstIndex: number;
  readonly indexCount: number;
}

interface PreparedDrawPathOp {
  readonly op: DrawPathInstancesOp;
  readonly mesh: PackedMesh;
  readonly shapeBankWordOffset: number;
  readonly sourceSinkIndex: number;
  readonly firstInstance: number;
  readonly instanceCount: number;
  readonly pass: 'fill' | 'stroke';
}

function buildDrawPrepStaticCountLookup(
  sinks: readonly DrawPrepSinkDescriptor[] | undefined,
): ReadonlyMap<number, number> {
  const staticCounts = new Map<number, number>();
  if (!sinks) return staticCounts;

  for (const sink of sinks) {
    if (sink.instanceCountMode !== 'static') continue;

    const staticCount = sink.staticInstanceCount;
    if (
      typeof staticCount !== 'number'
      || !Number.isFinite(staticCount)
      || !Number.isInteger(staticCount)
      || !Number.isSafeInteger(staticCount)
      || staticCount < 0
      || staticCount > MAX_UINT32
    ) {
      throw new Error(
        `RustRenderPayloadPacker: static draw-prep sink at sinkIndex ${sink.sinkIndex} (indirectRecordIndex=${sink.indirectRecordIndex}) missing valid staticInstanceCount`,
      );
    }

    if (staticCounts.has(sink.sinkIndex)) {
      throw new Error(
        `RustRenderPayloadPacker: duplicate static draw-prep sinkIndex ${sink.sinkIndex} (indirectRecordIndex=${sink.indirectRecordIndex})`,
      );
    }

    staticCounts.set(sink.sinkIndex, staticCount);
  }

  return staticCounts;
}

function assertShapeBankContract(shapeBank: RenderShapeBankSource): void {
  if (!(shapeBank.data instanceof Uint32Array)) {
    throw new Error('RustRenderPayloadPacker: shapeBank.data must be Uint32Array');
  }
  if (!(shapeBank.topologyIdByHandle instanceof Uint32Array)) {
    throw new Error('RustRenderPayloadPacker: shapeBank.topologyIdByHandle must be Uint32Array');
  }
  if (!Number.isInteger(shapeBank.volatilePtr) || shapeBank.volatilePtr < 0 || shapeBank.volatilePtr > shapeBank.data.length) {
    throw new Error(
      `RustRenderPayloadPacker: invalid shapeBank.volatilePtr ${shapeBank.volatilePtr} for capacity ${shapeBank.data.length}`,
    );
  }
  if (shapeBank.topologyIdByHandle.length < shapeBank.volatilePtr) {
    throw new Error(
      `RustRenderPayloadPacker: topologyIdByHandle length ${shapeBank.topologyIdByHandle.length} is smaller than volatilePtr ${shapeBank.volatilePtr}`,
    );
  }
  if (!Number.isInteger(shapeBank.staticBoundary) || shapeBank.staticBoundary < 0 || shapeBank.staticBoundary > shapeBank.volatilePtr) {
    throw new Error(
      `RustRenderPayloadPacker: invalid shapeBank.staticBoundary ${shapeBank.staticBoundary} for volatilePtr ${shapeBank.volatilePtr}`,
    );
  }
  if ((shapeBank.volatilePtr % SHAPE_BANK_HEADER_WORDS) !== 0) {
    throw new Error(
      `RustRenderPayloadPacker: shapeBank volatilePtr ${shapeBank.volatilePtr} is not aligned to ${SHAPE_BANK_HEADER_WORDS} words`,
    );
  }
}

function buildTopologyWordOffsetMap(shapeBank: RenderShapeBankSource): Map<number, number> {
  const byTopologyId = new Map<number, number>();
  for (let handle = 0; handle + SHAPE_BANK_HEADER_WORDS <= shapeBank.volatilePtr; handle += SHAPE_BANK_HEADER_WORDS) {
    const topologyId = shapeBank.topologyIdByHandle[handle] >>> 0;
    const hasHeaderPayload =
      shapeBank.data[handle + 0] !== 0 ||
      shapeBank.data[handle + 1] !== 0 ||
      shapeBank.data[handle + 2] !== 0 ||
      shapeBank.data[handle + 3] !== 0;
    if (!hasHeaderPayload && topologyId === 0) {
      continue;
    }
    if (!byTopologyId.has(topologyId)) {
      // [LAW:one-source-of-truth] Topology-to-word-offset resolution is derived
      // from one canonical runtime ShapeBank stream.
      byTopologyId.set(topologyId, handle);
    }
  }
  return byTopologyId;
}

function computePackedMesh(
  mesh: TessellatedPathMesh,
  vertices: number[],
  indices: number[],
): PackedMesh {
  const firstVertexFloat = vertices.length;
  for (let i = 0; i < mesh.vertexData.length; i++) {
    vertices.push(mesh.vertexData[i]);
  }

  const baseVertex = firstVertexFloat / 2;
  const firstIndex = indices.length;
  for (let i = 0; i < mesh.indexData.length; i++) {
    indices.push(baseVertex + mesh.indexData[i]);
  }

  return {
    cacheKey: mesh.cacheKey,
    baseVertex,
    firstIndex,
    indexCount: mesh.indexData.length,
  };
}

function resolveActiveColor(style: PathStyle, pass: 'fill' | 'stroke'): Uint8ClampedArray {
  const activeColor = pass === 'stroke' ? style.strokeColor : style.fillColor;
  if (!activeColor || !(activeColor instanceof Uint8ClampedArray) || activeColor.length === 0) {
    throw new Error(`RustRenderPayloadPacker: ${pass}Color must be provided as Uint8ClampedArray`);
  }
  return activeColor;
}

function writePassInstances(
  target: Float32Array,
  prepared: PreparedDrawPathOp,
): void {
  const { op, firstInstance, instanceCount, shapeBankWordOffset, pass } = prepared;
  const { position, size, rotation, scale2 } = op.instances;
  const activeColor = resolveActiveColor(op.style, pass);

  if (!(position instanceof Float32Array) || position.length !== instanceCount * 2) {
    throw new Error(`RustRenderPayloadPacker: position must be Float32Array(count*2), got ${position.length}`);
  }
  if (!(rotation instanceof Float32Array) || rotation.length !== instanceCount) {
    throw new Error(`RustRenderPayloadPacker: rotation must be Float32Array(count), got ${rotation.length}`);
  }
  if (!(scale2 instanceof Float32Array) || scale2.length !== instanceCount * 2) {
    throw new Error(`RustRenderPayloadPacker: scale2 must be Float32Array(count*2), got ${scale2.length}`);
  }

  const isUniformSize = typeof size === 'number';
  if (!isUniformSize && (!(size instanceof Float32Array) || size.length !== instanceCount)) {
    throw new Error('RustRenderPayloadPacker: size must be number or Float32Array(count)');
  }

  const isUniformColor = activeColor.length === 4;
  if (!isUniformColor && activeColor.length !== instanceCount * 4) {
    throw new Error(`RustRenderPayloadPacker: ${pass}Color must be length 4 or count*4`);
  }

  const hasStroke = Boolean(op.style.strokeColor && op.style.strokeColor.length > 0);
  let strokeWidthSource: number | Float32Array = 0;
  if (hasStroke) {
    strokeWidthSource = op.style.strokeWidth ?? 0.01;
    if (typeof strokeWidthSource !== 'number' && (!(strokeWidthSource instanceof Float32Array) || strokeWidthSource.length !== instanceCount)) {
      throw new Error('RustRenderPayloadPacker: strokeWidth must be number or Float32Array(count)');
    }
  }

  for (let i = 0; i < instanceCount; i++) {
    const base = (firstInstance + i) * INSTANCE_FLOATS;
    const posX = position[i * 2];
    const posY = position[i * 2 + 1];
    const rotationValue = rotation[i];
    const scaleX = scale2[i * 2];
    const scaleY = scale2[i * 2 + 1];
    if (!Number.isFinite(posX) || !Number.isFinite(posY) || !Number.isFinite(rotationValue) || !Number.isFinite(scaleX) || !Number.isFinite(scaleY)) {
      throw new Error(`RustRenderPayloadPacker: instance ${firstInstance + i} has non-finite transform values`);
    }

    const sizeBase = isUniformSize ? (size as number) : (size as Float32Array)[i];
    if (!Number.isFinite(sizeBase)) {
      throw new Error(`RustRenderPayloadPacker: instance ${firstInstance + i} size must be finite`);
    }

    const strokeWidth = hasStroke
      ? (typeof strokeWidthSource === 'number'
        ? strokeWidthSource
        : (strokeWidthSource as Float32Array)[i] ?? 0)
      : 0;
    if (!Number.isFinite(strokeWidth)) {
      throw new Error(`RustRenderPayloadPacker: instance ${firstInstance + i} strokeWidth must be finite`);
    }
    const strokeHalf = Math.max(0, strokeWidth) * 0.5;
    const sizeValue = pass === 'stroke'
      ? sizeBase + strokeHalf
      : hasStroke
        ? Math.max(0, sizeBase - strokeHalf)
        : sizeBase;

    target[base] = posX;
    target[base + 1] = posY;
    target[base + 2] = sizeValue;
    target[base + 3] = rotationValue;
    target[base + 4] = scaleX;
    target[base + 5] = scaleY;
    target[base + 6] = shapeBankWordOffset;
    target[base + 7] = 0;

    const colorOffset = isUniformColor ? 0 : i * 4;
    target[base + 8] = activeColor[colorOffset] / 255;
    target[base + 9] = activeColor[colorOffset + 1] / 255;
    target[base + 10] = activeColor[colorOffset + 2] / 255;
    target[base + 11] = activeColor[colorOffset + 3] / 255;
  }
}

/**
 * Canonical renderer payload builder for the Rust worker path.
 *
 * [LAW:single-enforcer] Draw-plan expansion, mesh packing, instance payload
 * packing, and indirect-args emission are enforced by one boundary.
 */
export class RustRenderPayloadPacker {
  private readonly tessellator = new PathTessellator();

  pack(
    frame: RenderFrameIR,
    shapeBank: RenderShapeBankSource,
    drawPrepSinks?: readonly DrawPrepSinkDescriptor[],
  ): RustRenderPayload {
    assertShapeBankContract(shapeBank);
    const topologyWordOffsetById = buildTopologyWordOffsetMap(shapeBank);

    const vertices: number[] = [];
    const indices: number[] = [];
    const meshByCacheKey = new Map<string, PackedMesh>();
    const prepared: PreparedDrawPathOp[] = [];

    let nextFirstInstance = 0;
    let nextSourceSinkIndex = 0;

    for (const op of frame.ops) {
      if (op.kind !== 'drawPathInstances') {
        throw new Error(`RustRenderPayloadPacker: unsupported draw op kind "${(op as { kind: string }).kind}"`);
      }
      const sourceSinkIndex = nextSourceSinkIndex++;
      const mesh = this.tessellator.getOrCreateMesh(op.geometry);
      if (mesh.indexData.length === 0 || op.instances.count <= 0) {
        continue;
      }

      const shapeBankWordOffset = topologyWordOffsetById.get(op.geometry.topologyId);
      if (shapeBankWordOffset === undefined) {
        throw new Error(`RustRenderPayloadPacker: topology ${op.geometry.topologyId} missing from shape bank`);
      }

      const hasFill = Boolean(op.style.fillColor && op.style.fillColor.length > 0);
      const hasStroke = Boolean(op.style.strokeColor && op.style.strokeColor.length > 0);
      if (!hasFill && !hasStroke) {
        throw new Error('RustRenderPayloadPacker: drawPathInstances op must provide fillColor and/or strokeColor');
      }

      const packedMesh = (() => {
        const cached = meshByCacheKey.get(mesh.cacheKey);
        if (cached) return cached;
        const nextMesh = computePackedMesh(mesh, vertices, indices);
        meshByCacheKey.set(mesh.cacheKey, nextMesh);
        return nextMesh;
      })();

      if (hasFill) {
        prepared.push({
          op,
          mesh: packedMesh,
          shapeBankWordOffset,
          sourceSinkIndex,
          firstInstance: nextFirstInstance,
          instanceCount: op.instances.count,
          pass: 'fill',
        });
        nextFirstInstance += op.instances.count;
      }

      if (hasStroke) {
        prepared.push({
          op,
          mesh: packedMesh,
          shapeBankWordOffset,
          sourceSinkIndex,
          firstInstance: nextFirstInstance,
          instanceCount: op.instances.count,
          pass: 'stroke',
        });
        nextFirstInstance += op.instances.count;
      }
    }

    const instanceFloats = new Float32Array(nextFirstInstance * INSTANCE_FLOATS);
    for (const op of prepared) {
      writePassInstances(instanceFloats, op);
    }

    const staticCounts = buildDrawPrepStaticCountLookup(drawPrepSinks);
    const indirectArgsWords = new Uint32Array(prepared.length * INDIRECT_ARGS_WORDS);
    for (let i = 0; i < prepared.length; i++) {
      const op = prepared[i];
      const resolvedInstanceCount = staticCounts.get(op.sourceSinkIndex) ?? op.instanceCount;
      if (resolvedInstanceCount > op.instanceCount) {
        throw new Error(
          `RustRenderPayloadPacker: static draw-prep sink count ${resolvedInstanceCount} exceeds packed instance count ${op.instanceCount} at sinkIndex ${op.sourceSinkIndex}`,
        );
      }

      const base = i * INDIRECT_ARGS_WORDS;
      indirectArgsWords[base + 0] = op.mesh.indexCount >>> 0;
      indirectArgsWords[base + 1] = resolvedInstanceCount >>> 0;
      indirectArgsWords[base + 2] = op.mesh.firstIndex >>> 0;
      indirectArgsWords[base + 3] = op.mesh.baseVertex >>> 0;
      indirectArgsWords[base + 4] = op.firstInstance >>> 0;
    }

    return {
      topologyWords: shapeBank.data.slice(0, shapeBank.volatilePtr),
      instanceFloats,
      indirectArgsWords,
      vertexFloats: new Float32Array(vertices),
      indexWords: new Uint32Array(indices),
      drawRecordCount: prepared.length,
    };
  }
}
