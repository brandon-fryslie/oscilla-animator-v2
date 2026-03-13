/**
 * GPU-Autonomous Draw Prep Compute Kernel
 *
 * Static, immutable compute shader that translates simulation metadata into
 * hardware-valid indirect draw commands. CPU NEVER writes draw counts.
 *
 * [LAW:one-source-of-truth] Canonical kernel contract from
 * docs/WebGPU-Complete/P3-3_GPU_Draw_Prep__Autonomous_Rendering_Logistics.md §3
 *
 * [LAW:dataflow-not-control-flow] Both indexed and non-indexed paths execute
 * unconditionally; the drawMode value selects which region receives writes.
 */

import {
  NagaBuilder,
  ExprHandle,
  type BlockContext,
  NagaScalarKind,
  type NagaModule,
} from '../../compiler/ir/naga-emitter';

// =============================================================================
// Constants
// =============================================================================

const META: BlockContext = { visualBlockId: '__draw_prep' };

// =============================================================================
// Public API
// =============================================================================

/**
 * Build the draw-prep compute kernel as a NagaModule.
 *
 * This kernel is static and immutable — it does NOT vary per patch.
 * The compiler emits metadata records; the runtime dispatches one invocation
 * per record via `dispatchWorkgroups(1)`.
 */
export function buildDrawPrepModule(): NagaModule {
  const b = new NagaBuilder();

  // ── Types ──────────────────────────────────────────────────────────────────
  const u32Type = b.getOrCreateScalarType(NagaScalarKind.Uint);
  const vec3u32 = b.getOrCreateVectorType(3, NagaScalarKind.Uint);
  const vec4u32 = b.getOrCreateVectorType(4, NagaScalarKind.Uint);
  const arrayU32 = b.getOrCreateArrayType(u32Type, 'dynamic');
  const paramsStruct = b.getOrCreateStructType('DrawPrepParams', [
    { name: 'v0', type: vec4u32 },
    { name: 'v1', type: vec4u32 },
    { name: 'v2', type: vec4u32 },
  ]);

  // ── Global Variables ───────────────────────────────────────────────────────
  // Binding layout per P3-3 §3:
  //   @group(0) @binding(0) var<storage, read_write> indirectWords: array<u32>;
  //   @group(0) @binding(1) var<uniform> drawPrepParams: DrawPrepParams;
  const indirectWordsVar = b.declareGlobalVariable(
    'indirectWords', 'storage', 'read_write', 0, 0, arrayU32,
  );
  const paramsVarHandle = b.declareGlobalVariable(
    'drawPrepParams', 'uniform', 'read', 0, 1, paramsStruct,
  );

  // ── Compute Function ──────────────────────────────────────────────────────
  b.beginFunction('cs_main', [
    { name: 'gid', type: vec3u32, builtin: 'global_invocation_id' },
  ], null);

  b.buildBlock(() => {
    const indirectWordsRef = b.globalVariableRef(indirectWordsVar, arrayU32, META);
    const paramsRef = b.globalVariableRef(paramsVarHandle, paramsStruct, META);

    // ── Lane guard ─────────────────────────────────────────────────────────
    // workgroup_size(1) → only gid.x == 0 is valid
    const gid = b.functionArgument(0, vec3u32, META);
    const gidX = b.accessIndex(gid, 0, u32Type, META);
    const zero = b.literalUint(0, META);
    const isNotFirst = b.greater(gidX, zero, META);
    b.ifStatement(isNotFirst, b.buildBlock(() => {
      b.returnStatement(undefined, META);
    }), [], META);

    // ── Load uniform struct ────────────────────────────────────────────────
    const paramsExpr = b.load(paramsRef, paramsStruct, META);

    // v0 = [drawMode, countOrIndexCount, firstOrFirstIndex, baseVertexBits]
    const v0 = b.accessIndex(paramsExpr, 0, vec4u32, META);
    const drawMode        = b.accessIndex(v0, 0, u32Type, META);
    const countOrIdxCount = b.accessIndex(v0, 1, u32Type, META);
    const firstOrFirstIdx = b.accessIndex(v0, 2, u32Type, META);
    const baseVertexBits  = b.accessIndex(v0, 3, u32Type, META);

    // v1 = [instanceCount, firstInstance, recordIndex, maxRecords]
    const v1 = b.accessIndex(paramsExpr, 1, vec4u32, META);
    const instanceCount = b.accessIndex(v1, 0, u32Type, META);
    const firstInstance = b.accessIndex(v1, 1, u32Type, META);
    const recordIndex   = b.accessIndex(v1, 2, u32Type, META);
    const maxRecords    = b.accessIndex(v1, 3, u32Type, META);

    // v2 = [indexedRegionBaseWords, nonIndexedRegionBaseWords,
    //       indexedStrideWords, nonIndexedStrideWords]
    const v2 = b.accessIndex(paramsExpr, 2, vec4u32, META);
    const idxRegionBase   = b.accessIndex(v2, 0, u32Type, META);
    const nonIdxRegionBase = b.accessIndex(v2, 1, u32Type, META);
    const idxStride       = b.accessIndex(v2, 2, u32Type, META);
    const nonIdxStride    = b.accessIndex(v2, 3, u32Type, META);

    // ── Bounds guard ───────────────────────────────────────────────────────
    const outOfBounds = b.greaterEqual(recordIndex, maxRecords, META);
    b.ifStatement(outOfBounds, b.buildBlock(() => {
      b.returnStatement(undefined, META);
    }), [], META);

    // ── Emit indirect draw command ─────────────────────────────────────────
    const isIndexed = b.equal(drawMode, zero, META);

    // Indexed path: DrawIndexedIndirectArgs (5 words)
    // [indexCount, instanceCount, firstIndex, baseVertex, firstInstance]
    const indexedBlock = b.buildBlock(() => {
      const offset = b.mul(recordIndex, idxStride, META);
      const base = b.add(idxRegionBase, offset, META);
      emitStoreWord(b, indirectWordsRef, base, 0, countOrIdxCount);
      emitStoreWord(b, indirectWordsRef, base, 1, instanceCount);
      emitStoreWord(b, indirectWordsRef, base, 2, firstOrFirstIdx);
      emitStoreWord(b, indirectWordsRef, base, 3, baseVertexBits);
      emitStoreWord(b, indirectWordsRef, base, 4, firstInstance);
    });

    // Non-indexed path: DrawIndirectArgs (4 words)
    // [vertexCount, instanceCount, firstVertex, firstInstance]
    const nonIndexedBlock = b.buildBlock(() => {
      const offset = b.mul(recordIndex, nonIdxStride, META);
      const base = b.add(nonIdxRegionBase, offset, META);
      emitStoreWord(b, indirectWordsRef, base, 0, countOrIdxCount);
      emitStoreWord(b, indirectWordsRef, base, 1, instanceCount);
      emitStoreWord(b, indirectWordsRef, base, 2, firstOrFirstIdx);
      emitStoreWord(b, indirectWordsRef, base, 3, firstInstance);
    });

    b.ifStatement(isIndexed, indexedBlock, nonIndexedBlock, META);
  });

  b.endFunction();

  // @compute @workgroup_size(1, 1, 1) — one invocation per record
  b.declareEntryPoint('compute', 'cs_main', [1, 1, 1]);

  return b.buildModule();
}

// =============================================================================
// Helpers — Indirect buffer writes
// =============================================================================

/**
 * Write a u32 value to the indirect buffer at `base + wordOffset`.
 */
function emitStoreWord(
  b: NagaBuilder,
  indirectWordsRef: ExprHandle,
  base: ExprHandle,
  wordOffset: number,
  value: ExprHandle,
): void {
  const index = wordOffset === 0
    ? base
    : b.add(base, b.literalUint(wordOffset, META), META);
  b.storeAt(indirectWordsRef, index, value, META);
}
