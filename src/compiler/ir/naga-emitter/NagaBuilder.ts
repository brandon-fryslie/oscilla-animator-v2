import type { CanonicalType } from '../../../core/canonical-types';
import {
  NagaArena,
  NagaBinaryOp,
  NagaBlock,
  NagaConstant,
  NagaExpression,
  NagaHandle,
  NagaMathFunction,
  NagaScalarKind,
  NagaStatement,
  NagaType,
} from './naga-types';

export interface BlockContext {
  readonly visualBlockId: string;
  readonly stepIndex?: number;
  readonly exprId?: number;
}

export class ExprHandle {
  public constructor(public readonly nagaHandle: NagaHandle) {}
}

interface StateVariableBinding {
  readonly variableHandle: NagaHandle;
  readonly typeHandle: NagaHandle;
}

interface BufferVariableBinding {
  readonly variableHandle: NagaHandle;
}

const ZERO_MATRIX4: readonly number[] = Object.freeze([
  0, 0, 0, 0,
  0, 0, 0, 0,
  0, 0, 0, 0,
  0, 0, 0, 0,
]);

function scalarTypeKey(kind: NagaScalarKind): string {
  return 'Scalar:' + kind + ':4';
}

function vectorTypeKey(size: 2 | 3 | 4, kind: NagaScalarKind): string {
  return 'Vector:' + String(size) + ':' + kind + ':4';
}

function matrixTypeKey(columns: 2 | 3 | 4, rows: 2 | 3 | 4): string {
  return 'Matrix:' + String(columns) + 'x' + String(rows) + ':4';
}

function isNumericScalar(type: NagaType): boolean {
  return type.kind === 'Scalar' && (
    type.scalar === NagaScalarKind.Float ||
    type.scalar === NagaScalarKind.Sint ||
    type.scalar === NagaScalarKind.Uint
  );
}

function isNumericVector(type: NagaType): boolean {
  return type.kind === 'Vector' && (
    type.scalar === NagaScalarKind.Float ||
    type.scalar === NagaScalarKind.Sint ||
    type.scalar === NagaScalarKind.Uint
  );
}

function isBoolScalar(type: NagaType): boolean {
  return type.kind === 'Scalar' && type.scalar === NagaScalarKind.Bool;
}

function isBoolVector(type: NagaType): boolean {
  return type.kind === 'Vector' && type.scalar === NagaScalarKind.Bool;
}

function isFloatScalar(type: NagaType): boolean {
  return type.kind === 'Scalar' && type.scalar === NagaScalarKind.Float;
}

function isFloatVector(type: NagaType): boolean {
  return type.kind === 'Vector' && type.scalar === NagaScalarKind.Float;
}

function isMixValueType(type: NagaType): boolean {
  return isFloatScalar(type) || isFloatVector(type);
}

function isIntegerScalar(type: NagaType): boolean {
  return type.kind === 'Scalar' && (
    type.scalar === NagaScalarKind.Sint ||
    type.scalar === NagaScalarKind.Uint
  );
}

export class NagaBuilder {
  public readonly expressions = new NagaArena<NagaExpression>();
  public readonly types = new NagaArena<NagaType>();
  public readonly constants = new NagaArena<NagaConstant>();
  public readonly statements = new NagaArena<NagaStatement>();

  // [LAW:one-source-of-truth] Expression handle metadata is authored only here.
  public readonly sourceMap = new Map<NagaHandle, BlockContext>();

  private readonly expressionTypeByHandle = new Map<NagaHandle, NagaHandle>();
  private readonly statementSourceMap = new Map<NagaHandle, BlockContext>();
  private readonly stateVariables = new Map<string, StateVariableBinding>();
  private readonly bufferVariables = new Map<string, BufferVariableBinding>();
  private readonly typeCache = new Map<string, NagaHandle>();

  // [LAW:dataflow-not-control-flow] Statements are appended to the active block in deterministic order.
  private activeBlock: NagaBlock | null = null;
  private rootBlock: NagaBlock | null = null;
  private nextGlobalVariableHandle = 0;

  public buildBlock(callback: () => void): NagaBlock {
    const previousBlock = this.activeBlock;
    const newBlock: NagaHandle[] = [];
    if (this.rootBlock === null) {
      this.rootBlock = newBlock;
    }
    this.activeBlock = newBlock;
    try {
      callback();
    } finally {
      this.activeBlock = previousBlock;
    }
    return newBlock;
  }

  public getRootBlock(): NagaBlock | null {
    return this.rootBlock;
  }

  public loopStatement(body: NagaBlock, meta: BlockContext): void {
    this.emitStatement({ type: 'Loop', body }, meta);
  }

  public ifStatement(condition: ExprHandle, accept: NagaBlock, reject: NagaBlock, meta: BlockContext): void {
    const conditionType = this.types.get(this.requireExpressionType(condition));
    if (!isBoolScalar(conditionType)) {
      throw new Error('NagaBuilder.ifStatement: condition strictly requires bool scalar.');
    }
    this.emitStatement({
      type: 'If',
      condition: condition.nagaHandle,
      accept,
      reject,
    }, meta);
  }

  public breakStatement(meta: BlockContext): void {
    this.emitStatement({ type: 'Break' }, meta);
  }

  public continueStatement(meta: BlockContext): void {
    this.emitStatement({ type: 'Continue' }, meta);
  }

  public literalFloat(value: number, meta: BlockContext): ExprHandle {
    const typeHandle = this.getOrCreateScalarType(NagaScalarKind.Float);
    return this.registerConstantExpression(typeHandle, value, meta);
  }

  public literalInt(value: number, meta: BlockContext): ExprHandle {
    const typeHandle = this.getOrCreateScalarType(NagaScalarKind.Sint);
    return this.registerConstantExpression(typeHandle, Math.trunc(value), meta);
  }

  public literalBool(value: boolean, meta: BlockContext): ExprHandle {
    const typeHandle = this.getOrCreateScalarType(NagaScalarKind.Bool);
    return this.registerConstantExpression(typeHandle, value, meta);
  }

  public literalMatrix4(meta: BlockContext): ExprHandle {
    const matrixType = this.getOrCreateMatrixType(4, 4);
    return this.registerConstantExpression(matrixType, ZERO_MATRIX4, meta);
  }

  public add(left: ExprHandle, right: ExprHandle, meta: BlockContext): ExprHandle {
    return this.binary(NagaBinaryOp.Add, left, right, meta);
  }

  public sub(left: ExprHandle, right: ExprHandle, meta: BlockContext): ExprHandle {
    return this.binary(NagaBinaryOp.Subtract, left, right, meta);
  }

  public mul(left: ExprHandle, right: ExprHandle, meta: BlockContext): ExprHandle {
    return this.binary(NagaBinaryOp.Multiply, left, right, meta);
  }

  public min(a: ExprHandle, b: ExprHandle, meta: BlockContext): ExprHandle {
    return this.math(NagaMathFunction.Min, a, meta, b);
  }

  public max(a: ExprHandle, b: ExprHandle, meta: BlockContext): ExprHandle {
    return this.math(NagaMathFunction.Max, a, meta, b);
  }

  public lerp(a: ExprHandle, b: ExprHandle, t: ExprHandle, meta: BlockContext): ExprHandle {
    const aType = this.requireExpressionType(a);
    const bType = this.requireExpressionType(b);
    const tType = this.requireExpressionType(t);
    const aNagaType = this.types.get(aType);
    const tNagaType = this.types.get(tType);

    // [LAW:single-enforcer] Mix operand compatibility is enforced at the builder boundary.
    if (aType !== bType) {
      throw new Error('NagaBuilder.lerp: type mismatch between a and b.');
    }
    if (!isMixValueType(aNagaType)) {
      throw new Error('NagaBuilder.lerp: a/b must be float scalar or float vector.');
    }
    const hasCompatibleFactorType = tType === aType || isFloatScalar(tNagaType);
    if (!hasCompatibleFactorType) {
      throw new Error('NagaBuilder.lerp: t must be float scalar or match a/b type.');
    }

    return this.math(NagaMathFunction.Mix, a, meta, b, t);
  }

  public select(
    cond: ExprHandle,
    trueVal: ExprHandle,
    falseVal: ExprHandle,
    meta: BlockContext,
  ): ExprHandle {
    const trueType = this.requireExpressionType(trueVal);
    const falseType = this.requireExpressionType(falseVal);
    const condType = this.requireExpressionType(cond);
    const trueNagaType = this.types.get(trueType);
    const condNagaType = this.types.get(condType);

    // [LAW:single-enforcer] Select shape constraints are enforced before IR append.
    if (trueType !== falseType) {
      throw new Error('NagaBuilder.select: type mismatch between trueVal and falseVal.');
    }
    if (!isBoolScalar(condNagaType) && !isBoolVector(condNagaType)) {
      throw new Error('NagaBuilder.select: cond must be bool scalar or bool vector.');
    }
    if (
      trueNagaType.kind === 'Vector' &&
      condNagaType.kind === 'Vector' &&
      condNagaType.scalar === NagaScalarKind.Bool &&
      condNagaType.size !== trueNagaType.size
    ) {
      throw new Error('NagaBuilder.select: bool vector condition size must match value vector size.');
    }
    if (
      trueNagaType.kind !== 'Vector' &&
      condNagaType.kind === 'Vector' &&
      condNagaType.scalar === NagaScalarKind.Bool
    ) {
      throw new Error('NagaBuilder.select: bool vector condition requires vector values.');
    }

    const expr: NagaExpression = {
      type: 'Select',
      condition: cond.nagaHandle,
      accept: trueVal.nagaHandle,
      reject: falseVal.nagaHandle,
    };
    return this.registerExpression(expr, trueType, meta);
  }

  public cast(value: ExprHandle, targetType: CanonicalType, meta: BlockContext): ExprHandle {
    this.requireExpressionType(value);
    const typeHandle = this.resolveNagaType(targetType);
    const expr: NagaExpression = {
      type: 'Compose',
      ty: typeHandle,
      components: [value.nagaHandle],
    };
    return this.registerExpression(expr, typeHandle, meta);
  }

  public readState(stateKey: string, type: CanonicalType, meta: BlockContext): ExprHandle {
    const stateBinding = this.getOrCreateStateVariable(stateKey, type);
    const expr: NagaExpression = {
      type: 'GlobalVariable',
      variable: stateBinding.variableHandle,
    };
    return this.registerExpression(expr, stateBinding.typeHandle, meta);
  }

  public writeState(stateKey: string, value: ExprHandle, meta: BlockContext): void {
    const valueType = this.requireExpressionType(value);
    const existing = this.stateVariables.get(stateKey);
    // [LAW:single-enforcer] State slot type consistency is enforced at this boundary.
    if (existing && existing.typeHandle !== valueType) {
      throw new Error('NagaBuilder.writeState: type mismatch for state key ' + stateKey);
    }
    if (!existing) {
      this.stateVariables.set(stateKey, {
        variableHandle: this.nextGlobalVariableHandle,
        typeHandle: valueType,
      });
      this.nextGlobalVariableHandle += 1;
    }
    this.emitStatement({
      type: 'StoreState',
      stateKey,
      value: value.nagaHandle,
    }, meta);
  }

  public arrayLength(bufferKey: string, meta: BlockContext): ExprHandle {
    const bufferBinding = this.getOrCreateBufferVariable(bufferKey);
    const expr: NagaExpression = {
      type: 'ArrayLength',
      expr: bufferBinding.variableHandle,
    };
    const typeHandle = this.getOrCreateScalarType(NagaScalarKind.Uint);
    return this.registerExpression(expr, typeHandle, meta);
  }

  public bufferRead(bufferKey: string, index: ExprHandle, targetType: CanonicalType, meta: BlockContext): ExprHandle {
    const bufferBinding = this.getOrCreateBufferVariable(bufferKey);
    const indexType = this.types.get(this.requireExpressionType(index));
    if (!isIntegerScalar(indexType)) {
      throw new Error('NagaBuilder.bufferRead: dynamic index must be integer scalar.');
    }

    const accessExpr: NagaExpression = {
      type: 'Access',
      base: bufferBinding.variableHandle,
      index: index.nagaHandle,
    };
    const accessHandle = this.expressions.append(accessExpr);
    this.sourceMap.set(accessHandle, meta);

    const loadExpr: NagaExpression = {
      type: 'Load',
      pointer: accessHandle,
    };
    const targetTypeHandle = this.resolveNagaType(targetType);
    return this.registerExpression(loadExpr, targetTypeHandle, meta);
  }

  public bufferWrite(bufferKey: string, index: ExprHandle, value: ExprHandle, meta: BlockContext): void {
    const bufferBinding = this.getOrCreateBufferVariable(bufferKey);
    const indexType = this.types.get(this.requireExpressionType(index));
    if (!isIntegerScalar(indexType)) {
      throw new Error('NagaBuilder.bufferWrite: dynamic index must be integer scalar.');
    }
    this.requireExpressionType(value);

    const accessExpr: NagaExpression = {
      type: 'Access',
      base: bufferBinding.variableHandle,
      index: index.nagaHandle,
    };
    const pointerHandle = this.expressions.append(accessExpr);
    this.sourceMap.set(pointerHandle, meta);

    this.emitStatement({
      type: 'Store',
      pointer: pointerHandle,
      value: value.nagaHandle,
    }, meta);
  }

  public atomicAdd(bufferKey: string, index: ExprHandle, value: ExprHandle, meta: BlockContext): ExprHandle {
    const bufferBinding = this.getOrCreateBufferVariable(bufferKey);
    const indexType = this.types.get(this.requireExpressionType(index));
    const valueTypeHandle = this.requireExpressionType(value);
    const valueType = this.types.get(valueTypeHandle);

    if (!isIntegerScalar(indexType)) {
      throw new Error('NagaBuilder.atomicAdd: index must be integer scalar.');
    }
    if (!isIntegerScalar(valueType)) {
      throw new Error('NagaBuilder.atomicAdd: value must be int scalar.');
    }

    const accessExpr: NagaExpression = {
      type: 'Access',
      base: bufferBinding.variableHandle,
      index: index.nagaHandle,
    };
    const pointerHandle = this.expressions.append(accessExpr);
    this.sourceMap.set(pointerHandle, meta);

    const atomicExpr: NagaExpression = {
      type: 'AtomicResult',
      kind: 'Add',
      pointer: pointerHandle,
      value: value.nagaHandle,
    };
    return this.registerExpression(atomicExpr, valueTypeHandle, meta);
  }

  public getExpressionType(handle: NagaHandle): NagaHandle | undefined {
    return this.expressionTypeByHandle.get(handle);
  }

  public getExpressionContext(handle: NagaHandle): BlockContext | null {
    return this.sourceMap.get(handle) ?? null;
  }

  public getStatementContext(handle: NagaHandle): BlockContext | null {
    return this.statementSourceMap.get(handle) ?? null;
  }

  private emitStatement(statement: NagaStatement, meta: BlockContext): void {
    const handle = this.statements.append(statement);
    this.statementSourceMap.set(handle, meta);
    if (this.activeBlock !== null) {
      (this.activeBlock as NagaHandle[]).push(handle);
    }
  }

  private math(
    fun: NagaMathFunction,
    arg: ExprHandle,
    meta: BlockContext,
    arg1?: ExprHandle,
    arg2?: ExprHandle,
  ): ExprHandle {
    const argType = this.requireExpressionType(arg);
    const expr: NagaExpression = {
      type: 'Math',
      fun,
      arg: arg.nagaHandle,
      arg1: arg1?.nagaHandle,
      arg2: arg2?.nagaHandle,
    };
    return this.registerExpression(expr, argType, meta);
  }

  private binary(op: NagaBinaryOp, left: ExprHandle, right: ExprHandle, meta: BlockContext): ExprHandle {
    const leftType = this.requireExpressionType(left);
    const rightType = this.requireExpressionType(right);
    const leftNagaType = this.types.get(leftType);

    // [LAW:single-enforcer] Binary operand compatibility is validated here for all builder callsites.
    if (leftType !== rightType) {
      throw new Error('NagaBuilder.binary: operand type mismatch for operation ' + String(op) + '.');
    }
    if (!isNumericScalar(leftNagaType) && !isNumericVector(leftNagaType)) {
      throw new Error('NagaBuilder.binary: invalid operand type ' + leftNagaType.kind + ' for operation ' + String(op) + '.');
    }
    const expr: NagaExpression = {
      type: 'Binary',
      op,
      left: left.nagaHandle,
      right: right.nagaHandle,
    };
    return this.registerExpression(expr, leftType, meta);
  }

  private registerConstantExpression(
    typeHandle: NagaHandle,
    value: number | boolean | readonly number[],
    meta: BlockContext,
  ): ExprHandle {
    const constantHandle = this.constants.append({
      type: typeHandle,
      value,
    });
    const expr: NagaExpression = {
      type: 'Constant',
      constant: constantHandle,
    };
    return this.registerExpression(expr, typeHandle, meta);
  }

  private registerExpression(expr: NagaExpression, typeHandle: NagaHandle, meta: BlockContext): ExprHandle {
    const handle = this.expressions.append(expr);
    this.sourceMap.set(handle, meta);
    this.expressionTypeByHandle.set(handle, typeHandle);
    return new ExprHandle(handle);
  }

  private requireExpressionType(handle: ExprHandle): NagaHandle {
    const typeHandle = this.expressionTypeByHandle.get(handle.nagaHandle);
    if (typeHandle === undefined) {
      throw new Error('NagaBuilder: missing expression type for handle ' + String(handle.nagaHandle));
    }
    return typeHandle;
  }

  private getOrCreateBufferVariable(bufferKey: string): BufferVariableBinding {
    const existing = this.bufferVariables.get(bufferKey);
    if (existing) {
      return existing;
    }
    const binding: BufferVariableBinding = {
      variableHandle: this.nextGlobalVariableHandle,
    };
    this.nextGlobalVariableHandle += 1;
    this.bufferVariables.set(bufferKey, binding);
    return binding;
  }

  private getOrCreateStateVariable(stateKey: string, type: CanonicalType): StateVariableBinding {
    const requestedTypeHandle = this.resolveNagaType(type);
    const existing = this.stateVariables.get(stateKey);
    if (existing) {
      if (existing.typeHandle !== requestedTypeHandle) {
        throw new Error('NagaBuilder.readState: type mismatch for state key ' + stateKey);
      }
      return existing;
    }
    const binding: StateVariableBinding = {
      variableHandle: this.nextGlobalVariableHandle,
      typeHandle: requestedTypeHandle,
    };
    this.nextGlobalVariableHandle += 1;
    this.stateVariables.set(stateKey, binding);
    return binding;
  }

  private resolveNagaType(cType: CanonicalType): NagaHandle {
    // [LAW:one-source-of-truth] CanonicalType -> NagaType lowering is centralized here.
    const payload = cType.payload;
    switch (payload.kind) {
      case 'float':
        return this.getOrCreateScalarType(NagaScalarKind.Float);
      case 'int':
        return this.getOrCreateScalarType(NagaScalarKind.Sint);
      case 'bool':
        return this.getOrCreateScalarType(NagaScalarKind.Bool);
      case 'vec2':
        return this.getOrCreateVectorType(2, NagaScalarKind.Float);
      case 'vec3':
        return this.getOrCreateVectorType(3, NagaScalarKind.Float);
      case 'vec4':
      case 'color':
        return this.getOrCreateVectorType(4, NagaScalarKind.Float);
      default:
        throw new Error('NagaBuilder: unsupported CanonicalType payload ' + payload.kind);
    }
  }

  private getOrCreateScalarType(kind: NagaScalarKind): NagaHandle {
    const key = scalarTypeKey(kind);
    const cached = this.typeCache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const handle = this.types.append({
      kind: 'Scalar',
      scalar: kind,
      width: 4,
    });
    this.typeCache.set(key, handle);
    return handle;
  }

  private getOrCreateVectorType(size: 2 | 3 | 4, kind: NagaScalarKind): NagaHandle {
    const key = vectorTypeKey(size, kind);
    const cached = this.typeCache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const handle = this.types.append({
      kind: 'Vector',
      size,
      scalar: kind,
      width: 4,
    });
    this.typeCache.set(key, handle);
    return handle;
  }

  private getOrCreateMatrixType(columns: 2 | 3 | 4, rows: 2 | 3 | 4): NagaHandle {
    const key = matrixTypeKey(columns, rows);
    const cached = this.typeCache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const handle = this.types.append({
      kind: 'Matrix',
      columns,
      rows,
      width: 4,
    });
    this.typeCache.set(key, handle);
    return handle;
  }
}
