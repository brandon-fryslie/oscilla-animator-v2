/**
 * Naga Module Lowering — Family A Compute Shader Generation
 *
 * Lowers the compiler's ScheduleIR + ValueExpr table into a structured NagaModule
 * via the NagaBuilder API. This replaces the deleted ScheduleNagaLowering (Family B).
 *
 * [LAW:one-source-of-truth] Buffer binding layout, address resolution, and bounds
 * clamping are encoded once here; the Rust Naga shim consumes the structured IR
 * without re-deriving any layout.
 *
 * [LAW:staged-with-explicit-io] Input: ScheduleIR + ValueExprs + arena layout.
 * Output: NagaLoweringProgramIR (module + sourceMap + coverage).
 */

import { NagaBuilder, ExprHandle, type BlockContext } from './NagaBuilder';
import {
  NagaScalarKind,
  type NagaHandle,
  type NagaModule,
} from './naga-types';
import type { NagaLoweringProgramIR } from '../program';
import type { ScheduleIR } from '../../backend/schedule-program';
import type { ValueExpr, ValueExprId } from '../value-expr';
import type {
  Step,
  OpCode,
  StateMapping,
} from '../types';
import type { ArenaSlotDescriptor, ArenaAddress } from '../../../runtime/ArenaValueStore';
import { resolveArenaAddress } from '../../../runtime/ArenaValueStore';
import type { ValueSlot } from '../Indices';
import { SCALAR_INSTANCE_ID } from '../Indices';
import type { RuntimeAddressTableIR, ArenaRuntimeLayoutIR } from '../program';
import { payloadStride, canonicalScalar, FLOAT } from '../../../core/canonical-types';

// =============================================================================
// Public API
// =============================================================================

export interface LowerToNagaInput {
  readonly schedule: ScheduleIR;
  readonly valueExprs: readonly ValueExpr[];
  readonly arenaLayout: readonly ArenaSlotDescriptor[];
  readonly arenaRuntimeLayout: ArenaRuntimeLayoutIR | undefined;
  readonly runtimeAddressTable: RuntimeAddressTableIR;
  readonly maxActiveLanes: number;
}

/**
 * Lower ScheduleIR + ValueExprs to a structured NagaModule via NagaBuilder.
 *
 * [LAW:single-enforcer] This is the single Naga lowering boundary.
 */
export function lowerToNagaModule(input: LowerToNagaInput): NagaLoweringProgramIR {
  const ctx = new LoweringContext(input);

  try {
    ctx.buildModule();
  } catch (e: unknown) {
    // Lowering failures produce coverage metadata, not hard crashes.
    // [LAW:no-silent-fallbacks] We still report what we dropped.
    const err = e instanceof Error ? e : new Error(String(e));
    return {
      module: null,
      sourceMap: {},
      compute: { maxActiveLanes: input.maxActiveLanes },
      coverage: {
        totalStepCount: input.schedule.steps.length,
        boundaryStepCount: 0,
        droppedComputeStepCount: input.schedule.steps.length,
      },
      loweringError: err.message,
    };
  }

  return {
    module: ctx.module,
    sourceMap: ctx.sourceMap,
    compute: { maxActiveLanes: input.maxActiveLanes },
    coverage: ctx.coverage,
  };
}

// =============================================================================
// Internal Constants
// =============================================================================

/** @group(0) @binding(0): read-only arena (input state) */
const BINDING_ARENA_IN = { group: 0, binding: 0 } as const;
/** @group(0) @binding(1): read-write arena (output state) */
const BINDING_ARENA_OUT = { group: 0, binding: 1 } as const;

const WORKGROUP_SIZE: readonly [number, number, number] = [64, 1, 1];

// Header offsets (in floats) matching WEBGPU_RENDER_CONTRACT
const HEADER_TIME_MS = 0;        // inputHeaderTimeOffsetBytes / 4
const HEADER_DELTA_TIME = 1;     // inputHeaderDeltaTimeOffsetBytes / 4
const HEADER_FRAME_COUNT = 2;    // inputHeaderFrameCountOffsetBytes / 4
const HEADER_RESOLUTION_X = 3;   // inputHeaderResolutionXOffsetBytes / 4
const HEADER_RESOLUTION_Y = 4;   // inputHeaderResolutionYOffsetBytes / 4
const HEADER_MOUSE_X = 5;        // inputHeaderMouseXOffsetBytes / 4
const HEADER_MOUSE_Y = 6;        // inputHeaderMouseYOffsetBytes / 4
const HEADER_MOUSE_BUTTONS = 7;  // inputHeaderMouseButtonsOffsetBytes / 4

const META: BlockContext = { visualBlockId: '__naga_lowering' };

// =============================================================================
// Lowering Context
// =============================================================================

class LoweringContext {
  public readonly builder = new NagaBuilder();
  public module: NagaModule | null = null;
  public readonly sourceMap: Record<string, { blockId: string | null; stepIndex: number; exprId?: number }> = {};
  public coverage: NagaLoweringProgramIR['coverage'] = null;

  // Type handles (created once)
  private f32Type!: NagaHandle;
  private u32Type!: NagaHandle;
  private boolType!: NagaHandle;
  private arenaArrayType!: NagaHandle;

  // Global variable handles
  private arenaInVar!: NagaHandle;
  private arenaOutVar!: NagaHandle;

  // Per-function expression refs (created after beginFunction, used for buffer access)
  private arenaInRef!: ExprHandle;
  private arenaOutRef!: ExprHandle;

  // Expression memoization (ValueExprId → per-component ExprHandles)
  private readonly exprCache = new Map<number, ExprHandle[]>();

  // Step tracking
  private loweredStepCount = 0;
  private droppedStepCount = 0;
  private boundaryStepCount = 0;

  public constructor(private readonly input: LowerToNagaInput) {}

  // =========================================================================
  // Module Construction
  // =========================================================================

  public buildModule(): void {
    // 1. Create shared types
    this.f32Type = this.builder.getOrCreateScalarType(NagaScalarKind.Float);
    this.u32Type = this.builder.getOrCreateScalarType(NagaScalarKind.Uint);
    this.boolType = this.builder.getOrCreateScalarType(NagaScalarKind.Bool);
    this.arenaArrayType = this.builder.getOrCreateArrayType(this.f32Type, 'dynamic');

    // 2. Declare buffer bindings
    this.arenaInVar = this.builder.declareGlobalVariable(
      'arena_in', 'storage', 'read',
      BINDING_ARENA_IN.group, BINDING_ARENA_IN.binding,
      this.arenaArrayType,
    );
    this.arenaOutVar = this.builder.declareGlobalVariable(
      'arena_out', 'storage', 'read_write',
      BINDING_ARENA_OUT.group, BINDING_ARENA_OUT.binding,
      this.arenaArrayType,
    );

    // 3. Build the main compute function
    const vec3u32 = this.builder.getOrCreateVectorType(3, NagaScalarKind.Uint);
    this.builder.beginFunction('main', [
      { name: 'global_id', type: vec3u32, builtin: 'global_invocation_id' },
    ], null);

    // [LAW:one-source-of-truth] Create per-function buffer references ONCE.
    // These are the only way to access global buffers within this function scope.
    this.arenaInRef = this.builder.globalVariableRef(this.arenaInVar, this.arenaArrayType, META);
    this.arenaOutRef = this.builder.globalVariableRef(this.arenaOutVar, this.arenaArrayType, META);

    const rootBlock = this.builder.buildBlock(() => {
      // Lane ID = global_id.x
      const globalId = this.builder.functionArgument(0, vec3u32, META);
      const laneId = this.builder.accessIndex(globalId, 0, this.u32Type, META);

      // Lane guard: if (laneId >= maxActiveLanes) { return; }
      const maxLanes = this.builder.literalUint(this.input.maxActiveLanes, META);
      const outOfBounds = this.builder.greaterEqual(laneId, maxLanes, META);
      const earlyReturnBlock = this.builder.buildBlock(() => {
        this.builder.returnStatement(undefined, META);
      });
      this.builder.ifStatement(outOfBounds, earlyReturnBlock, [], META);

      // Lower schedule steps
      this.lowerScheduleSteps(laneId);
    });

    // rootBlock is used implicitly by endFunction
    void rootBlock;
    this.builder.endFunction();

    // 4. Declare compute entry point
    this.builder.declareEntryPoint('compute', 'main', WORKGROUP_SIZE);

    // 5. Build final module
    this.module = this.builder.buildModule();

    // 6. Record coverage
    const totalSteps = this.input.schedule.steps.length;
    this.coverage = {
      totalStepCount: totalSteps,
      boundaryStepCount: this.boundaryStepCount,
      droppedComputeStepCount: this.droppedStepCount,
    };
  }

  // =========================================================================
  // Schedule Step Lowering
  // =========================================================================

  private lowerScheduleSteps(laneId: ExprHandle): void {
    const steps = this.input.schedule.steps as readonly Step[];
    for (let stepIdx = 0; stepIdx < steps.length; stepIdx++) {
      const step = steps[stepIdx];
      this.lowerStep(step, stepIdx, laneId);
    }
  }

  private lowerStep(step: Step, stepIdx: number, laneId: ExprHandle): void {
    switch (step.kind) {
      case 'materialize':
        this.lowerMaterialize(step, stepIdx, laneId);
        break;
      case 'stateWrite':
        this.lowerStateWrite(step, stepIdx, laneId);
        break;
      case 'fieldStateWrite':
        this.lowerFieldStateWrite(step, stepIdx, laneId);
        break;
      case 'eventDispatch':
        // Events are CPU-side; no GPU emission needed.
        this.boundaryStepCount++;
        break;
      case 'render':
        // Render steps are draw-prep; not part of compute lowering.
        this.boundaryStepCount++;
        break;
      case 'continuityMapBuild':
      case 'continuityApply':
        // Continuity is CPU-side for now.
        this.boundaryStepCount++;
        break;
      default: {
        const _exhaustive: never = step;
        void _exhaustive;
      }
    }
  }

  // =========================================================================
  // Materialize Step
  // =========================================================================

  private lowerMaterialize(
    step: Extract<Step, { kind: 'materialize' }>,
    stepIdx: number,
    laneId: ExprHandle,
  ): void {
    const descriptor = this.input.arenaLayout[step.target as number];
    if (!descriptor) {
      this.droppedStepCount++;
      return;
    }

    const components = this.evaluateExpr(step.field as number, laneId);
    if (components === null) {
      this.droppedStepCount++;
      return;
    }

    const address = resolveArenaAddress(descriptor);
    const isScalar = step.instanceId === SCALAR_INSTANCE_ID;

    // Write each component to the output arena
    for (let c = 0; c < components.length && c < descriptor.stride; c++) {
      const writeAddr = isScalar
        ? this.scalarWriteAddress(address, c)
        : this.fieldWriteAddress(address, laneId, c);

      this.arenaStore(this.arenaOutVar, writeAddr, components[c]);
    }

    this.loweredStepCount++;
    this.sourceMap[`materialize_${stepIdx}`] = {
      blockId: null,
      stepIndex: stepIdx,
    };
  }

  // =========================================================================
  // State Write Steps
  // =========================================================================

  private lowerStateWrite(
    step: Extract<Step, { kind: 'stateWrite' }>,
    stepIdx: number,
    laneId: ExprHandle,
  ): void {
    const stateLayout = this.input.arenaRuntimeLayout?.stateBank;
    if (!stateLayout) {
      this.droppedStepCount++;
      return;
    }

    const mapping = this.findStateMapping(step.stateSlot as number);
    if (!mapping) {
      this.droppedStepCount++;
      return;
    }

    const components = this.evaluateExpr(step.value as number, laneId);
    if (components === null) {
      this.droppedStepCount++;
      return;
    }

    // Write to state zone in output arena
    for (let c = 0; c < components.length && c < mapping.stride; c++) {
      const addr = this.builder.literalUint(
        stateLayout.writeOffset + mapping.slotStart + c,
        META,
      );
      this.arenaStore(this.arenaOutVar, addr, components[c]);
    }

    this.loweredStepCount++;
    this.sourceMap[`stateWrite_${stepIdx}`] = {
      blockId: null,
      stepIndex: stepIdx,
    };
  }

  private lowerFieldStateWrite(
    step: Extract<Step, { kind: 'fieldStateWrite' }>,
    stepIdx: number,
    laneId: ExprHandle,
  ): void {
    const stateLayout = this.input.arenaRuntimeLayout?.stateBank;
    if (!stateLayout) {
      this.droppedStepCount++;
      return;
    }

    const mapping = this.findStateMapping(step.stateSlot as number);
    if (!mapping) {
      this.droppedStepCount++;
      return;
    }

    const components = this.evaluateExpr(step.value as number, laneId);
    if (components === null) {
      this.droppedStepCount++;
      return;
    }

    // Per-lane state write: offset + slotStart + lane * stride + component
    for (let c = 0; c < components.length && c < mapping.stride; c++) {
      const baseOffset = this.builder.literalUint(
        stateLayout.writeOffset + mapping.slotStart + c,
        META,
      );
      const laneOffset = this.builder.mul(
        this.builder.castScalar(laneId, NagaScalarKind.Uint, false, META),
        this.builder.literalUint(mapping.stride, META),
        META,
      );
      const addr = this.builder.add(baseOffset, laneOffset, META);
      this.arenaStore(this.arenaOutVar, addr, components[c]);
    }

    this.loweredStepCount++;
    this.sourceMap[`fieldStateWrite_${stepIdx}`] = {
      blockId: null,
      stepIndex: stepIdx,
    };
  }

  // =========================================================================
  // Expression Evaluation (ValueExpr → ExprHandle[])
  // =========================================================================

  /**
   * Evaluate a ValueExpr into per-component ExprHandles.
   * Returns null if the expression cannot be lowered.
   * Results are memoized per ValueExprId.
   */
  private evaluateExpr(exprId: number, laneId: ExprHandle): ExprHandle[] | null {
    const cached = this.exprCache.get(exprId);
    if (cached !== undefined) return cached;

    const expr = this.input.valueExprs[exprId];
    if (!expr) return null;

    const result = this.evaluateExprInner(expr, exprId, laneId);
    if (result !== null) {
      this.exprCache.set(exprId, result);
    }
    return result;
  }

  private evaluateExprInner(
    expr: ValueExpr,
    exprId: number,
    laneId: ExprHandle,
  ): ExprHandle[] | null {
    switch (expr.kind) {
      case 'const':
        return this.lowerConst(expr);
      case 'time':
        return this.lowerTime(expr);
      case 'external':
        return this.lowerExternal(expr);
      case 'state':
        return this.lowerState(expr, laneId);
      case 'kernel':
        return this.lowerKernel(expr, laneId);
      case 'extract':
        return this.lowerExtract(expr, laneId);
      case 'construct':
        return this.lowerConstruct(expr, laneId);
      case 'intrinsic':
        return this.lowerIntrinsic(expr, laneId);
      case 'shapeRef':
      case 'eventRead':
      case 'event':
      case 'oklchToRgb':
        // Not yet lowered to GPU compute. These are CPU-boundary expressions.
        return null;
      default: {
        const _exhaustive: never = expr;
        void _exhaustive;
        return null;
      }
    }
  }

  // =========================================================================
  // Const
  // =========================================================================

  private lowerConst(expr: Extract<ValueExpr, { kind: 'const' }>): ExprHandle[] {
    const cv = expr.value;
    switch (cv.kind) {
      case 'float':
        return [this.builder.literalFloat(cv.value, META)];
      case 'int':
        return [this.builder.literalFloat(cv.value, META)]; // arena is f32
      case 'bool':
        return [this.builder.literalFloat(cv.value ? 1.0 : 0.0, META)];
      case 'vec2':
        return [
          this.builder.literalFloat(cv.value[0], META),
          this.builder.literalFloat(cv.value[1], META),
        ];
      case 'vec3':
        return [
          this.builder.literalFloat(cv.value[0], META),
          this.builder.literalFloat(cv.value[1], META),
          this.builder.literalFloat(cv.value[2], META),
        ];
      case 'vec4':
      case 'color':
        return [
          this.builder.literalFloat(cv.value[0], META),
          this.builder.literalFloat(cv.value[1], META),
          this.builder.literalFloat(cv.value[2], META),
          this.builder.literalFloat(cv.value[3], META),
        ];
      default:
        return null as never;
    }
  }

  // =========================================================================
  // Time
  // =========================================================================

  private lowerTime(expr: Extract<ValueExpr, { kind: 'time' }>): ExprHandle[] | null {
    const headerOffset = TIME_HEADER_OFFSETS[expr.which];
    if (headerOffset === undefined) return null;
    return [this.arenaLoad(this.arenaInVar, this.builder.literalUint(headerOffset, META))];
  }

  // =========================================================================
  // External (Mouse, etc.)
  // =========================================================================

  private lowerExternal(expr: Extract<ValueExpr, { kind: 'external' }>): ExprHandle[] | null {
    switch (expr.channel) {
      case 'mouseX':
        return [this.arenaLoad(this.arenaInVar, this.builder.literalUint(HEADER_MOUSE_X, META))];
      case 'mouseY':
        return [this.arenaLoad(this.arenaInVar, this.builder.literalUint(HEADER_MOUSE_Y, META))];
      case 'mouseXY':
        return [
          this.arenaLoad(this.arenaInVar, this.builder.literalUint(HEADER_MOUSE_X, META)),
          this.arenaLoad(this.arenaInVar, this.builder.literalUint(HEADER_MOUSE_Y, META)),
        ];
      case 'mouseButtons':
        return [this.arenaLoad(this.arenaInVar, this.builder.literalUint(HEADER_MOUSE_BUTTONS, META))];
      case 'resolutionX':
        return [this.arenaLoad(this.arenaInVar, this.builder.literalUint(HEADER_RESOLUTION_X, META))];
      case 'resolutionY':
        return [this.arenaLoad(this.arenaInVar, this.builder.literalUint(HEADER_RESOLUTION_Y, META))];
      default:
        // Unknown external channel; not lowerable.
        return null;
    }
  }

  // =========================================================================
  // State Read
  // =========================================================================

  private lowerState(
    expr: Extract<ValueExpr, { kind: 'state' }>,
    laneId: ExprHandle,
  ): ExprHandle[] | null {
    const stateLayout = this.input.arenaRuntimeLayout?.stateBank;
    if (!stateLayout) return null;

    const slot = expr.resolvedSlot;
    if (slot === undefined) return null;
    const mapping = this.findStateMapping(slot as number);
    if (!mapping) return null;

    const stride = payloadStride(expr.type.payload);
    const isField = mapping.laneCount > 1;
    const components: ExprHandle[] = [];

    for (let c = 0; c < stride; c++) {
      if (isField) {
        // Per-lane: readOffset + slotStart + lane * stride + component
        const baseAddr = this.builder.literalUint(
          stateLayout.readOffset + mapping.slotStart + c,
          META,
        );
        const laneOffset = this.builder.mul(
          this.builder.castScalar(laneId, NagaScalarKind.Uint, false, META),
          this.builder.literalUint(mapping.stride, META),
          META,
        );
        const addr = this.builder.add(baseAddr, laneOffset, META);
        components.push(this.arenaLoad(this.arenaInVar, addr));
      } else {
        // Scalar: readOffset + slotStart + component
        const addr = this.builder.literalUint(
          stateLayout.readOffset + mapping.slotStart + c,
          META,
        );
        components.push(this.arenaLoad(this.arenaInVar, addr));
      }
    }

    return components;
  }

  // =========================================================================
  // Kernel Operations
  // =========================================================================

  private lowerKernel(
    expr: Extract<ValueExpr, { kind: 'kernel' }>,
    laneId: ExprHandle,
  ): ExprHandle[] | null {
    switch (expr.kernelKind) {
      case 'map':
        return this.lowerMap(expr, laneId);
      case 'zip':
        return this.lowerZip(expr, laneId);
      case 'zipPromote':
        return this.lowerZipPromote(expr, laneId);
      case 'broadcast':
        return this.lowerBroadcast(expr, laneId);
      case 'reduce':
        // Reduce requires workgroup-level coordination; not lowered to simple compute.
        return null;
      case 'pathDerivative':
      case 'pathSample':
        // Path operations are CPU kernels.
        return null;
      default: {
        const _exhaustive: never = expr;
        void _exhaustive;
        return null;
      }
    }
  }

  private lowerMap(
    expr: Extract<ValueExpr, { kind: 'kernel'; kernelKind: 'map' }>,
    laneId: ExprHandle,
  ): ExprHandle[] | null {
    const inputComponents = this.evaluateExpr(expr.input as number, laneId);
    if (inputComponents === null) return null;

    return this.applyPureFnUnary(expr.fn, inputComponents);
  }

  private lowerZip(
    expr: Extract<ValueExpr, { kind: 'kernel'; kernelKind: 'zip' }>,
    laneId: ExprHandle,
  ): ExprHandle[] | null {
    if (expr.inputs.length < 2) return null;
    const aComponents = this.evaluateExpr(expr.inputs[0] as number, laneId);
    const bComponents = this.evaluateExpr(expr.inputs[1] as number, laneId);
    if (aComponents === null || bComponents === null) return null;

    // For 3-input ops (like clamp, lerp), get the third
    let cComponents: ExprHandle[] | null = null;
    if (expr.inputs.length >= 3) {
      cComponents = this.evaluateExpr(expr.inputs[2] as number, laneId);
    }

    return this.applyPureFnBinary(expr.fn, aComponents, bComponents, cComponents);
  }

  private lowerZipPromote(
    expr: Extract<ValueExpr, { kind: 'kernel'; kernelKind: 'zipPromote' }>,
    laneId: ExprHandle,
  ): ExprHandle[] | null {
    const fieldComponents = this.evaluateExpr(expr.field as number, laneId);
    if (fieldComponents === null) return null;
    if (expr.ones.length === 0) return null;

    const oneComponents = this.evaluateExpr(expr.ones[0] as number, laneId);
    if (oneComponents === null) return null;

    return this.applyPureFnBinary(expr.fn, fieldComponents, oneComponents, null);
  }

  private lowerBroadcast(
    expr: Extract<ValueExpr, { kind: 'kernel'; kernelKind: 'broadcast' }>,
    laneId: ExprHandle,
  ): ExprHandle[] | null {
    // Broadcast: one→many. In GPU, the scalar value is just read uniformly by all lanes.
    return this.evaluateExpr(expr.one as number, laneId);
  }

  // =========================================================================
  // Extract / Construct
  // =========================================================================

  private lowerExtract(
    expr: Extract<ValueExpr, { kind: 'extract' }>,
    laneId: ExprHandle,
  ): ExprHandle[] | null {
    const inputComponents = this.evaluateExpr(expr.input as number, laneId);
    if (inputComponents === null) return null;
    if (expr.componentIndex >= inputComponents.length) return null;
    return [inputComponents[expr.componentIndex]];
  }

  private lowerConstruct(
    expr: Extract<ValueExpr, { kind: 'construct' }>,
    laneId: ExprHandle,
  ): ExprHandle[] | null {
    const components: ExprHandle[] = [];
    for (const compId of expr.components) {
      const comp = this.evaluateExpr(compId as number, laneId);
      if (comp === null) return null;
      // Each component should be scalar
      components.push(comp[0]);
    }
    return components;
  }

  // =========================================================================
  // Intrinsic
  // =========================================================================

  private lowerIntrinsic(
    expr: Extract<ValueExpr, { kind: 'intrinsic' }>,
    laneId: ExprHandle,
  ): ExprHandle[] | null {
    if (expr.intrinsicKind === 'property') {
      switch (expr.intrinsic) {
        case 'index':
          // Lane index as float
          return [this.builder.castScalar(laneId, NagaScalarKind.Float, true, META)];
        case 'normalizedIndex': {
          // index / maxLanes
          const indexF = this.builder.castScalar(laneId, NagaScalarKind.Float, true, META);
          const maxF = this.builder.literalFloat(this.input.maxActiveLanes, META);
          return [this.builder.div(indexF, maxF, META)];
        }
        case 'randomId':
          // Hash of lane index — use a simple hash function
          // For now, approximate with fract(sin(lane * 12.9898) * 43758.5453)
          return [this.hashLaneId(laneId)];
        default:
          return null;
      }
    }
    // Placement intrinsics not yet lowered to GPU.
    return null;
  }

  private hashLaneId(laneId: ExprHandle): ExprHandle {
    const indexF = this.builder.castScalar(laneId, NagaScalarKind.Float, true, META);
    const k1 = this.builder.literalFloat(12.9898, META);
    const k2 = this.builder.literalFloat(43758.5453, META);
    const sinInput = this.builder.mul(indexF, k1, META);
    const sinVal = this.builder.sin(sinInput, META);
    const scaled = this.builder.mul(sinVal, k2, META);
    return this.builder.fract(scaled, META);
  }

  // =========================================================================
  // PureFn Application
  // =========================================================================

  private applyPureFnUnary(fn: ValueExpr extends never ? never : import('../types').PureFn, components: ExprHandle[]): ExprHandle[] | null {
    if (fn.kind !== 'opcode') return null;
    return this.applyOpcodeUnary(fn.opcode, components);
  }

  private applyPureFnBinary(
    fn: import('../types').PureFn,
    a: ExprHandle[],
    b: ExprHandle[],
    c: ExprHandle[] | null,
  ): ExprHandle[] | null {
    if (fn.kind !== 'opcode') return null;
    return this.applyOpcodeBinary(fn.opcode, a, b, c);
  }

  private applyOpcodeUnary(op: OpCode, a: ExprHandle[]): ExprHandle[] | null {
    const results: ExprHandle[] = [];
    for (const comp of a) {
      const result = this.applyScalarUnary(op, comp);
      if (result === null) return null;
      results.push(result);
    }
    return results;
  }

  private applyScalarUnary(op: OpCode, a: ExprHandle): ExprHandle | null {
    switch (op) {
      case 'neg' as OpCode:
        return this.builder.sub(this.builder.literalFloat(0, META), a, META);
      case 'abs' as OpCode:
        return this.builder.abs(a, META);
      case 'sin' as OpCode:
        return this.builder.sin(a, META);
      case 'cos' as OpCode:
        return this.builder.cos(a, META);
      case 'tan' as OpCode:
        return this.builder.tan(a, META);
      case 'floor' as OpCode:
        return this.builder.floor(a, META);
      case 'ceil' as OpCode:
        return this.builder.ceil(a, META);
      case 'round' as OpCode:
        return this.builder.round(a, META);
      case 'fract' as OpCode:
        return this.builder.fract(a, META);
      case 'sqrt' as OpCode:
        return this.builder.sqrt(a, META);
      case 'exp' as OpCode:
        return this.builder.exp(a, META);
      case 'log' as OpCode:
        return this.builder.log(a, META);
      case 'sign' as OpCode:
        return this.builder.sign(a, META);
      case 'identity' as OpCode:
        return a;
      case 'wrap01' as OpCode:
        return this.builder.fract(a, META);
      default:
        return null;
    }
  }

  private applyOpcodeBinary(
    op: OpCode,
    a: ExprHandle[],
    b: ExprHandle[],
    c: ExprHandle[] | null,
  ): ExprHandle[] | null {
    // Component-wise application
    const len = Math.min(a.length, b.length);
    const results: ExprHandle[] = [];
    for (let i = 0; i < len; i++) {
      const result = this.applyScalarBinary(
        op,
        a[i],
        b[i],
        c !== null && i < c.length ? c[i] : undefined,
      );
      if (result === null) return null;
      results.push(result);
    }
    return results;
  }

  private applyScalarBinary(
    op: OpCode,
    a: ExprHandle,
    b: ExprHandle,
    c?: ExprHandle,
  ): ExprHandle | null {
    switch (op) {
      case 'add' as OpCode:
        return this.builder.add(a, b, META);
      case 'sub' as OpCode:
        return this.builder.sub(a, b, META);
      case 'mul' as OpCode:
        return this.builder.mul(a, b, META);
      case 'div' as OpCode:
        return this.builder.div(a, b, META);
      case 'mod' as OpCode:
        return this.builder.modulo(a, b, META);
      case 'pow' as OpCode:
        return this.builder.pow(a, b, META);
      case 'min' as OpCode:
        return this.builder.min(a, b, META);
      case 'max' as OpCode:
        return this.builder.max(a, b, META);
      case 'atan2' as OpCode:
        return this.builder.atan2(a, b, META);
      case 'lerp' as OpCode:
        if (c === undefined) return null;
        return this.builder.lerp(a, b, c, META);
      case 'clamp' as OpCode:
        if (c === undefined) return null;
        return this.builder.clamp(a, b, c, META);
      case 'eq' as OpCode: {
        const boolResult = this.builder.equal(a, b, META);
        return this.builder.select(boolResult, this.builder.literalFloat(1, META), this.builder.literalFloat(0, META), META);
      }
      case 'lt' as OpCode: {
        const boolResult = this.builder.less(a, b, META);
        return this.builder.select(boolResult, this.builder.literalFloat(1, META), this.builder.literalFloat(0, META), META);
      }
      case 'gt' as OpCode: {
        const boolResult = this.builder.greater(a, b, META);
        return this.builder.select(boolResult, this.builder.literalFloat(1, META), this.builder.literalFloat(0, META), META);
      }
      case 'select' as OpCode: {
        if (c === undefined) return null;
        // select(condition, trueVal, falseVal): a=condition, b=trueVal, c=falseVal
        // Convert float condition to bool (nonzero = true)
        const zero = this.builder.literalFloat(0, META);
        const condBool = this.builder.notEqual(a, zero, META);
        return this.builder.select(condBool, b, c, META);
      }
      default:
        return null;
    }
  }

  // =========================================================================
  // Arena Addressing Helpers
  // =========================================================================

  /**
   * Compute scalar write address: offset + component
   */
  private scalarWriteAddress(address: ArenaAddress, component: number): ExprHandle {
    return this.builder.literalUint(address.baseOffset + component * address.componentStride, META);
  }

  /**
   * Compute field write address: offset + component * componentStride + lane * laneStride
   * [LAW:single-enforcer] Bounds clamping is applied at the load boundary, not writes.
   */
  private fieldWriteAddress(address: ArenaAddress, laneId: ExprHandle, component: number): ExprHandle {
    const base = this.builder.literalUint(
      address.baseOffset + component * address.componentStride,
      META,
    );
    const laneOffset = this.builder.mul(
      laneId,
      this.builder.literalUint(address.laneStride, META),
      META,
    );
    return this.builder.add(base, laneOffset, META);
  }

  /**
   * Read from arena buffer with bounds clamping.
   * [LAW:single-enforcer] Every dynamic buffer read injects arrayLength + min clamping.
   */
  private arenaLoad(bufferVar: NagaHandle, index: ExprHandle): ExprHandle {
    // Bounds clamp: min(index, arrayLength(buffer) - 1)
    const bufRef = this.builder.unsafeAppendExpressionForTesting(
      { type: 'GlobalVariable', variable: bufferVar },
      META,
      this.arenaArrayType,
    );
    const bufRefHandle = new ExprHandle(bufRef);
    const len = this.builder.arrayLength(
      // arrayLength needs a buffer key; we use the variable handle as key
      String(bufferVar),
      META,
    );
    const one = this.builder.literalUint(1, META);
    const maxIdx = this.builder.sub(len, one, META);
    const clampedIdx = this.builder.min(index, maxIdx, META);

    // Access + Load
    // [LAW:one-source-of-truth] Arena elements are always f32 scalars.
    return this.builder.bufferRead(
      String(bufferVar),
      clampedIdx,
      canonicalScalar(FLOAT),
      META,
    );
  }

  /**
   * Write to arena buffer.
   */
  private arenaStore(bufferVar: NagaHandle, index: ExprHandle, value: ExprHandle): void {
    this.builder.bufferWrite(String(bufferVar), index, value, META);
  }

  // =========================================================================
  // State Helpers
  // =========================================================================

  private findStateMapping(slotId: number): StateMapping | undefined {
    for (const mapping of this.input.schedule.stateMappings) {
      if (mapping.slotStart <= slotId && slotId < mapping.slotStart + mapping.laneCount * mapping.stride) {
        return mapping;
      }
    }
    return undefined;
  }
}

// =============================================================================
// Time Header Lookup
// =============================================================================

const TIME_HEADER_OFFSETS: Record<string, number | undefined> = {
  tMs: HEADER_TIME_MS,
  dt: HEADER_DELTA_TIME,
  // Phase A/B: derived from time, not direct header reads.
  // These would need to be computed from tMs.
  phaseA: undefined,
  phaseB: undefined,
  progress: undefined,
  palette: undefined,
  energy: undefined,
};
