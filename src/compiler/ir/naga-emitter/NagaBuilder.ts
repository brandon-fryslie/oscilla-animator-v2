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

export class BlockHandle {
  public constructor(public readonly nagaHandle: NagaHandle) {}
}

interface StateVariableBinding {
  readonly variableHandle: NagaHandle;
  readonly typeHandle: NagaHandle;
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

function isIntScalar(type: NagaType): boolean {
  return type.kind === 'Scalar' && type.scalar === NagaScalarKind.Sint;
}

export class NagaBuilder {
  public readonly expressions = new NagaArena<NagaExpression>();
  public readonly types = new NagaArena<NagaType>();
  public readonly constants = new NagaArena<NagaConstant>();
  public readonly statements = new NagaArena<NagaStatement>();
  public readonly blocks = new NagaArena<NagaBlock>();

  // [LAW:one-source-of-truth] Expression handle metadata is authored only here.
  public readonly sourceMap = new Map<NagaHandle, BlockContext>();

  private readonly expressionTypeByHandle = new Map<NagaHandle, NagaHandle>();
  private readonly statementSourceMap = new Map<NagaHandle, BlockContext>();
  private readonly blockSourceMap = new Map<NagaHandle, BlockContext>();
  private readonly stateVariables = new Map<string, StateVariableBinding>();
  private readonly typeCache = new Map<string, NagaHandle>();

  private currentBlock: NagaHandle | null = null;
  private rootBlock: NagaHandle | null = null;

  public buildBlock(build: () => void, meta?: BlockContext): BlockHandle {
    const blockHandle = this.blocks.append({ statements: [] });
    if (meta) {
      this.blockSourceMap.set(blockHandle, meta);
    }
    if (this.rootBlock === null) {
      this.rootBlock = blockHandle;
    }

    const parentBlock = this.currentBlock;
    this.currentBlock = blockHandle;
    try {
      build();
    } finally {
      this.currentBlock = parentBlock;
    }

    return new BlockHandle(blockHandle);
  }

  public getRootBlock(): BlockHandle | null {
    if (this.rootBlock === null) {
      return null;
    }
    return new BlockHandle(this.rootBlock);
  }

  public getBlockStatements(block: BlockHandle): readonly NagaHandle[] {
    return this.blocks.get(block.nagaHandle).statements;
  }

  public getBlockContext(handle: NagaHandle): BlockContext | null {
    return this.blockSourceMap.get(handle) ?? null;
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

  public min(left: ExprHandle, right: ExprHandle, meta: BlockContext): ExprHandle {
    return this.binary(NagaBinaryOp.Min, left, right, meta);
  }

  public max(left: ExprHandle, right: ExprHandle, meta: BlockContext): ExprHandle {
    return this.binary(NagaBinaryOp.Max, left, right, meta);
  }

  public mul(left: ExprHandle, right: ExprHandle, meta: BlockContext): ExprHandle {
    return this.binary(NagaBinaryOp.Multiply, left, right, meta);
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
    const expr: NagaExpression = {
      type: 'Math',
      fun: NagaMathFunction.Mix,
      arg: a.nagaHandle,
      arg1: b.nagaHandle,
      arg2: t.nagaHandle,
    };
    return this.registerExpression(expr, aType, meta);
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
        variableHandle: this.stateVariables.size,
        typeHandle: valueType,
      });
    }
    this.appendStatement({
      type: 'StoreState',
      stateKey,
      value: value.nagaHandle,
    }, meta);
  }

  public arrayLength(bufferKey: string, meta: BlockContext): ExprHandle {
    const expr: NagaExpression = {
      type: 'ArrayLength',
      bufferKey,
    };
    const intType = this.getOrCreateScalarType(NagaScalarKind.Sint);
    return this.registerExpression(expr, intType, meta);
  }

  public bufferRead(bufferKey: string, index: ExprHandle, targetType: CanonicalType, meta: BlockContext): ExprHandle {
    const indexTypeHandle = this.requireExpressionType(index);
    const indexType = this.types.get(indexTypeHandle);
    if (!isIntScalar(indexType)) {
      throw new Error('NagaBuilder.bufferRead: dynamic index must be int scalar.');
    }
    const expr: NagaExpression = {
      type: 'BufferRead',
      bufferKey,
      index: index.nagaHandle,
    };
    return this.registerExpression(expr, this.resolveNagaType(targetType), meta);
  }

  public bufferWrite(bufferKey: string, index: ExprHandle, value: ExprHandle, meta: BlockContext): void {
    const indexTypeHandle = this.requireExpressionType(index);
    const indexType = this.types.get(indexTypeHandle);
    if (!isIntScalar(indexType)) {
      throw new Error('NagaBuilder.bufferWrite: dynamic index must be int scalar.');
    }
    this.requireExpressionType(value);
    this.appendStatement({
      type: 'BufferWrite',
      bufferKey,
      index: index.nagaHandle,
      value: value.nagaHandle,
    }, meta);
  }

  public atomicAdd(bufferKey: string, index: ExprHandle, value: ExprHandle, meta: BlockContext): ExprHandle {
    const indexTypeHandle = this.requireExpressionType(index);
    const indexType = this.types.get(indexTypeHandle);
    if (!isIntScalar(indexType)) {
      throw new Error('NagaBuilder.atomicAdd: dynamic index must be int scalar.');
    }
    const valueTypeHandle = this.requireExpressionType(value);
    const valueType = this.types.get(valueTypeHandle);
    if (!isIntScalar(valueType)) {
      throw new Error('NagaBuilder.atomicAdd: value must be int scalar.');
    }
    const expr: NagaExpression = {
      type: 'AtomicAdd',
      bufferKey,
      index: index.nagaHandle,
      value: value.nagaHandle,
    };
    return this.registerExpression(expr, valueTypeHandle, meta);
  }

  public loopStatement(body: BlockHandle, meta: BlockContext): void {
    this.appendStatement({
      type: 'Loop',
      body: body.nagaHandle,
    }, meta);
  }

  public ifStatement(condition: ExprHandle, accept: BlockHandle, reject: BlockHandle, meta: BlockContext): void {
    const conditionTypeHandle = this.requireExpressionType(condition);
    const conditionType = this.types.get(conditionTypeHandle);
    if (!isBoolScalar(conditionType)) {
      throw new Error('NagaBuilder.ifStatement: condition must be bool scalar.');
    }
    this.appendStatement({
      type: 'If',
      condition: condition.nagaHandle,
      accept: accept.nagaHandle,
      reject: reject.nagaHandle,
    }, meta);
  }

  public breakStatement(meta: BlockContext): void {
    this.appendStatement({ type: 'Break' }, meta);
  }

  public continueStatement(meta: BlockContext): void {
    this.appendStatement({ type: 'Continue' }, meta);
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

  public getExpressionType(handle: NagaHandle): NagaHandle | undefined {
    return this.expressionTypeByHandle.get(handle);
  }

  public getExpressionContext(handle: NagaHandle): BlockContext | null {
    return this.sourceMap.get(handle) ?? null;
  }

  public getStatementContext(handle: NagaHandle): BlockContext | null {
    return this.statementSourceMap.get(handle) ?? null;
  }

  private binary(
    op: NagaBinaryOp,
    left: ExprHandle,
    right: ExprHandle,
    meta: BlockContext,
  ): ExprHandle {
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

  private appendStatement(stmt: NagaStatement, meta: BlockContext): void {
    const currentBlock = this.currentBlock;
    if (currentBlock === null) {
      throw new Error('NagaBuilder: attempted to append statement without an active block.');
    }
    const statementHandle = this.statements.append(stmt);
    this.statementSourceMap.set(statementHandle, meta);
    this.blocks.get(currentBlock).statements.push(statementHandle);
  }

  private requireExpressionType(handle: ExprHandle): NagaHandle {
    const typeHandle = this.expressionTypeByHandle.get(handle.nagaHandle);
    if (typeHandle === undefined) {
      throw new Error('NagaBuilder: missing expression type for handle ' + String(handle.nagaHandle));
    }
    return typeHandle;
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
      variableHandle: this.stateVariables.size,
      typeHandle: requestedTypeHandle,
    };
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
    if (cached !== undefined) return cached;
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
    if (cached !== undefined) return cached;
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
    if (cached !== undefined) return cached;
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
