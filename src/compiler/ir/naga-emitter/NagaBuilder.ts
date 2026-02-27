import type { CanonicalType } from '../../../core/canonical-types';
import {
  NagaArena,
  NagaBinaryOp,
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

function scalarTypeKey(kind: NagaScalarKind): string {
  return 'Scalar:' + kind + ':4';
}

function vectorTypeKey(size: 2 | 3 | 4, kind: NagaScalarKind): string {
  return 'Vector:' + String(size) + ':' + kind + ':4';
}

function matrixTypeKey(columns: 2 | 3 | 4, rows: 2 | 3 | 4): string {
  return 'Matrix:' + String(columns) + 'x' + String(rows) + ':4';
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
  private readonly typeCache = new Map<string, NagaHandle>();

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
    return this.registerConstantExpression(matrixType, 0, meta);
  }

  public add(left: ExprHandle, right: ExprHandle, meta: BlockContext): ExprHandle {
    return this.binary(NagaBinaryOp.Add, left, right, meta);
  }

  public mul(left: ExprHandle, right: ExprHandle, meta: BlockContext): ExprHandle {
    return this.binary(NagaBinaryOp.Multiply, left, right, meta);
  }

  public lerp(a: ExprHandle, b: ExprHandle, t: ExprHandle, meta: BlockContext): ExprHandle {
    const aType = this.requireExpressionType(a);
    this.requireExpressionType(b);
    this.requireExpressionType(t);
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
    const resultType = this.requireExpressionType(trueVal);
    this.requireExpressionType(falseVal);
    this.requireExpressionType(cond);
    const expr: NagaExpression = {
      type: 'Select',
      condition: cond.nagaHandle,
      accept: trueVal.nagaHandle,
      reject: falseVal.nagaHandle,
    };
    return this.registerExpression(expr, resultType, meta);
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
    const statementId = this.statements.append({
      type: 'StoreState',
      stateKey,
      value: value.nagaHandle,
    });
    this.statementSourceMap.set(statementId, meta);
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
    this.requireExpressionType(right);
    const expr: NagaExpression = {
      type: 'Binary',
      op,
      left: left.nagaHandle,
      right: right.nagaHandle,
    };
    return this.registerExpression(expr, leftType, meta);
  }

  private registerConstantExpression(typeHandle: NagaHandle, value: number | boolean, meta: BlockContext): ExprHandle {
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

  private getOrCreateStateVariable(stateKey: string, type: CanonicalType): StateVariableBinding {
    const existing = this.stateVariables.get(stateKey);
    if (existing) {
      return existing;
    }
    const typeHandle = this.resolveNagaType(type);
    const binding: StateVariableBinding = {
      variableHandle: this.stateVariables.size,
      typeHandle,
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
