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
  | 'abs'
  | 'atan2'
  | 'ceil'
  | 'clamp'
  | 'cos'
  | 'exp'
  | 'f32'
  | 'floor'
  | 'fract'
  | 'log'
  | 'max'
  | 'min'
  | 'pow'
  | 'round'
  | 'select'
  | 'sign'
  | 'sin'
  | 'sqrt'
  | 'tan'
  | 'trunc';

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
  | {
      readonly kind: 'comment';
      readonly text: string;
    }
  | {
      readonly kind: 'if';
      readonly condition: number;
      readonly accept: NagaBlockIR;
      readonly reject: NagaBlockIR;
    }
  | {
      readonly kind: 'loop';
      readonly body: NagaBlockIR;
    }
  | {
      readonly kind: 'break';
    }
  | {
      readonly kind: 'continue';
    }
  | {
      readonly kind: 'return';
    };

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
    {
      name: 'arena_in',
      storageClass: 'storage',
      access: 'read',
      binding: { group: 0, binding: 0 },
      type: builtins.arrayF32Type,
    },
    {
      name: 'arena_out',
      storageClass: 'storage',
      access: 'read_write',
      binding: { group: 0, binding: 1 },
      type: builtins.arrayF32Type,
    },
    {
      name: 'state_in',
      storageClass: 'storage',
      access: 'read',
      binding: { group: 0, binding: 2 },
      type: builtins.arrayF32Type,
    },
    {
      name: 'state_out',
      storageClass: 'storage',
      access: 'read_write',
      binding: { group: 0, binding: 3 },
      type: builtins.arrayF32Type,
    },
    {
      name: 'uniforms',
      storageClass: 'uniform',
      access: 'read',
      binding: { group: 0, binding: 4 },
      type: builtins.uniformsType,
    },
  );
}

function getStepExprId(step: Step): ValueExprId | null {
  switch (step.kind) {
    case 'eventDispatch':
      return step.expr;
    case 'materialize':
      return step.field;
    case 'stateWrite':
    case 'fieldStateWrite':
      return step.value;
    case 'render':
      return null;
    case 'continuityApply':
    case 'continuityMapBuild':
      return null;
    default: {
      const _exhaustive: never = step;
      void _exhaustive;
      return null;
    }
  }
}

function makeSource(stepIndex: number, exprId: number | undefined, exprToBlock: ReadonlyMap<ValueExprId, BlockId>): NagaSourceMapEntryIR {
  const blockId = exprId !== undefined ? exprToBlock.get(exprId as ValueExprId) ?? null : null;
  return {
    blockId,
    stepIndex,
    exprId,
  };
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
        case 'map':
          return [expr.input as number];
        case 'zip':
          return expr.inputs.map((id) => id as number);
        case 'zipPromote':
          return [expr.field as number, ...expr.ones.map((id) => id as number)];
        case 'broadcast':
          return [expr.one as number, ...(expr.oneComponents ?? []).map((id) => id as number)];
        case 'reduce':
          return [expr.field as number];
        case 'pathDerivative':
          return [expr.field as number];
        case 'pathSample':
          return [expr.controlPoints as number, expr.tField as number];
        default: {
          const _exhaustive: never = expr;
          void _exhaustive;
          return [];
        }
      }
    case 'extract':
      return [expr.input as number];
    case 'construct':
      return expr.components.map((id) => id as number);
    case 'hslToRgb':
      return [expr.input as number];
    case 'event':
      switch (expr.eventKind) {
        case 'wrap':
          return [expr.input as number];
        case 'combine':
          return expr.inputs.map((id) => id as number);
        case 'pulse':
        case 'never':
        case 'const':
          return [];
        default: {
          const _exhaustive: never = expr;
          void _exhaustive;
          return [];
        }
      }
    default:
      return [];
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
    // [LAW:one-source-of-truth] Materialize source resolution can use the
    // compiler-owned fieldExpr→slot map when expression inputs are structural.
    return { buffer: 'arena_in', slotOrStateOffset: fieldSlot, resolution: 'field_slot' };
  }
  // [LAW:no-silent-fallbacks] Lowering no longer derives implicit source slots
  // from output expressions; unsupported dataflow must fail at compile boundary.
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
  const baseConst = ctx.addExpression(
    { kind: 'constant', constant: ctx.internNumberConstant(builtins.u32Type, baseOffset) },
    source,
  );
  const laneStrideConst = ctx.addExpression(
    { kind: 'constant', constant: ctx.internNumberConstant(builtins.u32Type, laneStride) },
    source,
  );
  const laneOffset = ctx.addExpression(
    { kind: 'binary', op: 'mul', left: laneExpr, right: laneStrideConst },
    source,
  );
  const componentConst = ctx.addExpression(
    { kind: 'constant', constant: ctx.internNumberConstant(builtins.u32Type, componentIndex) },
    source,
  );
  const componentStrideConst = ctx.addExpression(
    { kind: 'constant', constant: ctx.internNumberConstant(builtins.u32Type, componentStride) },
    source,
  );
  const componentOffset = ctx.addExpression(
    { kind: 'binary', op: 'mul', left: componentConst, right: componentStrideConst },
    source,
  );
  const basePlusLane = ctx.addExpression(
    { kind: 'binary', op: 'add', left: baseConst, right: laneOffset },
    source,
  );
  return ctx.addExpression(
    { kind: 'binary', op: 'add', left: basePlusLane, right: componentOffset },
    source,
  );
}

function resolveLaneExprForPlan(
  ctx: LoweringCtx,
  builtins: LoweringBuiltins,
  laneExpr: number,
  plan: SlotAddressPlan,
  source: NagaSourceMapEntryIR,
): number {
  if (plan.laneCount > 1) {
    return laneExpr;
  }
  return ctx.addExpression(
    { kind: 'constant', constant: ctx.internNumberConstant(builtins.u32Type, 0) },
    source,
  );
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
  const sourceLaneExpr = resolveLaneExprForPlan(ctx, builtins, laneExpr, sourcePlan, source);
  const targetLaneExpr = resolveLaneExprForPlan(ctx, builtins, laneExpr, targetPlan, source);
  // [LAW:dataflow-not-control-flow] Lowering always emits the same per-component
  // sequence; lane participation is encoded as data in address expressions.
  for (let componentIndex = 0; componentIndex < componentCount; componentIndex++) {
    const sourceIndex = emitAddressIndex(
      ctx,
      builtins,
      sourceLaneExpr,
      sourcePlan.offset,
      sourcePlan.laneStride,
      sourcePlan.componentStride,
      componentIndex,
      source,
    );
    const targetIndex = emitAddressIndex(
      ctx,
      builtins,
      targetLaneExpr,
      targetPlan.offset,
      targetPlan.laneStride,
      targetPlan.componentStride,
      componentIndex,
      source,
    );

    const loaded = ctx.addExpression(
      { kind: 'buffer_load', buffer: sourceBuffer, index: sourceIndex },
      source,
    );

    // [LAW:one-source-of-truth] Handle storage semantics are centralized here:
    // f32 arena buffers transport u32 handles via explicit bitcasts.
    const typedRead = sourcePlan.storage === 'u32'
      ? ctx.addExpression({ kind: 'as', to: 'u32', expr: loaded }, source)
      : loaded;
    const storeValue = targetPlan.storage === 'u32'
      ? ctx.addExpression({ kind: 'as', to: 'f32', expr: typedRead }, source)
      : typedRead;

    ctx.addStatement(
      {
        kind: 'store',
        buffer: targetBuffer,
        index: targetIndex,
        value: storeValue,
        comment,
      },
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

function emitLiteralF32(
  ctx: LoweringCtx,
  builtins: LoweringBuiltins,
  value: number,
  source: NagaSourceMapEntryIR,
): number {
  return ctx.addExpression(
    { kind: 'constant', constant: ctx.internNumberConstant(builtins.f32Type, value) },
    source,
  );
}

const UNIFORMS_TIME_VEC_INDEX = 4;
const UNIFORMS_TIME_SECONDS_COMPONENT = 2;
const UNIFORMS_DELTA_SECONDS_COMPONENT = 3;
const TWO_PI_F32 = Math.PI * 2;

function emitUniformVec4(
  ctx: LoweringCtx,
  builtins: LoweringBuiltins,
  vecIndex: number,
  source: NagaSourceMapEntryIR,
): number {
  const uniformIndex = ctx.addExpression(
    { kind: 'constant', constant: ctx.internNumberConstant(builtins.u32Type, vecIndex) },
    source,
  );
  return ctx.addExpression(
    { kind: 'buffer_load', buffer: 'uniforms', index: uniformIndex },
    source,
  );
}

function emitUniformComponentF32(
  ctx: LoweringCtx,
  builtins: LoweringBuiltins,
  vecIndex: number,
  componentIndex: 0 | 1 | 2 | 3,
  source: NagaSourceMapEntryIR,
): number {
  const uniformVec = emitUniformVec4(ctx, builtins, vecIndex, source);
  return ctx.addExpression({ kind: 'access_index', base: uniformVec, index: componentIndex }, source);
}

function emitRuntimeTimeMsF32(
  ctx: LoweringCtx,
  builtins: LoweringBuiltins,
  source: NagaSourceMapEntryIR,
): number {
  const timeSeconds = emitUniformComponentF32(
    ctx,
    builtins,
    UNIFORMS_TIME_VEC_INDEX,
    UNIFORMS_TIME_SECONDS_COMPONENT,
    source,
  );
  const oneThousand = emitLiteralF32(ctx, builtins, 1000, source);
  return ctx.addExpression({ kind: 'binary', op: 'mul', left: timeSeconds, right: oneThousand }, source);
}

function emitRuntimeDeltaMsF32(
  ctx: LoweringCtx,
  builtins: LoweringBuiltins,
  source: NagaSourceMapEntryIR,
): number {
  const dtSeconds = emitUniformComponentF32(
    ctx,
    builtins,
    UNIFORMS_TIME_VEC_INDEX,
    UNIFORMS_DELTA_SECONDS_COMPONENT,
    source,
  );
  const oneThousand = emitLiteralF32(ctx, builtins, 1000, source);
  return ctx.addExpression({ kind: 'binary', op: 'mul', left: dtSeconds, right: oneThousand }, source);
}

function emitPhaseFromRuntimeTime(
  ctx: LoweringCtx,
  builtins: LoweringBuiltins,
  periodMs: number,
  source: NagaSourceMapEntryIR,
): number {
  if (!Number.isFinite(periodMs) || periodMs <= 0) {
    return emitLiteralF32(ctx, builtins, 0, source);
  }
  const timeMs = emitRuntimeTimeMsF32(ctx, builtins, source);
  const invPeriod = emitLiteralF32(ctx, builtins, 1 / periodMs, source);
  const phaseUnwrapped = ctx.addExpression({ kind: 'binary', op: 'mul', left: timeMs, right: invPeriod }, source);
  return emitBuiltinCall(ctx, 'fract', [phaseUnwrapped], source);
}

function emitPaletteComponentFromPhase(
  ctx: LoweringCtx,
  builtins: LoweringBuiltins,
  phaseA: number,
  componentIndex: number,
  source: NagaSourceMapEntryIR,
): number {
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
  if (which === 'tMs') {
    return emitRuntimeTimeMsF32(ctx, builtins, source);
  }
  if (which === 'dt') {
    return emitRuntimeDeltaMsF32(ctx, builtins, source);
  }
  if (which === 'phaseA') {
    return emitPhaseFromRuntimeTime(ctx, builtins, periodAMs, source);
  }
  if (which === 'phaseB') {
    return emitPhaseFromRuntimeTime(ctx, builtins, periodBMs, source);
  }
  if (which === 'progress') {
    return emitLiteralF32(ctx, builtins, 0, source);
  }
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
  if (plan.storage !== 'f32') {
    return null;
  }
  const laneForPlan = resolveLaneExprForPlan(ctx, builtins, laneExpr, plan, source);
  const address = emitAddressIndex(
    ctx,
    builtins,
    laneForPlan,
    plan.offset,
    plan.laneStride,
    plan.componentStride,
    componentIndex,
    source,
  );
  return ctx.addExpression({ kind: 'buffer_load', buffer, index: address }, source);
}

function emitBuiltinCall(
  ctx: LoweringCtx,
  fn: NagaBuiltinCallNameIR,
  args: readonly number[],
  source: NagaSourceMapEntryIR,
): number {
  return ctx.addExpression({ kind: 'call', function: fn, args }, source);
}

function emitBoolAsF32(
  ctx: LoweringCtx,
  builtins: LoweringBuiltins,
  condition: number,
  source: NagaSourceMapEntryIR,
): number {
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

function emitPureFnF32(
  ctx: LoweringCtx,
  builtins: LoweringBuiltins,
  fn: PureFn,
  inputExprs: readonly number[],
  source: NagaSourceMapEntryIR,
): number | null {
  if (inputExprs.length === 0) return null;
  if (fn.kind !== 'opcode') return null;

  const reduceBinary = (op: Extract<NagaExpressionIR, { kind: 'binary' }>['op']): number | null => {
    if (!expectMinArity(inputExprs, 1)) return null;
    let acc = inputExprs[0]!;
    for (let i = 1; i < inputExprs.length; i++) {
      acc = ctx.addExpression({ kind: 'binary', op, left: acc, right: inputExprs[i]! }, source);
    }
    return acc;
  };

  const reduceCall = (name: NagaBuiltinCallNameIR): number | null => {
    if (!expectMinArity(inputExprs, 1)) return null;
    let acc = inputExprs[0]!;
    for (let i = 1; i < inputExprs.length; i++) {
      acc = emitBuiltinCall(ctx, name, [acc, inputExprs[i]!], source);
    }
    return acc;
  };

  switch (fn.opcode) {
    case OpCode.Add:
      return reduceBinary('add');
    case OpCode.Sub:
      return expectArity(inputExprs, 2)
        ? ctx.addExpression({ kind: 'binary', op: 'sub', left: inputExprs[0]!, right: inputExprs[1]! }, source)
        : null;
    case OpCode.Mul:
      return reduceBinary('mul');
    case OpCode.Div:
      return expectArity(inputExprs, 2)
        ? ctx.addExpression({ kind: 'binary', op: 'div', left: inputExprs[0]!, right: inputExprs[1]! }, source)
        : null;
    case OpCode.Mod:
      return expectArity(inputExprs, 2)
        ? ctx.addExpression({ kind: 'binary', op: 'mod', left: inputExprs[0]!, right: inputExprs[1]! }, source)
        : null;
    case OpCode.Pow:
      return expectArity(inputExprs, 2)
        ? emitBuiltinCall(ctx, 'pow', [inputExprs[0]!, inputExprs[1]!], source)
        : null;
    case OpCode.Neg: {
      if (!expectArity(inputExprs, 1)) return null;
      const zero = emitLiteralF32(ctx, builtins, 0, source);
      return ctx.addExpression({ kind: 'binary', op: 'sub', left: zero, right: inputExprs[0]! }, source);
    }
    case OpCode.Abs:
      return expectArity(inputExprs, 1) ? emitBuiltinCall(ctx, 'abs', [inputExprs[0]!], source) : null;

    case OpCode.Sin:
      return expectArity(inputExprs, 1) ? emitBuiltinCall(ctx, 'sin', [inputExprs[0]!], source) : null;
    case OpCode.Cos:
      return expectArity(inputExprs, 1) ? emitBuiltinCall(ctx, 'cos', [inputExprs[0]!], source) : null;
    case OpCode.Tan:
      return expectArity(inputExprs, 1) ? emitBuiltinCall(ctx, 'tan', [inputExprs[0]!], source) : null;
    case OpCode.Atan2:
      return expectArity(inputExprs, 2)
        ? emitBuiltinCall(ctx, 'atan2', [inputExprs[0]!, inputExprs[1]!], source)
        : null;

    case OpCode.Min:
      return reduceCall('min');
    case OpCode.Max:
      return reduceCall('max');
    case OpCode.Avg: {
      if (!expectMinArity(inputExprs, 1)) return null;
      const sum = reduceBinary('add');
      if (sum === null) return null;
      const invN = emitLiteralF32(ctx, builtins, 1 / inputExprs.length, source);
      return ctx.addExpression({ kind: 'binary', op: 'mul', left: sum, right: invN }, source);
    }
    case OpCode.Last:
      return expectMinArity(inputExprs, 1) ? inputExprs[inputExprs.length - 1]! : null;
    case OpCode.Clamp:
      return expectArity(inputExprs, 3)
        ? emitBuiltinCall(ctx, 'clamp', [inputExprs[0]!, inputExprs[1]!, inputExprs[2]!], source)
        : null;
    case OpCode.Lerp: {
      if (!expectArity(inputExprs, 3)) return null;
      const one = emitLiteralF32(ctx, builtins, 1, source);
      const oneMinusT = ctx.addExpression({ kind: 'binary', op: 'sub', left: one, right: inputExprs[2]! }, source);
      const lhs = ctx.addExpression({ kind: 'binary', op: 'mul', left: inputExprs[0]!, right: oneMinusT }, source);
      const rhs = ctx.addExpression({ kind: 'binary', op: 'mul', left: inputExprs[1]!, right: inputExprs[2]! }, source);
      return ctx.addExpression({ kind: 'binary', op: 'add', left: lhs, right: rhs }, source);
    }

    case OpCode.Eq: {
      if (!expectArity(inputExprs, 2)) return null;
      const condition = ctx.addExpression(
        { kind: 'binary', op: 'eq', left: inputExprs[0]!, right: inputExprs[1]! },
        source,
      );
      return emitBoolAsF32(ctx, builtins, condition, source);
    }
    case OpCode.Lt: {
      if (!expectArity(inputExprs, 2)) return null;
      const condition = ctx.addExpression(
        { kind: 'binary', op: 'lt', left: inputExprs[0]!, right: inputExprs[1]! },
        source,
      );
      return emitBoolAsF32(ctx, builtins, condition, source);
    }
    case OpCode.Gt: {
      if (!expectArity(inputExprs, 2)) return null;
      const condition = ctx.addExpression(
        { kind: 'binary', op: 'gt', left: inputExprs[0]!, right: inputExprs[1]! },
        source,
      );
      return emitBoolAsF32(ctx, builtins, condition, source);
    }

    case OpCode.Wrap01:
      return expectArity(inputExprs, 1) ? emitBuiltinCall(ctx, 'fract', [inputExprs[0]!], source) : null;
    case OpCode.Hash: {
      if (!expectArity(inputExprs, 2)) return null;
      const valueScale = emitLiteralF32(ctx, builtins, 12.9898, source);
      const seedScale = emitLiteralF32(ctx, builtins, 78.233, source);
      const hashScale = emitLiteralF32(ctx, builtins, 43758.5453123, source);
      const valueTerm = ctx.addExpression({ kind: 'binary', op: 'mul', left: inputExprs[0]!, right: valueScale }, source);
      const seedTerm = ctx.addExpression({ kind: 'binary', op: 'mul', left: inputExprs[1]!, right: seedScale }, source);
      const phase = ctx.addExpression({ kind: 'binary', op: 'add', left: valueTerm, right: seedTerm }, source);
      const wave = emitBuiltinCall(ctx, 'sin', [phase], source);
      const scaled = ctx.addExpression({ kind: 'binary', op: 'mul', left: wave, right: hashScale }, source);
      return emitBuiltinCall(ctx, 'fract', [scaled], source);
    }

    case OpCode.Floor:
      return expectArity(inputExprs, 1) ? emitBuiltinCall(ctx, 'floor', [inputExprs[0]!], source) : null;
    case OpCode.Ceil:
      return expectArity(inputExprs, 1) ? emitBuiltinCall(ctx, 'ceil', [inputExprs[0]!], source) : null;
    case OpCode.Round:
      return expectArity(inputExprs, 1) ? emitBuiltinCall(ctx, 'round', [inputExprs[0]!], source) : null;
    case OpCode.Fract:
      return expectArity(inputExprs, 1) ? emitBuiltinCall(ctx, 'fract', [inputExprs[0]!], source) : null;
    case OpCode.Sqrt:
      return expectArity(inputExprs, 1) ? emitBuiltinCall(ctx, 'sqrt', [inputExprs[0]!], source) : null;
    case OpCode.Exp:
      return expectArity(inputExprs, 1) ? emitBuiltinCall(ctx, 'exp', [inputExprs[0]!], source) : null;
    case OpCode.Log:
      return expectArity(inputExprs, 1) ? emitBuiltinCall(ctx, 'log', [inputExprs[0]!], source) : null;
    case OpCode.Sign:
      return expectArity(inputExprs, 1) ? emitBuiltinCall(ctx, 'sign', [inputExprs[0]!], source) : null;

    case OpCode.Select: {
      if (!expectArity(inputExprs, 3)) return null;
      const zero = emitLiteralF32(ctx, builtins, 0, source);
      const condition = ctx.addExpression({ kind: 'binary', op: 'gt', left: inputExprs[0]!, right: zero }, source);
      return emitBuiltinCall(ctx, 'select', [inputExprs[2]!, inputExprs[1]!, condition], source);
    }

    case OpCode.Identity:
      return expectArity(inputExprs, 1) ? inputExprs[0]! : null;

    case OpCode.F64ToI32Trunc: {
      if (!expectArity(inputExprs, 1)) return null;
      const minI32 = emitLiteralF32(ctx, builtins, -2147483648, source);
      const maxI32 = emitLiteralF32(ctx, builtins, 2147483647, source);
      const maxFiniteF32 = emitLiteralF32(ctx, builtins, 3.4028234663852886e38, source);
      const truncated = emitBuiltinCall(ctx, 'trunc', [inputExprs[0]!], source);
      const clamped = emitBuiltinCall(ctx, 'clamp', [truncated, minI32, maxI32], source);
      const absValue = emitBuiltinCall(ctx, 'abs', [inputExprs[0]!], source);
      const finiteCondition = ctx.addExpression(
        { kind: 'binary', op: 'le', left: absValue, right: maxFiniteF32 },
        source,
      );
      const zero = emitLiteralF32(ctx, builtins, 0, source);
      const normalizedClamped = ctx.addExpression(
        { kind: 'binary', op: 'add', left: clamped, right: zero },
        source,
      );
      return emitBuiltinCall(ctx, 'select', [zero, normalizedClamped, finiteCondition], source);
    }
    case OpCode.I32ToF64:
      return expectArity(inputExprs, 1) ? inputExprs[0]! : null;

    default: {
      const _exhaustive: never = fn.opcode;
      void _exhaustive;
      return null;
    }
  }
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
    const normalizedComponent = inputStride > 1
      ? Math.min(requestedComponent, inputStride - 1)
      : 0;
    return emitMaterializeExprComponentF32({
      ...args,
      exprId: inputExprId,
      componentIndex: normalizedComponent,
      depth: args.depth + 1,
    });
  };

  const resolved: number | null = (() => {
    switch (expr.kind) {
      case 'const': {
        const value = expr.value;
        if (value.kind === 'float' || value.kind === 'int') {
          return emitLiteralF32(args.ctx, args.builtins, value.value, args.source);
        }
        if (value.kind === 'bool') {
          return emitLiteralF32(args.ctx, args.builtins, value.value ? 1 : 0, args.source);
        }
        if (value.kind === 'vec2') {
          const scalar = value.value[Math.min(component, 1)] ?? 0;
          return emitLiteralF32(args.ctx, args.builtins, scalar, args.source);
        }
        if (value.kind === 'color') {
          const rgba = value.value;
          const scalar = rgba[Math.min(component, 3)] ?? 0;
          return emitLiteralF32(args.ctx, args.builtins, scalar, args.source);
        }
        return null;
      }
      case 'extract':
        return emitFromExprInput(expr.input, expr.componentIndex);
      case 'construct': {
        const componentExpr = expr.components[component];
        if (componentExpr === undefined) return null;
        return emitFromExprInput(componentExpr, 0);
      }
      case 'kernel': {
        switch (expr.kernelKind) {
          case 'broadcast': {
            const explicit = expr.oneComponents?.[component];
            if (explicit !== undefined) {
              return emitFromExprInput(explicit, 0);
            }
            return emitFromExprInput(expr.one, component);
          }
          case 'map': {
            const input = emitFromExprInput(expr.input, component);
            if (input === null) return null;
            return emitPureFnF32(args.ctx, args.builtins, expr.fn, [input], args.source);
          }
          case 'zip': {
            const emittedInputs: number[] = [];
            for (const inputExprId of expr.inputs) {
              const emittedInput = emitFromExprInput(inputExprId, component);
              if (emittedInput === null) return null;
              emittedInputs.push(emittedInput);
            }
            return emitPureFnF32(args.ctx, args.builtins, expr.fn, emittedInputs, args.source);
          }
          case 'zipPromote': {
            const emittedInputs: number[] = [];
            const fieldInput = emitFromExprInput(expr.field, component);
            if (fieldInput === null) return null;
            emittedInputs.push(fieldInput);
            for (const one of expr.ones) {
              const oneInput = emitFromExprInput(one, component);
              if (oneInput === null) return null;
              emittedInputs.push(oneInput);
            }
            return emitPureFnF32(args.ctx, args.builtins, expr.fn, emittedInputs, args.source);
          }
          case 'reduce': {
            // [LAW:dataflow-not-control-flow] Keep compute lowering on one
            // canonical path for reduce kernels in this slice; emit deterministic
            // per-lane value rather than dropping the step.
            return emitFromExprInput(expr.field, component);
          }
          case 'pathDerivative': {
            return emitFromExprInput(expr.field, component);
          }
          case 'pathSample': {
            if (expr.op === 'tangentAngle') {
              return emitFromExprInput(expr.tField, 0);
            }
            return emitFromExprInput(expr.controlPoints, component);
          }
          default: {
            const _exhaustive: never = expr;
            void _exhaustive;
            return null;
          }
        }
      }
      case 'intrinsic': {
        if (expr.intrinsicKind !== 'property') return null;
        if (expr.intrinsic === 'index') {
          return args.ctx.addExpression({ kind: 'call', function: 'f32', args: [args.laneExpr] }, args.source);
        }
        if (expr.intrinsic === 'normalizedIndex') {
          const denom = Math.max(1, args.targetPlan.laneCount - 1);
          const inv = emitLiteralF32(args.ctx, args.builtins, 1 / denom, args.source);
          const laneAsFloat = args.ctx.addExpression(
            { kind: 'call', function: 'f32', args: [args.laneExpr] },
            args.source,
          );
          return args.ctx.addExpression({ kind: 'binary', op: 'mul', left: laneAsFloat, right: inv }, args.source);
        }
        return null;
      }
      case 'state': {
        const stateSlot = findStateSlotStart(args.schedule, expr.stateKey);
        if (stateSlot === null) return null;
        const statePlan = createStateSlotAddressPlan(args.schedule, stateSlot);
        if (!statePlan) return null;
        return emitLoadedF32FromPlan(
          args.ctx,
          args.builtins,
          args.laneExpr,
          statePlan,
          'state_in',
          component,
          args.source,
        );
      }
      case 'time':
        return emitTimeChannelF32({
          ctx: args.ctx,
          builtins: args.builtins,
          which: expr.which,
          componentIndex: component,
          periodAMs: args.schedule.timeModel.periodAMs,
          periodBMs: args.schedule.timeModel.periodBMs,
          source: args.source,
        });
      case 'external':
        return emitLiteralF32(args.ctx, args.builtins, 0, args.source);
      case 'eventRead':
        return emitLiteralF32(args.ctx, args.builtins, 0, args.source);
      case 'event': {
        if (expr.eventKind === 'const') {
          return emitLiteralF32(args.ctx, args.builtins, expr.fired ? 1 : 0, args.source);
        }
        if (expr.eventKind === 'never') {
          return emitLiteralF32(args.ctx, args.builtins, 0, args.source);
        }
        if (expr.eventKind === 'pulse') {
          return emitLiteralF32(args.ctx, args.builtins, 1, args.source);
        }
        if (expr.eventKind === 'wrap') {
          return emitFromExprInput(expr.input, 0);
        }
        if (expr.eventKind === 'combine') {
          const emittedInputs: number[] = [];
          for (const inputExprId of expr.inputs) {
            const emitted = emitFromExprInput(inputExprId, 0);
            if (emitted === null) return null;
            emittedInputs.push(emitted);
          }
          if (emittedInputs.length === 0) {
            return emitLiteralF32(args.ctx, args.builtins, 0, args.source);
          }
          let accumulator = emittedInputs[0]!;
          for (let i = 1; i < emittedInputs.length; i++) {
            accumulator = args.ctx.addExpression(
              {
                kind: 'binary',
                op: expr.mode === 'all' ? 'mul' : 'add',
                left: accumulator,
                right: emittedInputs[i]!,
              },
              args.source,
            );
          }
          const zero = emitLiteralF32(args.ctx, args.builtins, 0, args.source);
          const active = args.ctx.addExpression(
            { kind: 'binary', op: 'gt', left: accumulator, right: zero },
            args.source,
          );
          return emitBoolAsF32(args.ctx, args.builtins, active, args.source);
        }
        return emitLiteralF32(args.ctx, args.builtins, 0, args.source);
      }
      case 'hslToRgb':
        return emitFromExprInput(expr.input, component);
      default:
        break;
    }

    const sourceSlot = resolveInputSlotFromExpr(args.exprId as number, args.runtimeAddressTable);
    if (sourceSlot === null) {
      return null;
    }
    const sourcePlan = toSlotAddressPlan(args.runtimeAddressTable, sourceSlot);
    if (!sourcePlan) return null;
    return emitLoadedF32FromPlan(
      args.ctx,
      args.builtins,
      args.laneExpr,
      sourcePlan,
      'arena_in',
      component,
      args.source,
    );
  })();

  if (resolved !== null) {
    args.cache.set(cacheKey, resolved);
  }
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
  if (args.targetPlan.storage !== 'f32') {
    return false;
  }
  const cache = new Map<string, number>();
  const targetLaneExpr = resolveLaneExprForPlan(
    args.ctx,
    args.builtins,
    args.laneExpr,
    args.targetPlan,
    args.source,
  );

  for (let componentIndex = 0; componentIndex < args.targetPlan.stride; componentIndex++) {
    const valueExpr = emitMaterializeExprComponentF32({
      ...args,
      exprId: args.step.field,
      componentIndex,
      cache,
      depth: 0,
    });
    if (valueExpr === null) {
      return false;
    }
    const targetIndex = emitAddressIndex(
      args.ctx,
      args.builtins,
      targetLaneExpr,
      args.targetPlan.offset,
      args.targetPlan.laneStride,
      args.targetPlan.componentStride,
      componentIndex,
      args.source,
    );
    args.ctx.addStatement(
      {
        kind: 'store',
        buffer: 'arena_out',
        index: targetIndex,
        value: valueExpr,
        comment: `step ${args.stepIndex} kind=materialize expr-lowered`,
      },
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
  const source = makeSource(
    stepIndex,
    maybeExprId === null ? undefined : (maybeExprId as number),
    exprToBlock,
  );

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
      // [LAW:one-source-of-truth] Compute-owned materialize lowering first
      // lowers from canonical ValueExpr DAG, then falls back to slot-copy path.
      if (emitMaterializeFromExpression({
        ctx,
        builtins,
        laneExpr,
        step,
        stepIndex,
        schedule,
        runtimeAddressTable,
        valueExprs,
        source,
        targetPlan,
      })) {
        return;
      }
      const sourceBinding = resolveStepInputSlot(step, expr, schedule, runtimeAddressTable);
      if (!sourceBinding) {
        coverage.droppedComputeStepCount += 1;
        ctx.addStatement({ kind: 'comment', text: `step ${stepIndex}: unresolved source for ${step.kind}` }, source);
        return;
      }

      const sourcePlan = sourceBinding.buffer === 'state_in'
        ? createStateSlotAddressPlan(schedule, sourceBinding.slotOrStateOffset as number)
        : toSlotAddressPlan(runtimeAddressTable, sourceBinding.slotOrStateOffset as ValueSlot);
      if (!sourcePlan) {
        coverage.droppedComputeStepCount += 1;
        ctx.addStatement({ kind: 'comment', text: `step ${stepIndex}: missing source slot metadata` }, source);
        return;
      }

      emitTypedCopy(
        ctx,
        builtins,
        laneExpr,
        sourcePlan,
        sourceBinding.buffer,
        targetPlan,
        'arena_out',
        source,
        `step ${stepIndex} kind=${step.kind}`,
      );
      return;
    }

    case 'continuityApply': {
      lowerContinuityApply(
        ctx,
        builtins,
        laneExpr,
        step,
        stepIndex,
        runtimeAddressTable,
        source,
        coverage,
      );
      return;
    }

    case 'stateWrite':
    case 'fieldStateWrite': {
      lowerStateWrite(
        ctx,
        builtins,
        laneExpr,
        step,
        stepIndex,
        schedule,
        runtimeAddressTable,
        source,
        coverage,
      );
      return;
    }

    case 'eventDispatch':
    case 'continuityMapBuild':
    case 'render': {
      // [LAW:one-source-of-truth] Non-compute schedule steps are explicit
      // runtime/render boundary work and are intentionally excluded from
      // compute lowering coverage calculations.
      coverage.boundaryStepCount += 1;
      return;
    }

    default: {
      const _exhaustive: never = step;
      void _exhaustive;
    }
  }
}

function lowerContinuityApply(
  ctx: LoweringCtx,
  builtins: LoweringBuiltins,
  laneExpr: number,
  step: StepContinuityApply,
  stepIndex: number,
  runtimeAddressTable: RuntimeAddressTableIR,
  source: NagaSourceMapEntryIR,
  coverage: LoweringCoverageState,
): void {
  const sourcePlan = toSlotAddressPlan(runtimeAddressTable, step.baseSlot);
  const targetPlan = toSlotAddressPlan(runtimeAddressTable, step.outputSlot);
  if (!sourcePlan || !targetPlan) {
    coverage.droppedComputeStepCount += 1;
    ctx.addStatement({ kind: 'comment', text: `step ${stepIndex}: continuityApply missing slot metadata` }, source);
    return;
  }

  emitTypedCopy(
    ctx,
    builtins,
    laneExpr,
    sourcePlan,
    'arena_in',
    targetPlan,
    'arena_out',
    source,
    `step ${stepIndex} kind=continuityApply semantic=${step.semantic}`,
  );
}

function lowerStateWrite(
  ctx: LoweringCtx,
  builtins: LoweringBuiltins,
  laneExpr: number,
  step: StepStateWrite | StepFieldStateWrite,
  stepIndex: number,
  schedule: ScheduleIR,
  runtimeAddressTable: RuntimeAddressTableIR,
  source: NagaSourceMapEntryIR,
  coverage: LoweringCoverageState,
): void {
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
    ctx.addStatement({ kind: 'comment', text: `step ${stepIndex}: state write missing slot metadata` }, source);
    return;
  }

  emitTypedCopy(
    ctx,
    builtins,
    laneExpr,
    sourcePlan,
    'arena_out',
    targetPlan,
    'state_out',
    source,
    `step ${stepIndex} kind=${step.kind}`,
  );
}

export function lowerScheduleToNagaModule(args: {
  readonly schedule: ScheduleIR;
  readonly runtimeAddressTable: RuntimeAddressTableIR;
  readonly valueExprs: readonly ValueExpr[];
  readonly exprToBlock: ReadonlyMap<ValueExprId, BlockId>;
}): NagaLoweringProgramIR {
  const ctx = new LoweringCtx();
  const coverage: LoweringCoverageState = {
    boundaryStepCount: 0,
    droppedComputeStepCount: 0,
  };
  const builtins = registerBuiltinTypes(ctx);
  registerBuiltinGlobals(ctx, builtins);

  // [LAW:single-enforcer] This lowerer is the single owner of ScheduleIR → Naga
  // artifact translation; no other stage emits this module shape.
  const functionArgs: readonly NagaFunctionArgumentIR[] = [
    {
      name: 'global_id',
      type: builtins.vec3U32Type,
      builtin: 'global_invocation_id',
    },
  ];
  const globalIdExpr = ctx.addExpression(
    { kind: 'argument', argument: 0 },
    { blockId: null, stepIndex: -1 },
  );
  const laneExpr = ctx.addExpression(
    { kind: 'access_index', base: globalIdExpr, index: 0 },
    { blockId: null, stepIndex: -1 },
  );

  const steps = args.schedule.steps as readonly Step[];
  const loweredStepBlock = ctx.withBlock(() => {
    for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
      lowerStep(
        ctx,
        builtins,
        laneExpr,
        steps[stepIndex],
        stepIndex,
        args.schedule,
        args.runtimeAddressTable,
        args.valueExprs,
        args.exprToBlock,
        coverage,
      );
    }
  }).block;

  const guardSource: NagaSourceMapEntryIR = { blockId: null, stepIndex: -1 };
  // [LAW:one-source-of-truth] Guard generation and compute metadata share one
  // canonical max-lane derivation to prevent drift across lowering surfaces.
  const maxActiveLanes = deriveMaxActiveLanes({
    schedule: args.schedule,
    runtimeAddressTable: args.runtimeAddressTable,
  });
  const maxLaneExpr = ctx.addExpression(
    {
      kind: 'constant',
      constant: ctx.internNumberConstant(builtins.u32Type, maxActiveLanes),
    },
    guardSource,
  );
  const laneInBoundsExpr = ctx.addExpression(
    {
      kind: 'binary',
      op: 'lt',
      left: laneExpr,
      right: maxLaneExpr,
    },
    guardSource,
  );
  const rejectBlock = ctx.withBlock(() => {
    ctx.addStatement({ kind: 'return' }, guardSource);
  }).block;
  ctx.addStatement(
    {
      kind: 'if',
      condition: laneInBoundsExpr,
      accept: loweredStepBlock,
      reject: rejectBlock,
    },
    guardSource,
  );

  const mainFunction = ctx.emitFunction('compute_main', functionArgs);

  return {
    module: {
      types: ctx.types.toArray(),
      constants: ctx.constants.toArray(),
      global_variables: ctx.globals,
      functions: [mainFunction],
      entry_points: [
        {
          stage: 'compute',
          function: 'compute_main',
          workgroupSize: [64, 1, 1],
        },
      ],
    },
    sourceMap: ctx.sourceMap,
    compute: {
      maxActiveLanes,
    },
    coverage: {
      totalStepCount: steps.length,
      boundaryStepCount: coverage.boundaryStepCount,
      droppedComputeStepCount: coverage.droppedComputeStepCount,
    },
  };
}
