Your agent correctly identified the out-of-bounds bug and applied the right concept for *reads*, but their solution for *writes* introduces a catastrophic performance bottleneck and data race.

    Here is the breakdown of why their approach is flawed, followed by the correct, spec-aligned implementation.

### The Verdict

**1. The Good: Read Clamping (Broadcasts)**
The agent's logic to clamp source lanes using `min(global_lane, laneCount - 1)` is exactly right for **reads**. If a node has an output of 1 lane (a constant/signal), and a downstream node requests 50,000 lanes, clamping the read index to `0` allows all 50,000 threads to safely broadcast that single value without branching.

**2. The Bad: The "Clamping Write-Storm"**
The agent applied this exact same clamping logic to **writes**.
If your max active lanes (the global workgroup size) is 50,000, but a specific step's target slot only has a `laneCount` of 10, the agent's code clamps the target index to `9`.
    This means threads 10 through 49,999 will *all* redundantly evaluate the math tree, and then 49,990 threads will simultaneously attempt to write to index `9`.

    While WebGPU's memory model technically prevents undefined behavior here, executing 49,990 redundant writes to the exact same memory address destroys L2 cache coherency, saturates memory bandwidth, and wastes thousands of ALU cycles.

### The Optimal Solution: Execution Masking

In GPU compute architecture, you do not prevent out-of-bounds writes by clamping the address; you prevent them by **masking the execution thread**.

Instead of clamping the `targetLaneExpr`, we must wrap the execution of each step in a targeted guard: `if (global_lane < targetPlan.laneCount) { ... }`.

* Threads within the target's domain perform the math and write.
* Threads outside the target's domain immediately skip the step, saving ALU cycles and perfectly preserving memory bandwidth.

### The Corrected Code

I have removed the over-engineered `resolveLaneExprForPlan` target clamping and replaced it with a `withTargetLaneGuard` helper. This cleanly masks execution based on the target slot's exact requirements, while preserving the agent's correct read-clamping for broadcasts.

                                                                                                                                                                                                                                                                        ```typescript
import type { BlockId } from '../../../types/compiler';
import type { ScheduleIR } from '../../backend/schedule-program';
import type { RuntimeAddressTableIR } from '../program';
import type { ValueExpr } from '../value-expr';
import type { ValueExprId, ValueSlot } from '../Indices';
import { payloadStride } from '../../../core/canonical-types';
import { OpCode } from '../types';
import type {
  Step,
  StepContinuityApply,
  StepFieldStateWrite,
  StepMaterialize,
  PureFn,
  StepStateWrite,
} from '../types';

export type NagaScalarKindIR = 'f32' | 'u32' | 'bool';

export type NagaTypeIR =
  | {
      readonly kind: 'scalar';
      readonly scalar: NagaScalarKindIR;
      readonly width: 4;
    }
  | {
      readonly kind: 'vector';
      readonly size: 2 | 3 | 4;
      readonly scalar: NagaScalarKindIR;
      readonly width: 4;
    }
  | {
      readonly kind: 'array';
      readonly base: number;
      readonly size: 'dynamic' | number;
    }
  | {
      readonly kind: 'struct';
      readonly name: string;
      readonly fields: readonly { readonly name: string; readonly type: number }[];
    };

export interface NagaConstantIR {
  readonly type: number;
  readonly value: number;
}

export interface NagaGlobalVariableIR {
  readonly name: 'arena_in' | 'arena_out' | 'state_in' | 'state_out' | 'uniforms';
  readonly storageClass: 'storage' | 'uniform';
  readonly access: 'read' | 'read_write';
  readonly binding: {
    readonly group: number;
    readonly binding: number;
  };
  readonly type: number;
}

export interface NagaFunctionArgumentIR {
  readonly name: string;
  readonly type: number;
  readonly builtin?: 'global_invocation_id';
}

type NagaBuiltinCallNameIR =
  | 'abs' | 'atan2' | 'ceil' | 'clamp' | 'cos' | 'exp' | 'f32' | 'floor' | 'fract'
  | 'log' | 'max' | 'min' | 'pow' | 'round' | 'select' | 'sign' | 'sin' | 'sqrt'
  | 'tan' | 'trunc';

export type NagaExpressionIR =
  | { readonly kind: 'argument'; readonly argument: number }
  | { readonly kind: 'constant'; readonly constant: number }
  | { readonly kind: 'access_index'; readonly base: number; readonly index: number }
  | {
      readonly kind: 'binary';
      readonly op: 'add' | 'sub' | 'mul' | 'div' | 'mod' | 'lt' | 'le' | 'gt' | 'ge' | 'eq' | 'ne';
      readonly left: number;
      readonly right: number;
    }
  | {
      readonly kind: 'buffer_load';
      readonly buffer: 'arena_in' | 'arena_out' | 'state_in' | 'state_out' | 'uniforms';
      readonly index: number;
    }
  | {
      readonly kind: 'as';
      readonly to: NagaScalarKindIR;
      readonly expr: number;
    }
  | {
      readonly kind: 'call';
      readonly function: NagaBuiltinCallNameIR;
      readonly args: readonly number[];
    };

export type NagaBlockIR = readonly number[];

export type NagaStatementIR =
  | {
      readonly kind: 'store';
      readonly buffer: 'arena_out' | 'state_out';
      readonly index: number;
      readonly value: number;
      readonly comment?: string;
    }
  | { readonly kind: 'comment'; readonly text: string; }
  | {
      readonly kind: 'if';
      readonly condition: number;
      readonly accept: NagaBlockIR;
      readonly reject: NagaBlockIR;
    }
  | { readonly kind: 'loop'; readonly body: NagaBlockIR; }
  | { readonly kind: 'break'; }
  | { readonly kind: 'continue'; }
  | { readonly kind: 'return'; };

export interface NagaFunctionIR {
  readonly name: string;
  readonly arguments: readonly NagaFunctionArgumentIR[];
  readonly expressions: readonly NagaExpressionIR[];
  readonly statements: readonly NagaStatementIR[];
  readonly body: NagaBlockIR;
}

export interface NagaEntryPointIR {
  readonly stage: 'compute';
  readonly function: string;
  readonly workgroupSize: readonly [number, number, number];
}

export interface NagaModuleIR {
  readonly types: readonly NagaTypeIR[];
  readonly constants: readonly NagaConstantIR[];
  readonly global_variables: readonly NagaGlobalVariableIR[];
  readonly functions: readonly NagaFunctionIR[];
  readonly entry_points: readonly NagaEntryPointIR[];
}

export interface NagaSourceMapEntryIR {
  readonly blockId: BlockId | null;
  readonly stepIndex: number;
  readonly exprId?: number;
}

export interface NagaLoweringProgramIR {
  readonly module: NagaModuleIR;
  readonly sourceMap: Readonly<Record<string, NagaSourceMapEntryIR>>;
  readonly compute: NagaComputeMetadataIR;
  readonly coverage: NagaLoweringCoverageIR;
}

interface SlotAddressPlan {
  readonly offset: number;
  readonly laneCount: number;
  readonly laneStride: number;
  readonly componentStride: number;
  readonly stride: number;
  readonly storage: 'f32' | 'i32' | 'u32';
}

export interface NagaComputeMetadataIR {
  readonly maxActiveLanes: number;
}

export interface NagaLoweringCoverageIR {
  readonly totalStepCount: number;
  readonly boundaryStepCount: number;
  readonly droppedComputeStepCount: number;
}

interface LoweringCoverageState {
  boundaryStepCount: number;
  droppedComputeStepCount: number;
}

class Interner<T> {
  private readonly values: T[] = [];
  private readonly indexByKey = new Map<string, number>();

  intern(key: string, value: T): number {
    const existing = this.indexByKey.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const next = this.values.length;
    this.values.push(value);
    this.indexByKey.set(key, next);
    return next;
  }

  toArray(): readonly T[] {
    return this.values;
  }
}

class LoweringCtx {
  readonly types = new Interner<NagaTypeIR>();
  readonly constants = new Interner<NagaConstantIR>();
  readonly globals: NagaGlobalVariableIR[] = [];
  readonly sourceMap: Record<string, NagaSourceMapEntryIR> = {};

  private readonly expressions: NagaExpressionIR[] = [];
  private readonly statements: NagaStatementIR[] = [];
  private readonly rootBlock: number[] = [];
  private activeBlock: number[] = this.rootBlock;

  addExpression(expr: NagaExpressionIR, source: NagaSourceMapEntryIR): number {
    const id = this.expressions.length;
    this.expressions.push(expr);
    this.sourceMap[`Expr_${id}`] = source;
    return id;
  }

  addStatement(statement: NagaStatementIR, source: NagaSourceMapEntryIR): number {
    const id = this.statements.length;
    this.statements.push(statement);
    this.sourceMap[`Stmt_${id}`] = source;
    this.activeBlock.push(id);
    return id;
  }

  withBlock<T>(emit: () => T): { readonly block: number[]; readonly value: T } {
    const parent = this.activeBlock;
    const block: number[] = [];
    this.activeBlock = block;
    try {
      const value = emit();
      return { block, value };
    } finally {
      this.activeBlock = parent;
    }
  }

  internType(type: NagaTypeIR): number {
    return this.types.intern(JSON.stringify(type), type);
  }

  internNumberConstant(type: number, value: number): number {
    return this.constants.intern(`${type}:${value}`, { type, value });
  }

  emitFunction(name: string, args: readonly NagaFunctionArgumentIR[]): NagaFunctionIR {
    return {
      name,
      arguments: args,
      expressions: this.expressions,
      statements: this.statements,
      body: this.rootBlock,
    };
  }
}

interface LoweringBuiltins {
  readonly f32Type: number;
  readonly u32Type: number;
  readonly vec3U32Type: number;
  readonly vec4F32Type: number;
  readonly arrayF32Type: number;
  readonly uniformsType: number;
}

function registerBuiltinTypes(ctx: LoweringCtx): LoweringBuiltins {
  const f32Type = ctx.internType({ kind: 'scalar', scalar: 'f32', width: 4 });
  const u32Type = ctx.internType({ kind: 'scalar', scalar: 'u32', width: 4 });
  const vec3U32Type = ctx.internType({ kind: 'vector', size: 3, scalar: 'u32', width: 4 });
  const vec4F32Type = ctx.internType({ kind: 'vector', size: 4, scalar: 'f32', width: 4 });
  const arrayF32Type = ctx.internType({ kind: 'array', base: f32Type, size: 'dynamic' });
  const uniformsType = ctx.internType({ kind: 'array', base: vec4F32Type, size: 5 });
  return { f32Type, u32Type, vec3U32Type, vec4F32Type, arrayF32Type, uniformsType };
}

function registerBuiltinGlobals(ctx: LoweringCtx, builtins: LoweringBuiltins): void {
  ctx.globals.push(
    { name: 'arena_in', storageClass: 'storage', access: 'read', binding: { group: 0, binding: 0 }, type: builtins.arrayF32Type },
    { name: 'arena_out', storageClass: 'storage', access: 'read_write', binding: { group: 0, binding: 1 }, type: builtins.arrayF32Type },
    { name: 'state_in', storageClass: 'storage', access: 'read', binding: { group: 0, binding: 2 }, type: builtins.arrayF32Type },
    { name: 'state_out', storageClass: 'storage', access: 'read_write', binding: { group: 0, binding: 3 }, type: builtins.arrayF32Type },
    { name: 'uniforms', storageClass: 'uniform', access: 'read', binding: { group: 0, binding: 4 }, type: builtins.uniformsType },
  );
}

function getStepExprId(step: Step): ValueExprId | null {
  switch (step.kind) {
    case 'eventDispatch': return step.expr;
    case 'materialize': return step.field;
    case 'stateWrite':
    case 'fieldStateWrite': return step.value;
    case 'render':
    case 'continuityApply':
    case 'continuityMapBuild': return null;
    default: return null;
  }
}

function makeSource(stepIndex: number, exprId: number | undefined, exprToBlock: ReadonlyMap<ValueExprId, BlockId>): NagaSourceMapEntryIR {
  const blockId = exprId !== undefined ? exprToBlock.get(exprId as ValueExprId) ?? null : null;
  return { blockId, stepIndex, exprId };
}

function toSlotAddressPlan(runtimeAddressTable: RuntimeAddressTableIR, slot: ValueSlot): SlotAddressPlan | null {
  const arena = runtimeAddressTable.slotToArena.get(slot);
  const lookup = runtimeAddressTable.slotLookup.get(slot);
  if (!arena || !lookup) return null;
  const packing = arena.packing ?? 'soa';
  const laneStride = arena.laneStride ?? (packing === 'soa' ? 1 : arena.stride);
  const componentStride = arena.componentStride ?? (packing === 'soa' ? arena.laneCount : 1);
  return {
    offset: arena.offset,
    laneCount: arena.laneCount,
    laneStride,
    componentStride,
    stride: arena.stride,
    storage: lookup.storage,
  };
}

function findStateSlotStart(schedule: ScheduleIR, stateKey: string): number | null {
  for (const mapping of schedule.stateMappings) {
    if (mapping.stateId === stateKey) {
      return mapping.slotStart;
    }
  }
  return null;
}

function resolveInputSlotFromExpr(exprId: number, runtimeAddressTable: RuntimeAddressTableIR): ValueSlot | null {
  const fieldSlot = runtimeAddressTable.fieldExprToSlot.get(exprId);
  if (fieldSlot !== undefined) return fieldSlot;
  const scalarAddress = runtimeAddressTable.scalarExprToArenaAddress.get(exprId);
  if (scalarAddress) return scalarAddress.slot;
  return null;
}

function collectExprInputs(expr: ValueExpr | undefined): readonly number[] {
  if (!expr) return [];
  switch (expr.kind) {
    case 'kernel':
      switch (expr.kernelKind) {
        case 'map': return [expr.input as number];
        case 'zip': return expr.inputs.map((id) => id as number);
        case 'zipPromote': return [expr.field as number, ...expr.ones.map((id) => id as number)];
        case 'broadcast': return [expr.one as number, ...(expr.oneComponents ?? []).map((id) => id as number)];
        case 'reduce': return [expr.field as number];
        case 'pathDerivative': return [expr.field as number];
        case 'pathSample': return [expr.controlPoints as number, expr.tField as number];
        default: return [];
      }
    case 'extract': return [expr.input as number];
    case 'construct': return expr.components.map((id) => id as number);
    case 'oklchToRgb': return [expr.input as number];
    case 'event':
      switch (expr.eventKind) {
        case 'wrap': return [expr.input as number];
        case 'combine': return expr.inputs.map((id) => id as number);
        case 'pulse': case 'never': case 'const': return [];
        default: return [];
      }
    default: return [];
  }
}

function resolveStepInputSlot(
  step: StepMaterialize,
  stepExpr: ValueExpr | undefined,
  schedule: ScheduleIR,
  runtimeAddressTable: RuntimeAddressTableIR,
): {
  readonly buffer: 'arena_in' | 'state_in';
  readonly slotOrStateOffset: ValueSlot | number;
  readonly resolution: 'state' | 'explicit_input' | 'field_slot';
} | null {
  const exprId = step.field as number;

  if (stepExpr?.kind === 'state') {
    const stateSlotStart = findStateSlotStart(schedule, stepExpr.stateKey);
    if (stateSlotStart === null) return null;
    return { buffer: 'state_in', slotOrStateOffset: stateSlotStart, resolution: 'state' };
  }

  const explicitInputs = collectExprInputs(stepExpr);
  const explicitSource = explicitInputs
    .map((candidate) => resolveInputSlotFromExpr(candidate, runtimeAddressTable))
    .find((candidate): candidate is ValueSlot => candidate !== null);
  if (explicitSource !== undefined) {
    return { buffer: 'arena_in', slotOrStateOffset: explicitSource, resolution: 'explicit_input' };
  }
  const fieldSlot = runtimeAddressTable.fieldExprToSlot.get(step.field as ValueExprId);
  if (fieldSlot !== undefined) {
    return { buffer: 'arena_in', slotOrStateOffset: fieldSlot, resolution: 'field_slot' };
  }
  return null;
}

function emitAddressIndex(
  ctx: LoweringCtx,
  builtins: LoweringBuiltins,
  laneExpr: number,
  baseOffset: number,
  laneStride: number,
  componentStride: number,
  componentIndex: number,
  source: NagaSourceMapEntryIR,
): number {
  const baseConst = ctx.addExpression({ kind: 'constant', constant: ctx.internNumberConstant(builtins.u32Type, baseOffset) }, source);
  const laneStrideConst = ctx.addExpression({ kind: 'constant', constant: ctx.internNumberConstant(builtins.u32Type, laneStride) }, source);
  const laneOffset = ctx.addExpression({ kind: 'binary', op: 'mul', left: laneExpr, right: laneStrideConst }, source);
  const componentConst = ctx.addExpression({ kind: 'constant', constant: ctx.internNumberConstant(builtins.u32Type, componentIndex) }, source);
  const componentStrideConst = ctx.addExpression({ kind: 'constant', constant: ctx.internNumberConstant(builtins.u32Type, componentStride) }, source);
  const componentOffset = ctx.addExpression({ kind: 'binary', op: 'mul', left: componentConst, right: componentStrideConst }, source);
  const basePlusLane = ctx.addExpression({ kind: 'binary', op: 'add', left: baseConst, right: laneOffset }, source);
  return ctx.addExpression({ kind: 'binary', op: 'add', left: basePlusLane, right: componentOffset }, source);
}

// [LAW:dataflow-not-control-flow] Clamping is ONLY used for reading sources, seamlessly
// allowing 1-to-N broadcasting. Targets are guarded by thread masks, never clamped.
function emitLaneExprForLaneCount(
  ctx: LoweringCtx,
  builtins: LoweringBuiltins,
  laneExpr: number,
  laneCount: number,
  source: NagaSourceMapEntryIR,
): number {
  const normalizedLaneCount = Number.isFinite(laneCount) && laneCount > 0 ? Math.trunc(laneCount) : 1;
  if (normalizedLaneCount <= 1) {
    return ctx.addExpression(
      { kind: 'constant', constant: ctx.internNumberConstant(builtins.u32Type, 0) },
      source,
    );
  }
  const laneMaxExpr = ctx.addExpression(
    { kind: 'constant', constant: ctx.internNumberConstant(builtins.u32Type, normalizedLaneCount - 1) },
    source,
  );
  return emitBuiltinCall(ctx, 'min', [laneExpr, laneMaxExpr], source);
}

// Masks execution of the entire math block if the global thread exceeds the target slot's bounds.
function withTargetLaneGuard(
  ctx: LoweringCtx,
  builtins: LoweringBuiltins,
  laneExpr: number,
  targetLaneCount: number,
  source: NagaSourceMapEntryIR,
  emit: () => void
): void {
  const targetLimit = ctx.addExpression(
    { kind: 'constant', constant: ctx.internNumberConstant(builtins.u32Type, targetLaneCount) },
    source
  );
  const condition = ctx.addExpression(
    { kind: 'binary', op: 'lt', left: laneExpr, right: targetLimit },
    source
  );
  const { block } = ctx.withBlock(emit);
  if (block.length > 0) {
    ctx.addStatement(
      { kind: 'if', condition, accept: block, reject: [] },
      source
    );
  }
}

function emitTypedCopy(
  ctx: LoweringCtx,
  builtins: LoweringBuiltins,
  laneExpr: number,
  sourcePlan: SlotAddressPlan,
  sourceBuffer: 'arena_in' | 'state_in' | 'arena_out',
  targetPlan: SlotAddressPlan,
  targetBuffer: 'arena_out' | 'state_out',
  source: NagaSourceMapEntryIR,
  comment: string,
): void {
  const componentCount = Math.min(sourcePlan.stride, targetPlan.stride);
  const sourceLaneExpr = emitLaneExprForLaneCount(ctx, builtins, laneExpr, sourcePlan.laneCount, source);

  for (let componentIndex = 0; componentIndex < componentCount; componentIndex++) {
    const sourceIndex = emitAddressIndex(
      ctx, builtins, sourceLaneExpr,
      sourcePlan.offset, sourcePlan.laneStride, sourcePlan.componentStride, componentIndex, source
    );
    // Target uses un-clamped laneExpr because it's guaranteed safe via withTargetLaneGuard
    const targetIndex = emitAddressIndex(
      ctx, builtins, laneExpr,
      targetPlan.offset, targetPlan.laneStride, targetPlan.componentStride, componentIndex, source
    );

    const loaded = ctx.addExpression({ kind: 'buffer_load', buffer: sourceBuffer, index: sourceIndex }, source);

    const typedRead = sourcePlan.storage === 'u32'
      ? ctx.addExpression({ kind: 'as', to: 'u32', expr: loaded }, source)
      : loaded;
    const storeValue = targetPlan.storage === 'u32'
      ? ctx.addExpression({ kind: 'as', to: 'f32', expr: typedRead }, source)
      : typedRead;

    ctx.addStatement(
      { kind: 'store', buffer: targetBuffer, index: targetIndex, value: storeValue, comment },
      source,
    );
  }
}

function createStateSlotAddressPlan(schedule: ScheduleIR, stateSlotStart: number): SlotAddressPlan | null {
  for (const mapping of schedule.stateMappings) {
    if (mapping.slotStart !== stateSlotStart) continue;
    return {
      offset: mapping.slotStart,
      laneCount: mapping.laneCount,
      laneStride: mapping.stride,
      componentStride: 1,
      stride: mapping.stride,
      storage: 'f32',
    };
  }
  return null;
}

function deriveMaxActiveLanes(args: {
  readonly schedule: ScheduleIR;
  readonly runtimeAddressTable: RuntimeAddressTableIR;
}): number {
  let maxLaneCount = 1;
  for (const arena of args.runtimeAddressTable.slotToArena.values()) {
    if (arena.laneCount > maxLaneCount) {
      maxLaneCount = arena.laneCount;
    }
  }
  for (const mapping of args.schedule.stateMappings) {
    if (mapping.laneCount > maxLaneCount) {
      maxLaneCount = mapping.laneCount;
    }
  }
  return Number.isFinite(maxLaneCount) && maxLaneCount > 0 ? Math.trunc(maxLaneCount) : 1;
}

function inferComponentStride(expr: ValueExpr | undefined): number {
  if (!expr) return 1;
  try {
    return Math.max(1, payloadStride(expr.type.payload));
  } catch {
    return 1;
  }
}

function emitLiteralF32(ctx: LoweringCtx, builtins: LoweringBuiltins, value: number, source: NagaSourceMapEntryIR): number {
  return ctx.addExpression({ kind: 'constant', constant: ctx.internNumberConstant(builtins.f32Type, value) }, source);
}

const UNIFORMS_TIME_VEC_INDEX = 4;
const UNIFORMS_TIME_SECONDS_COMPONENT = 2;
const UNIFORMS_DELTA_SECONDS_COMPONENT = 3;
const TWO_PI_F32 = Math.PI * 2;

function emitUniformVec4(ctx: LoweringCtx, builtins: LoweringBuiltins, vecIndex: number, source: NagaSourceMapEntryIR): number {
  const uniformIndex = ctx.addExpression({ kind: 'constant', constant: ctx.internNumberConstant(builtins.u32Type, vecIndex) }, source);
  return ctx.addExpression({ kind: 'buffer_load', buffer: 'uniforms', index: uniformIndex }, source);
}

function emitUniformComponentF32(ctx: LoweringCtx, builtins: LoweringBuiltins, vecIndex: number, componentIndex: 0 | 1 | 2 | 3, source: NagaSourceMapEntryIR): number {
  const uniformVec = emitUniformVec4(ctx, builtins, vecIndex, source);
  return ctx.addExpression({ kind: 'access_index', base: uniformVec, index: componentIndex }, source);
}

function emitRuntimeTimeMsF32(ctx: LoweringCtx, builtins: LoweringBuiltins, source: NagaSourceMapEntryIR): number {
  const timeSeconds = emitUniformComponentF32(ctx, builtins, UNIFORMS_TIME_VEC_INDEX, UNIFORMS_TIME_SECONDS_COMPONENT, source);
  const oneThousand = emitLiteralF32(ctx, builtins, 1000, source);
  return ctx.addExpression({ kind: 'binary', op: 'mul', left: timeSeconds, right: oneThousand }, source);
}

function emitRuntimeDeltaMsF32(ctx: LoweringCtx, builtins: LoweringBuiltins, source: NagaSourceMapEntryIR): number {
  const dtSeconds = emitUniformComponentF32(ctx, builtins, UNIFORMS_TIME_VEC_INDEX, UNIFORMS_DELTA_SECONDS_COMPONENT, source);
  const oneThousand = emitLiteralF32(ctx, builtins, 1000, source);
  return ctx.addExpression({ kind: 'binary', op: 'mul', left: dtSeconds, right: oneThousand }, source);
}

function emitPhaseFromRuntimeTime(ctx: LoweringCtx, builtins: LoweringBuiltins, periodMs: number, source: NagaSourceMapEntryIR): number {
  if (!Number.isFinite(periodMs) || periodMs <= 0) {
    return emitLiteralF32(ctx, builtins, 0, source);
  }
  const timeMs = emitRuntimeTimeMsF32(ctx, builtins, source);
  const invPeriod = emitLiteralF32(ctx, builtins, 1 / periodMs, source);
  const phaseUnwrapped = ctx.addExpression({ kind: 'binary', op: 'mul', left: timeMs, right: invPeriod }, source);
  return emitBuiltinCall(ctx, 'fract', [phaseUnwrapped], source);
}

function emitPaletteComponentFromPhase(ctx: LoweringCtx, builtins: LoweringBuiltins, phaseA: number, componentIndex: number, source: NagaSourceMapEntryIR): number {
  if (componentIndex === 3) {
    return emitLiteralF32(ctx, builtins, 1, source);
  }
  const offsets = [0, 2 / 3, 1 / 3] as const;
  const hueOffset = emitLiteralF32(ctx, builtins, offsets[Math.max(0, Math.min(2, componentIndex))] ?? 0, source);
  const shiftedHue = ctx.addExpression({ kind: 'binary', op: 'add', left: phaseA, right: hueOffset }, source);
  const wrappedHue = emitBuiltinCall(ctx, 'fract', [shiftedHue], source);
  const six = emitLiteralF32(ctx, builtins, 6, source);
  const three = emitLiteralF32(ctx, builtins, 3, source);
  const one = emitLiteralF32(ctx, builtins, 1, source);
  const half = emitLiteralF32(ctx, builtins, 0.5, source);
  const zero = emitLiteralF32(ctx, builtins, 0, source);
  const scaled = ctx.addExpression({ kind: 'binary', op: 'mul', left: wrappedHue, right: six }, source);
  const shifted = ctx.addExpression({ kind: 'binary', op: 'sub', left: scaled, right: three }, source);
  const distance = emitBuiltinCall(ctx, 'abs', [shifted], source);
  const ramp = ctx.addExpression({ kind: 'binary', op: 'sub', left: distance, right: one }, source);
  const clamped = emitBuiltinCall(ctx, 'clamp', [ramp, zero, one], source);
  return ctx.addExpression({ kind: 'binary', op: 'mul', left: clamped, right: half }, source);
}

function emitTimeChannelF32(args: {
  readonly ctx: LoweringCtx;
  readonly builtins: LoweringBuiltins;
  readonly which: 'tMs' | 'phaseA' | 'phaseB' | 'dt' | 'progress' | 'palette' | 'energy';
  readonly componentIndex: number;
  readonly periodAMs: number;
  readonly periodBMs: number;
  readonly source: NagaSourceMapEntryIR;
}): number {
  const { ctx, builtins, which, componentIndex, periodAMs, periodBMs, source } = args;
  if (which === 'tMs') return emitRuntimeTimeMsF32(ctx, builtins, source);
  if (which === 'dt') return emitRuntimeDeltaMsF32(ctx, builtins, source);
  if (which === 'phaseA') return emitPhaseFromRuntimeTime(ctx, builtins, periodAMs, source);
  if (which === 'phaseB') return emitPhaseFromRuntimeTime(ctx, builtins, periodBMs, source);
  if (which === 'progress') return emitLiteralF32(ctx, builtins, 0, source);
  if (which === 'energy') {
    const phaseA = emitPhaseFromRuntimeTime(ctx, builtins, periodAMs, source);
    const tau = emitLiteralF32(ctx, builtins, TWO_PI_F32, source);
    const phaseRadians = ctx.addExpression({ kind: 'binary', op: 'mul', left: phaseA, right: tau }, source);
    const wave = emitBuiltinCall(ctx, 'sin', [phaseRadians], source);
    const half = emitLiteralF32(ctx, builtins, 0.5, source);
    const centered = ctx.addExpression({ kind: 'binary', op: 'mul', left: wave, right: half }, source);
    return ctx.addExpression({ kind: 'binary', op: 'add', left: half, right: centered }, source);
  }
  const phaseA = emitPhaseFromRuntimeTime(ctx, builtins, periodAMs, source);
  return emitPaletteComponentFromPhase(ctx, builtins, phaseA, componentIndex, source);
}

function emitLoadedF32FromPlan(
  ctx: LoweringCtx,
  builtins: LoweringBuiltins,
  laneExpr: number,
  plan: SlotAddressPlan,
  buffer: 'arena_in' | 'state_in',
  componentIndex: number,
  source: NagaSourceMapEntryIR,
): number | null {
  if (plan.storage !== 'f32') return null;
  const laneForPlan = emitLaneExprForLaneCount(ctx, builtins, laneExpr, plan.laneCount, source);
  const address = emitAddressIndex(
    ctx, builtins, laneForPlan,
    plan.offset, plan.laneStride, plan.componentStride, componentIndex, source,
  );
  return ctx.addExpression({ kind: 'buffer_load', buffer, index: address }, source);
}

function emitBuiltinCall(ctx: LoweringCtx, fn: NagaBuiltinCallNameIR, args: readonly number[], source: NagaSourceMapEntryIR): number {
  return ctx.addExpression({ kind: 'call', function: fn, args }, source);
}

function emitBoolAsF32(ctx: LoweringCtx, builtins: LoweringBuiltins, condition: number, source: NagaSourceMapEntryIR): number {
  const zero = emitLiteralF32(ctx, builtins, 0, source);
  const one = emitLiteralF32(ctx, builtins, 1, source);
  return emitBuiltinCall(ctx, 'select', [zero, one, condition], source);
}

function expectArity(inputExprs: readonly number[], arity: number): boolean {
  return inputExprs.length === arity;
}

function expectMinArity(inputExprs: readonly number[], minimum: number): boolean {
  return inputExprs.length >= minimum;
}

type PureFnHandlerArgs = {
  readonly ctx: LoweringCtx;
  readonly builtins: LoweringBuiltins;
  readonly inputExprs: readonly number[];
  readonly source: NagaSourceMapEntryIR;
};

type PureFnHandler = (args: PureFnHandlerArgs) => number | null;

const PURE_REDUCED_BINARY_OP_BY_OPCODE: ReadonlyMap<OpCode, Extract<NagaExpressionIR, { kind: 'binary' }>['op']> = new Map([
  [OpCode.Add, 'add'], [OpCode.Mul, 'mul'],
]);

const PURE_BINARY_OP_BY_OPCODE: ReadonlyMap<OpCode, Extract<NagaExpressionIR, { kind: 'binary' }>['op']> = new Map([
  [OpCode.Sub, 'sub'], [OpCode.Div, 'div'], [OpCode.Mod, 'mod'],
]);

const PURE_REDUCED_BUILTIN_BY_OPCODE: ReadonlyMap<OpCode, NagaBuiltinCallNameIR> = new Map([
  [OpCode.Min, 'min'], [OpCode.Max, 'max'],
]);

const PURE_UNARY_BUILTIN_BY_OPCODE: ReadonlyMap<OpCode, NagaBuiltinCallNameIR> = new Map([
  [OpCode.Abs, 'abs'], [OpCode.Sin, 'sin'], [OpCode.Cos, 'cos'], [OpCode.Tan, 'tan'],
  [OpCode.Wrap01, 'fract'], [OpCode.Floor, 'floor'], [OpCode.Ceil, 'ceil'],
  [OpCode.Round, 'round'], [OpCode.Fract, 'fract'], [OpCode.Sqrt, 'sqrt'],
  [OpCode.Exp, 'exp'], [OpCode.Log, 'log'], [OpCode.Sign, 'sign'],
]);

const PURE_BINARY_BUILTIN_BY_OPCODE: ReadonlyMap<OpCode, NagaBuiltinCallNameIR> = new Map([
  [OpCode.Pow, 'pow'], [OpCode.Atan2, 'atan2'],
]);

function reduceBinaryOp(inputExprs: readonly number[], args: {
  readonly ctx: LoweringCtx;
  readonly source: NagaSourceMapEntryIR;
  readonly op: Extract<NagaExpressionIR, { kind: 'binary' }>['op'];
}): number | null {
  if (!expectMinArity(inputExprs, 1)) return null;
  let acc = inputExprs[0]!;
  for (let i = 1; i < inputExprs.length; i++) {
    acc = args.ctx.addExpression({ kind: 'binary', op: args.op, left: acc, right: inputExprs[i]! }, args.source);
  }
  return acc;
}

function reduceBuiltinCall(inputExprs: readonly number[], args: {
  readonly ctx: LoweringCtx;
  readonly source: NagaSourceMapEntryIR;
  readonly name: NagaBuiltinCallNameIR;
}): number | null {
  if (!expectMinArity(inputExprs, 1)) return null;
  let acc = inputExprs[0]!;
  for (let i = 1; i < inputExprs.length; i++) {
    acc = emitBuiltinCall(args.ctx, args.name, [acc, inputExprs[i]!], args.source);
  }
  return acc;
}

function emitPureBinaryOpF32(args: PureFnHandlerArgs, op: Extract<NagaExpressionIR, { kind: 'binary' }>['op']): number | null {
  return expectArity(args.inputExprs, 2) ? args.ctx.addExpression({ kind: 'binary', op, left: args.inputExprs[0]!, right: args.inputExprs[1]! }, args.source) : null;
}

function emitPureUnaryBuiltinF32(args: PureFnHandlerArgs, name: NagaBuiltinCallNameIR): number | null {
  return expectArity(args.inputExprs, 1) ? emitBuiltinCall(args.ctx, name, [args.inputExprs[0]!], args.source) : null;
}

function emitPureBinaryBuiltinF32(args: PureFnHandlerArgs, name: NagaBuiltinCallNameIR): number | null {
  return expectArity(args.inputExprs, 2) ? emitBuiltinCall(args.ctx, name, [args.inputExprs[0]!, args.inputExprs[1]!], args.source) : null;
}

function emitComparisonAsF32(args: PureFnHandlerArgs, op: Extract<NagaExpressionIR, { kind: 'binary' }>['op']): number | null {
  if (!expectArity(args.inputExprs, 2)) return null;
  const condition = args.ctx.addExpression({ kind: 'binary', op, left: args.inputExprs[0]!, right: args.inputExprs[1]! }, args.source);
  return emitBoolAsF32(args.ctx, args.builtins, condition, args.source);
}

function emitPureNegF32(args: PureFnHandlerArgs): number | null {
  if (!expectArity(args.inputExprs, 1)) return null;
  const zero = emitLiteralF32(args.ctx, args.builtins, 0, args.source);
  return args.ctx.addExpression({ kind: 'binary', op: 'sub', left: zero, right: args.inputExprs[0]! }, args.source);
}

function emitPureAvgF32(args: PureFnHandlerArgs): number | null {
  const sum = reduceBinaryOp(args.inputExprs, { ctx: args.ctx, source: args.source, op: 'add' });
  if (sum === null) return null;
  const invN = emitLiteralF32(args.ctx, args.builtins, 1 / args.inputExprs.length, args.source);
  return args.ctx.addExpression({ kind: 'binary', op: 'mul', left: sum, right: invN }, args.source);
}

function emitPureLastF32(args: PureFnHandlerArgs): number | null {
  return expectMinArity(args.inputExprs, 1) ? args.inputExprs[args.inputExprs.length - 1]! : null;
}

function emitPureClampF32(args: PureFnHandlerArgs): number | null {
  return expectArity(args.inputExprs, 3) ? emitBuiltinCall(args.ctx, 'clamp', [args.inputExprs[0]!, args.inputExprs[1]!, args.inputExprs[2]!], args.source) : null;
}

function emitPureLerpF32(args: PureFnHandlerArgs): number | null {
  if (!expectArity(args.inputExprs, 3)) return null;
  const one = emitLiteralF32(args.ctx, args.builtins, 1, args.source);
  const oneMinusT = args.ctx.addExpression({ kind: 'binary', op: 'sub', left: one, right: args.inputExprs[2]! }, args.source);
  const lhs = args.ctx.addExpression({ kind: 'binary', op: 'mul', left: args.inputExprs[0]!, right: oneMinusT }, args.source);
  const rhs = args.ctx.addExpression({ kind: 'binary', op: 'mul', left: args.inputExprs[1]!, right: args.inputExprs[2]! }, args.source);
  return args.ctx.addExpression({ kind: 'binary', op: 'add', left: lhs, right: rhs }, args.source);
}

function emitPureHashF32(args: PureFnHandlerArgs): number | null {
  if (!expectArity(args.inputExprs, 2)) return null;
  const valueScale = emitLiteralF32(args.ctx, args.builtins, 12.9898, args.source);
  const seedScale = emitLiteralF32(args.ctx, args.builtins, 78.233, args.source);
  const hashScale = emitLiteralF32(args.ctx, args.builtins, 43758.5453123, args.source);
  const valueTerm = args.ctx.addExpression({ kind: 'binary', op: 'mul', left: args.inputExprs[0]!, right: valueScale }, args.source);
  const seedTerm = args.ctx.addExpression({ kind: 'binary', op: 'mul', left: args.inputExprs[1]!, right: seedScale }, args.source);
  const phase = args.ctx.addExpression({ kind: 'binary', op: 'add', left: valueTerm, right: seedTerm }, args.source);
  const wave = emitBuiltinCall(args.ctx, 'sin', [phase], args.source);
  const scaled = args.ctx.addExpression({ kind: 'binary', op: 'mul', left: wave, right: hashScale }, args.source);
  return emitBuiltinCall(args.ctx, 'fract', [scaled], args.source);
}

function emitPureSelectF32(args: PureFnHandlerArgs): number | null {
  if (!expectArity(args.inputExprs, 3)) return null;
  const zero = emitLiteralF32(args.ctx, args.builtins, 0, args.source);
  const condition = args.ctx.addExpression({ kind: 'binary', op: 'gt', left: args.inputExprs[0]!, right: zero }, args.source);
  return emitBuiltinCall(args.ctx, 'select', [args.inputExprs[2]!, args.inputExprs[1]!, condition], args.source);
}

function emitPureIdentityF32(args: PureFnHandlerArgs): number | null {
  return expectArity(args.inputExprs, 1) ? args.inputExprs[0]! : null;
}

function emitPureF64ToI32TruncF32(args: PureFnHandlerArgs): number | null {
  if (!expectArity(args.inputExprs, 1)) return null;
  const minI32 = emitLiteralF32(args.ctx, args.builtins, -2147483648, args.source);
  const maxI32 = emitLiteralF32(args.ctx, args.builtins, 2147483647, args.source);
  const maxFiniteF32 = emitLiteralF32(args.ctx, args.builtins, 3.4028234663852886e38, args.source);
  const truncated = emitBuiltinCall(args.ctx, 'trunc', [args.inputExprs[0]!], args.source);
  const clamped = emitBuiltinCall(args.ctx, 'clamp', [truncated, minI32, maxI32], args.source);
  const absValue = emitBuiltinCall(args.ctx, 'abs', [args.inputExprs[0]!], args.source);
  const finiteCondition = args.ctx.addExpression({ kind: 'binary', op: 'le', left: absValue, right: maxFiniteF32 }, args.source);
  const zero = emitLiteralF32(args.ctx, args.builtins, 0, args.source);
  const normalizedClamped = args.ctx.addExpression({ kind: 'binary', op: 'add', left: clamped, right: zero }, args.source);
  return emitBuiltinCall(args.ctx, 'select', [zero, normalizedClamped, finiteCondition], args.source);
}

const PURE_SPECIAL_HANDLER_BY_OPCODE: ReadonlyMap<OpCode, PureFnHandler> = new Map([
  [OpCode.Neg, emitPureNegF32], [OpCode.Avg, emitPureAvgF32], [OpCode.Last, emitPureLastF32],
  [OpCode.Clamp, emitPureClampF32], [OpCode.Lerp, emitPureLerpF32],
  [OpCode.Eq, (args) => emitComparisonAsF32(args, 'eq')],
  [OpCode.Lt, (args) => emitComparisonAsF32(args, 'lt')],
  [OpCode.Gt, (args) => emitComparisonAsF32(args, 'gt')],
  [OpCode.Hash, emitPureHashF32], [OpCode.Select, emitPureSelectF32],
  [OpCode.Identity, emitPureIdentityF32], [OpCode.F64ToI32Trunc, emitPureF64ToI32TruncF32],
  [OpCode.I32ToF64, emitPureIdentityF32],
]);

function emitPureFnF32(
  ctx: LoweringCtx,
  builtins: LoweringBuiltins,
  fn: PureFn,
  inputExprs: readonly number[],
  source: NagaSourceMapEntryIR,
): number | null {
  if (inputExprs.length === 0 || fn.kind !== 'opcode') return null;
  const handlerArgs: PureFnHandlerArgs = { ctx, builtins, inputExprs, source };
  
  const reducedBinaryOp = PURE_REDUCED_BINARY_OP_BY_OPCODE.get(fn.opcode);
  if (reducedBinaryOp) return reduceBinaryOp(inputExprs, { ctx, source, op: reducedBinaryOp });
  
  const binaryOp = PURE_BINARY_OP_BY_OPCODE.get(fn.opcode);
  if (binaryOp) return emitPureBinaryOpF32(handlerArgs, binaryOp);
  
  const reducedBuiltin = PURE_REDUCED_BUILTIN_BY_OPCODE.get(fn.opcode);
  if (reducedBuiltin) return reduceBuiltinCall(inputExprs, { ctx, source, name: reducedBuiltin });
  
  const unaryBuiltin = PURE_UNARY_BUILTIN_BY_OPCODE.get(fn.opcode);
  if (unaryBuiltin) return emitPureUnaryBuiltinF32(handlerArgs, unaryBuiltin);
  
  const binaryBuiltin = PURE_BINARY_BUILTIN_BY_OPCODE.get(fn.opcode);
  if (binaryBuiltin) return emitPureBinaryBuiltinF32(handlerArgs, binaryBuiltin);
  
  const specialHandler = PURE_SPECIAL_HANDLER_BY_OPCODE.get(fn.opcode);
  if (specialHandler) return specialHandler(handlerArgs);
  
  return null;
}

type MaterializeExprInputEmitter = (inputExprId: ValueExprId, requestedComponent: number) => number | null;

function emitKernelExprComponentF32(args: {
  readonly ctx: LoweringCtx;
  readonly builtins: LoweringBuiltins;
  readonly source: NagaSourceMapEntryIR;
  readonly component: number;
  readonly expr: Extract<ValueExpr, { kind: 'kernel' }>;
  readonly emitFromExprInput: MaterializeExprInputEmitter;
}): number | null {
  switch (args.expr.kernelKind) {
    case 'broadcast': {
      const explicit = args.expr.oneComponents?.[args.component];
      if (explicit !== undefined) return args.emitFromExprInput(explicit, 0);
      return args.emitFromExprInput(args.expr.one, args.component);
    }
    case 'map': {
      const input = args.emitFromExprInput(args.expr.input, args.component);
      return input === null ? null : emitPureFnF32(args.ctx, args.builtins, args.expr.fn, [input], args.source);
    }
    case 'zip': {
      const emittedInputs: number[] = [];
      for (const inputExprId of args.expr.inputs) {
        const emittedInput = args.emitFromExprInput(inputExprId, args.component);
        if (emittedInput === null) return null;
        emittedInputs.push(emittedInput);
      }
      return emitPureFnF32(args.ctx, args.builtins, args.expr.fn, emittedInputs, args.source);
    }
    case 'zipPromote': {
      const emittedInputs: number[] = [];
      const fieldInput = args.emitFromExprInput(args.expr.field, args.component);
      if (fieldInput === null) return null;
      emittedInputs.push(fieldInput);
      for (const one of args.expr.ones) {
        const oneInput = args.emitFromExprInput(one, args.component);
        if (oneInput === null) return null;
        emittedInputs.push(oneInput);
      }
      return emitPureFnF32(args.ctx, args.builtins, args.expr.fn, emittedInputs, args.source);
    }
    case 'reduce': return args.emitFromExprInput(args.expr.field, args.component);
    case 'pathDerivative': return args.emitFromExprInput(args.expr.field, args.component);
    case 'pathSample': return args.expr.op === 'tangentAngle'
        ? args.emitFromExprInput(args.expr.tField, 0)
        : args.emitFromExprInput(args.expr.controlPoints, args.component);
    default: return null;
  }
}

function emitEventExprComponentF32(args: {
  readonly ctx: LoweringCtx;
  readonly builtins: LoweringBuiltins;
  readonly source: NagaSourceMapEntryIR;
  readonly expr: Extract<ValueExpr, { kind: 'event' }>;
  readonly emitFromExprInput: MaterializeExprInputEmitter;
}): number | null {
  if (args.expr.eventKind === 'const') return emitLiteralF32(args.ctx, args.builtins, args.expr.fired ? 1 : 0, args.source);
  if (args.expr.eventKind === 'never') return emitLiteralF32(args.ctx, args.builtins, 0, args.source);
  if (args.expr.eventKind === 'pulse') return emitLiteralF32(args.ctx, args.builtins, 1, args.source);
  if (args.expr.eventKind === 'wrap') return args.emitFromExprInput(args.expr.input, 0);
  if (args.expr.eventKind !== 'combine') return emitLiteralF32(args.ctx, args.builtins, 0, args.source);
  
  const emittedInputs: number[] = [];
  for (const inputExprId of args.expr.inputs) {
    const emitted = args.emitFromExprInput(inputExprId, 0);
    if (emitted === null) return null;
    emittedInputs.push(emitted);
  }
  if (emittedInputs.length === 0) return emitLiteralF32(args.ctx, args.builtins, 0, args.source);
  
  let accumulator = emittedInputs[0]!;
  const combineOp: Extract<NagaExpressionIR, { kind: 'binary' }>['op'] = args.expr.mode === 'all' ? 'mul' : 'add';
  for (let i = 1; i < emittedInputs.length; i++) {
    accumulator = args.ctx.addExpression({ kind: 'binary', op: combineOp, left: accumulator, right: emittedInputs[i]! }, args.source);
  }
  const zero = emitLiteralF32(args.ctx, args.builtins, 0, args.source);
  const active = args.ctx.addExpression({ kind: 'binary', op: 'gt', left: accumulator, right: zero }, args.source);
  return emitBoolAsF32(args.ctx, args.builtins, active, args.source);
}

function emitMaterializeExprComponentF32(args: {
  readonly ctx: LoweringCtx;
  readonly builtins: LoweringBuiltins;
  readonly laneExpr: number;
  readonly componentIndex: number;
  readonly exprId: ValueExprId;
  readonly schedule: ScheduleIR;
  readonly runtimeAddressTable: RuntimeAddressTableIR;
  readonly valueExprs: readonly ValueExpr[];
  readonly source: NagaSourceMapEntryIR;
  readonly targetPlan: SlotAddressPlan;
  readonly cache: Map<string, number>;
  readonly depth: number;
}): number | null {
  if (args.depth > 128) return null;
  const cacheKey = `${args.exprId as number}:${args.componentIndex}`;
  const cached = args.cache.get(cacheKey);
  if (cached !== undefined) return cached;

  const expr = args.valueExprs[args.exprId as number];
  if (!expr) return null;
  const component = Math.max(0, args.componentIndex);

  const emitFromExprInput = (inputExprId: ValueExprId, requestedComponent: number): number | null => {
    const inputExpr = args.valueExprs[inputExprId as number];
    const inputStride = inferComponentStride(inputExpr);
    const normalizedComponent = inputStride > 1 ? Math.min(requestedComponent, inputStride - 1) : 0;
    return emitMaterializeExprComponentF32({
      ...args,
      exprId: inputExprId,
      componentIndex: normalizedComponent,
      depth: args.depth + 1,
    });
  };

  let resolved: number | null = null;
  switch (expr.kind) {
    case 'const': {
      const value = expr.value;
      if (value.kind === 'float' || value.kind === 'int') resolved = emitLiteralF32(args.ctx, args.builtins, value.value, args.source);
      else if (value.kind === 'bool') resolved = emitLiteralF32(args.ctx, args.builtins, value.value ? 1 : 0, args.source);
      else if (value.kind === 'vec2') resolved = emitLiteralF32(args.ctx, args.builtins, value.value[Math.min(component, 1)] ?? 0, args.source);
      else if (value.kind === 'color') resolved = emitLiteralF32(args.ctx, args.builtins, value.value[Math.min(component, 3)] ?? 0, args.source);
      break;
    }
    case 'extract': resolved = emitFromExprInput(expr.input, expr.componentIndex); break;
    case 'construct': resolved = expr.components[component] === undefined ? null : emitFromExprInput(expr.components[component]!, 0); break;
    case 'kernel': resolved = emitKernelExprComponentF32({ ctx: args.ctx, builtins: args.builtins, source: args.source, component, expr, emitFromExprInput }); break;
    case 'intrinsic':
      if (expr.intrinsicKind === 'property' && expr.intrinsic === 'index') {
        resolved = args.ctx.addExpression({ kind: 'call', function: 'f32', args: [args.laneExpr] }, args.source);
      } else if (expr.intrinsicKind === 'property' && expr.intrinsic === 'normalizedIndex') {
        const denom = Math.max(1, args.targetPlan.laneCount - 1);
        const inv = emitLiteralF32(args.ctx, args.builtins, 1 / denom, args.source);
        const laneAsFloat = args.ctx.addExpression({ kind: 'call', function: 'f32', args: [args.laneExpr] }, args.source);
        resolved = args.ctx.addExpression({ kind: 'binary', op: 'mul', left: laneAsFloat, right: inv }, args.source);
      }
      break;
    case 'state': {
      const stateSlot = findStateSlotStart(args.schedule, expr.stateKey);
      if (stateSlot !== null) {
        const statePlan = createStateSlotAddressPlan(args.schedule, stateSlot);
        if (statePlan) resolved = emitLoadedF32FromPlan(args.ctx, args.builtins, args.laneExpr, statePlan, 'state_in', component, args.source);
      }
      break;
    }
    case 'time': resolved = emitTimeChannelF32({ ctx: args.ctx, builtins: args.builtins, which: expr.which, componentIndex: component, periodAMs: args.schedule.timeModel.periodAMs, periodBMs: args.schedule.timeModel.periodBMs, source: args.source }); break;
    case 'external': case 'eventRead': resolved = emitLiteralF32(args.ctx, args.builtins, 0, args.source); break;
    case 'event': resolved = emitEventExprComponentF32({ ctx: args.ctx, builtins: args.builtins, source: args.source, expr, emitFromExprInput }); break;
    case 'oklchToRgb': resolved = emitFromExprInput(expr.input, component); break;
  }

  if (resolved === null) {
    const sourceSlot = resolveInputSlotFromExpr(args.exprId as number, args.runtimeAddressTable);
    if (sourceSlot !== null) {
      const sourcePlan = toSlotAddressPlan(args.runtimeAddressTable, sourceSlot);
      if (sourcePlan) resolved = emitLoadedF32FromPlan(args.ctx, args.builtins, args.laneExpr, sourcePlan, 'arena_in', component, args.source);
    }
  }

  if (resolved !== null) args.cache.set(cacheKey, resolved);
  return resolved;
}

function emitMaterializeFromExpression(args: {
  readonly ctx: LoweringCtx;
  readonly builtins: LoweringBuiltins;
  readonly laneExpr: number;
  readonly step: StepMaterialize;
  readonly stepIndex: number;
  readonly schedule: ScheduleIR;
  readonly runtimeAddressTable: RuntimeAddressTableIR;
  readonly valueExprs: readonly ValueExpr[];
  readonly source: NagaSourceMapEntryIR;
  readonly targetPlan: SlotAddressPlan;
}): boolean {
  if (args.targetPlan.storage !== 'f32') return false;
  const cache = new Map<string, number>();

  for (let componentIndex = 0; componentIndex < args.targetPlan.stride; componentIndex++) {
    const valueExpr = emitMaterializeExprComponentF32({
      ...args,
      laneExpr: args.laneExpr, // Target domain passes cleanly via external execution guard
      exprId: args.step.field,
      componentIndex,
      cache,
      depth: 0,
    });
    if (valueExpr === null) return false;
    
    // Write directly using the un-clamped lane index
    const targetIndex = emitAddressIndex(
      args.ctx, args.builtins, args.laneExpr,
      args.targetPlan.offset, args.targetPlan.laneStride, args.targetPlan.componentStride, componentIndex, args.source,
    );
    args.ctx.addStatement(
      { kind: 'store', buffer: 'arena_out', index: targetIndex, value: valueExpr, comment: `step ${args.stepIndex} kind=materialize expr-lowered` },
      args.source,
    );
  }
  return true;
}

function lowerStep(
  ctx: LoweringCtx,
  builtins: LoweringBuiltins,
  laneExpr: number,
  step: Step,
  stepIndex: number,
  schedule: ScheduleIR,
  runtimeAddressTable: RuntimeAddressTableIR,
  valueExprs: readonly ValueExpr[],
  exprToBlock: ReadonlyMap<ValueExprId, BlockId>,
  coverage: LoweringCoverageState,
): void {
  const maybeExprId = getStepExprId(step);
  const source = makeSource(stepIndex, maybeExprId === null ? undefined : (maybeExprId as number), exprToBlock);

  switch (step.kind) {
    case 'materialize': {
      const targetPlan = toSlotAddressPlan(runtimeAddressTable, step.target);
      if (!targetPlan) {
        coverage.droppedComputeStepCount += 1;
        ctx.addStatement({ kind: 'comment', text: `step ${stepIndex}: missing target slot metadata` }, source);
        return;
      }
      const exprId = step.field as number;
      const expr = valueExprs[exprId];
      
      // Masking the execution isolates out-of-bounds threads at the hardware level.
      withTargetLaneGuard(ctx, builtins, laneExpr, targetPlan.laneCount, source, () => {
        if (emitMaterializeFromExpression({
          ctx, builtins, laneExpr, step, stepIndex, schedule, runtimeAddressTable, valueExprs, source, targetPlan,
        })) return;
        
        const sourceBinding = resolveStepInputSlot(step, expr, schedule, runtimeAddressTable);
        if (!sourceBinding) {
          coverage.droppedComputeStepCount += 1;
          ctx.addStatement({ kind: 'comment', text: `step ${stepIndex}: unresolved source` }, source);
          return;
        }

        const sourcePlan = sourceBinding.buffer === 'state_in'
          ? createStateSlotAddressPlan(schedule, sourceBinding.slotOrStateOffset as number)
          : toSlotAddressPlan(runtimeAddressTable, sourceBinding.slotOrStateOffset as ValueSlot);
        if (!sourcePlan) {
          coverage.droppedComputeStepCount += 1;
          ctx.addStatement({ kind: 'comment', text: `step ${stepIndex}: missing source metadata` }, source);
          return;
        }

        emitTypedCopy(ctx, builtins, laneExpr, sourcePlan, sourceBinding.buffer, targetPlan, 'arena_out', source, `step ${stepIndex} kind=${step.kind}`);
      });
      return;
    }

    case 'continuityApply': {
      const sourcePlan = toSlotAddressPlan(runtimeAddressTable, step.baseSlot);
      const targetPlan = toSlotAddressPlan(runtimeAddressTable, step.outputSlot);
      if (!sourcePlan || !targetPlan) {
        coverage.droppedComputeStepCount += 1;
        ctx.addStatement({ kind: 'comment', text: `step ${stepIndex}: continuityApply missing slot metadata` }, source);
        return;
      }
      withTargetLaneGuard(ctx, builtins, laneExpr, targetPlan.laneCount, source, () => {
        emitTypedCopy(ctx, builtins, laneExpr, sourcePlan, 'arena_in', targetPlan, 'arena_out', source, `step ${stepIndex} kind=continuityApply`);
      });
      return;
    }

    case 'stateWrite':
    case 'fieldStateWrite': {
      const sourceSlot = resolveInputSlotFromExpr(step.value as number, runtimeAddressTable);
      if (sourceSlot === null) {
        coverage.droppedComputeStepCount += 1;
        ctx.addStatement({ kind: 'comment', text: `step ${stepIndex}: state write missing source slot` }, source);
        return;
      }
      const sourcePlan = toSlotAddressPlan(runtimeAddressTable, sourceSlot);
      const targetPlan = createStateSlotAddressPlan(schedule, step.stateSlot as number);
      if (!sourcePlan || !targetPlan) {
        coverage.droppedComputeStepCount += 1;
        ctx.addStatement({ kind: 'comment', text: `step ${stepIndex}: state write missing metadata` }, source);
        return;
      }
      withTargetLaneGuard(ctx, builtins, laneExpr, targetPlan.laneCount, source, () => {
        emitTypedCopy(ctx, builtins, laneExpr, sourcePlan, 'arena_out', targetPlan, 'state_out', source, `step ${stepIndex} kind=${step.kind}`);
      });
      return;
    }

    case 'eventDispatch':
    case 'continuityMapBuild':
    case 'render': {
      coverage.boundaryStepCount += 1;
      return;
    }
  }
}

function lowerComputeStepsBlock(args: {
  readonly ctx: LoweringCtx;
  readonly builtins: LoweringBuiltins;
  readonly laneExpr: number;
  readonly schedule: ScheduleIR;
  readonly runtimeAddressTable: RuntimeAddressTableIR;
  readonly valueExprs: readonly ValueExpr[];
  readonly exprToBlock: ReadonlyMap<ValueExprId, BlockId>;
  readonly coverage: LoweringCoverageState;
}): readonly number[] {
  const steps = args.schedule.steps as readonly Step[];
  return args.ctx.withBlock(() => {
    for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
      lowerStep(args.ctx, args.builtins, args.laneExpr, steps[stepIndex], stepIndex, args.schedule, args.runtimeAddressTable, args.valueExprs, args.exprToBlock, args.coverage);
    }
  }).block;
}

function emitLaneBoundsGuard(args: {
  readonly ctx: LoweringCtx;
  readonly laneExpr: number;
  readonly loweredStepBlock: readonly number[];
  readonly maxActiveLanes: number;
  readonly builtins: LoweringBuiltins;
}): void {
  const guardSource: NagaSourceMapEntryIR = { blockId: null, stepIndex: -1 };
  const maxLaneExpr = args.ctx.addExpression(
    { kind: 'constant', constant: args.ctx.internNumberConstant(args.builtins.u32Type, args.maxActiveLanes) },
    guardSource,
  );
  const laneInBoundsExpr = args.ctx.addExpression(
    { kind: 'binary', op: 'lt', left: args.laneExpr, right: maxLaneExpr },
    guardSource,
  );
  const rejectBlock = args.ctx.withBlock(() => {
    args.ctx.addStatement({ kind: 'return' }, guardSource);
  }).block;
  args.ctx.addStatement(
    { kind: 'if', condition: laneInBoundsExpr, accept: args.loweredStepBlock, reject: rejectBlock },
    guardSource,
  );
}

export function lowerScheduleToNagaModule(args: {
  readonly schedule: ScheduleIR;
  readonly runtimeAddressTable: RuntimeAddressTableIR;
  readonly valueExprs: readonly ValueExpr[];
  readonly exprToBlock: ReadonlyMap<ValueExprId, BlockId>;
}): NagaLoweringProgramIR {
  const ctx = new LoweringCtx();
  const coverage: LoweringCoverageState = { boundaryStepCount: 0, droppedComputeStepCount: 0 };
  const builtins = registerBuiltinTypes(ctx);
  registerBuiltinGlobals(ctx, builtins);

  const functionArgs: readonly NagaFunctionArgumentIR[] = [
    { name: 'global_id', type: builtins.vec3U32Type, builtin: 'global_invocation_id' },
  ];
  const globalIdExpr = ctx.addExpression({ kind: 'argument', argument: 0 }, { blockId: null, stepIndex: -1 });
  const laneExpr = ctx.addExpression({ kind: 'access_index', base: globalIdExpr, index: 0 }, { blockId: null, stepIndex: -1 });

  const steps = args.schedule.steps as readonly Step[];
  const loweredStepBlock = lowerComputeStepsBlock({
    ctx, builtins, laneExpr, schedule: args.schedule, runtimeAddressTable: args.runtimeAddressTable, valueExprs: args.valueExprs, exprToBlock: args.exprToBlock, coverage,
  });
  
  const maxActiveLanes = deriveMaxActiveLanes({ schedule: args.schedule, runtimeAddressTable: args.runtimeAddressTable });
  emitLaneBoundsGuard({ ctx, laneExpr, loweredStepBlock, maxActiveLanes, builtins });

  const mainFunction = ctx.emitFunction('compute_main', functionArgs);

  return {
    module: {
      types: ctx.types.toArray(),
      constants: ctx.constants.toArray(),
      global_variables: ctx.globals,
      functions: [mainFunction],
      entry_points: [{ stage: 'compute', function: 'compute_main', workgroupSize: [64, 1, 1] }],
    },
    sourceMap: ctx.sourceMap,
    compute: { maxActiveLanes },
    coverage: {
      totalStepCount: steps.length,
      boundaryStepCount: coverage.boundaryStepCount,
      droppedComputeStepCount: coverage.droppedComputeStepCount,
    },
  };
}

```