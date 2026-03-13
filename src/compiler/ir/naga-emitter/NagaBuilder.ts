import type { CanonicalType } from '../../../core/canonical-types';
import {
  NagaArena,
  NagaArenaReader,
  NagaBinaryOp,
  NagaBlock,
  NagaConstant,
  NagaExpression,
  NagaHandle,
  NagaMathFunction,
  NagaScalarKind,
  NagaStatement,
  NagaType,
  type NagaEntryPoint,
  type NagaEntryPointStage,
  type NagaFunction,
  type NagaFunctionArgument,
  type NagaGlobalVariable,
  type NagaModule,
  type NagaStorageAccess,
  type NagaStorageClass,
  type NagaStructField,
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

// =============================================================================
// Per-Function Expression Arena
// =============================================================================

interface FunctionScope {
  readonly name: string;
  readonly args: readonly NagaFunctionArgument[];
  readonly returnType: NagaHandle | null;
  readonly expressionArena: NagaArena<NagaExpression>;
  readonly expressionSourceMap: Map<NagaHandle, BlockContext>;
  readonly expressionTypeByHandle: Map<NagaHandle, NagaHandle>;
  readonly statementArena: NagaArena<NagaStatement>;
  readonly statementSourceMap: Map<NagaHandle, BlockContext>;
}

interface CompletedFunctionMetadata {
  readonly expressionSourceMap: ReadonlyMap<NagaHandle, BlockContext>;
  readonly expressionTypeByHandle: ReadonlyMap<NagaHandle, NagaHandle>;
  readonly statementSourceMap: ReadonlyMap<NagaHandle, BlockContext>;
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

function arrayTypeKey(base: NagaHandle, size: 'dynamic' | number): string {
  return 'Array:' + String(base) + ':' + String(size);
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

function isComparisonOp(op: NagaBinaryOp): boolean {
  return op === NagaBinaryOp.Less ||
    op === NagaBinaryOp.LessEqual ||
    op === NagaBinaryOp.Greater ||
    op === NagaBinaryOp.GreaterEqual ||
    op === NagaBinaryOp.Equal ||
    op === NagaBinaryOp.NotEqual;
}

export class NagaBuilder {
  // Module-level shared arenas
  private readonly typeArena = new NagaArena<NagaType>();
  private readonly constantArena = new NagaArena<NagaConstant>();
  private readonly typeCache = new Map<string, NagaHandle>();
  private readonly structTypeCache = new Map<string, NagaHandle>();

  // Global variables (shared across functions)
  private readonly globalVariables: NagaGlobalVariable[] = [];
  private readonly stateVariables = new Map<string, StateVariableBinding>();
  private nextGlobalVariableHandle = 0;

  // Per-function arenas
  private readonly completedFunctions: NagaFunction[] = [];
  private readonly completedFunctionMetadata: CompletedFunctionMetadata[] = [];
  private currentFunction: FunctionScope | null = null;

  // Entry points
  private readonly entryPoints: NagaEntryPoint[] = [];

  // Legacy single-function compatibility (default function scope)
  // [LAW:one-source-of-truth] Expression/statement arenas are owned per-function.
  // The "legacy" accessors delegate to the current function scope.
  private readonly legacyExpressionArena = new NagaArena<NagaExpression>();
  private readonly legacyExpressionSourceMap = new Map<NagaHandle, BlockContext>();
  private readonly legacyExpressionTypeByHandle = new Map<NagaHandle, NagaHandle>();
  private readonly legacyStatementArena = new NagaArena<NagaStatement>();
  private readonly legacyStatementSourceMap = new Map<NagaHandle, BlockContext>();

  // Block tracking
  private activeBlock: NagaBlock | null = null;
  private rootBlock: NagaBlock | null = null;

  // ==========================================================================
  // Arena Accessors (delegate to current function or legacy)
  // ==========================================================================

  private get exprArena(): NagaArena<NagaExpression> {
    return this.currentFunction?.expressionArena ?? this.legacyExpressionArena;
  }

  private get exprSourceMap(): Map<NagaHandle, BlockContext> {
    return this.currentFunction?.expressionSourceMap ?? this.legacyExpressionSourceMap;
  }

  private get exprTypeMap(): Map<NagaHandle, NagaHandle> {
    return this.currentFunction?.expressionTypeByHandle ?? this.legacyExpressionTypeByHandle;
  }

  private get stmtArena(): NagaArena<NagaStatement> {
    return this.currentFunction?.statementArena ?? this.legacyStatementArena;
  }

  private get stmtSourceMap(): Map<NagaHandle, BlockContext> {
    return this.currentFunction?.statementSourceMap ?? this.legacyStatementSourceMap;
  }

  // ==========================================================================
  // Public Reader Accessors (legacy compatibility)
  // ==========================================================================

  public get expressions(): NagaArenaReader<NagaExpression> {
    return this.legacyExpressionArena;
  }

  public get types(): NagaArenaReader<NagaType> {
    return this.typeArena;
  }

  public get constants(): NagaArenaReader<NagaConstant> {
    return this.constantArena;
  }

  public get statements(): NagaArenaReader<NagaStatement> {
    return this.legacyStatementArena;
  }

  // ==========================================================================
  // Function Lifecycle (Per-Function Expression Arenas)
  // ==========================================================================

  public beginFunction(
    name: string,
    args: readonly NagaFunctionArgument[],
    returnType: NagaHandle | null,
  ): void {
    if (this.currentFunction !== null) {
      throw new Error('NagaBuilder.beginFunction: nested function definitions are not allowed.');
    }
    this.currentFunction = {
      name,
      args,
      returnType,
      expressionArena: new NagaArena<NagaExpression>(),
      expressionSourceMap: new Map<NagaHandle, BlockContext>(),
      expressionTypeByHandle: new Map<NagaHandle, NagaHandle>(),
      statementArena: new NagaArena<NagaStatement>(),
      statementSourceMap: new Map<NagaHandle, BlockContext>(),
    };
    this.activeBlock = null;
    this.rootBlock = null;
  }

  public endFunction(): NagaHandle {
    const fn = this.currentFunction;
    if (fn === null) {
      throw new Error('NagaBuilder.endFunction: no function in progress.');
    }
    const body = this.rootBlock ?? [];
    const nagaFn: NagaFunction = {
      name: fn.name,
      arguments: fn.args,
      returnType: fn.returnType,
      expressions: fn.expressionArena.toArray(),
      statements: fn.statementArena.toArray(),
      body,
    };
    const handle = this.completedFunctions.length;
    this.completedFunctions.push(nagaFn);
    this.completedFunctionMetadata.push({
      expressionSourceMap: new Map(fn.expressionSourceMap),
      expressionTypeByHandle: new Map(fn.expressionTypeByHandle),
      statementSourceMap: new Map(fn.statementSourceMap),
    });
    this.currentFunction = null;
    this.activeBlock = null;
    this.rootBlock = null;
    return handle;
  }

  public isInsideFunction(): boolean {
    return this.currentFunction !== null;
  }

  // ==========================================================================
  // Block Construction
  // ==========================================================================

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

  // ==========================================================================
  // Statement Methods
  // ==========================================================================

  public loopStatement(body: NagaBlock, meta: BlockContext): void {
    this.emitStatement({ type: 'Loop', body }, meta);
  }

  public ifStatement(condition: ExprHandle, accept: NagaBlock, reject: NagaBlock, meta: BlockContext): void {
    const conditionType = this.typeArena.get(this.requireExpressionType(condition));
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

  public returnStatement(value: ExprHandle | undefined, meta: BlockContext): void {
    this.emitStatement({
      type: 'Return',
      value: value?.nagaHandle,
    }, meta);
  }

  public commentStatement(text: string, meta: BlockContext): void {
    this.emitStatement({ type: 'Comment', text }, meta);
  }

  // ==========================================================================
  // Literal Construction
  // ==========================================================================

  public literalFloat(value: number, meta: BlockContext): ExprHandle {
    const typeHandle = this.getOrCreateScalarType(NagaScalarKind.Float);
    return this.registerConstantExpression(typeHandle, value, meta);
  }

  public literalInt(value: number, meta: BlockContext): ExprHandle {
    const typeHandle = this.getOrCreateScalarType(NagaScalarKind.Sint);
    return this.registerConstantExpression(typeHandle, Math.trunc(value), meta);
  }

  public literalUint(value: number, meta: BlockContext): ExprHandle {
    const typeHandle = this.getOrCreateScalarType(NagaScalarKind.Uint);
    return this.registerConstantExpression(typeHandle, Math.trunc(value) >>> 0, meta);
  }

  public literalBool(value: boolean, meta: BlockContext): ExprHandle {
    const typeHandle = this.getOrCreateScalarType(NagaScalarKind.Bool);
    return this.registerConstantExpression(typeHandle, value, meta);
  }

  public literalMatrix4(meta: BlockContext): ExprHandle {
    const matrixType = this.getOrCreateMatrixType(4, 4);
    return this.registerConstantExpression(matrixType, ZERO_MATRIX4, meta);
  }

  // ==========================================================================
  // Arithmetic & Logic
  // ==========================================================================

  public add(left: ExprHandle, right: ExprHandle, meta: BlockContext): ExprHandle {
    return this.binary(NagaBinaryOp.Add, left, right, meta);
  }

  public sub(left: ExprHandle, right: ExprHandle, meta: BlockContext): ExprHandle {
    return this.binary(NagaBinaryOp.Subtract, left, right, meta);
  }

  public mul(left: ExprHandle, right: ExprHandle, meta: BlockContext): ExprHandle {
    return this.binary(NagaBinaryOp.Multiply, left, right, meta);
  }

  public div(left: ExprHandle, right: ExprHandle, meta: BlockContext): ExprHandle {
    return this.binary(NagaBinaryOp.Divide, left, right, meta);
  }

  public modulo(left: ExprHandle, right: ExprHandle, meta: BlockContext): ExprHandle {
    return this.binary(NagaBinaryOp.Modulo, left, right, meta);
  }

  public less(left: ExprHandle, right: ExprHandle, meta: BlockContext): ExprHandle {
    return this.comparison(NagaBinaryOp.Less, left, right, meta);
  }

  public lessEqual(left: ExprHandle, right: ExprHandle, meta: BlockContext): ExprHandle {
    return this.comparison(NagaBinaryOp.LessEqual, left, right, meta);
  }

  public greater(left: ExprHandle, right: ExprHandle, meta: BlockContext): ExprHandle {
    return this.comparison(NagaBinaryOp.Greater, left, right, meta);
  }

  public greaterEqual(left: ExprHandle, right: ExprHandle, meta: BlockContext): ExprHandle {
    return this.comparison(NagaBinaryOp.GreaterEqual, left, right, meta);
  }

  public equal(left: ExprHandle, right: ExprHandle, meta: BlockContext): ExprHandle {
    return this.comparison(NagaBinaryOp.Equal, left, right, meta);
  }

  public notEqual(left: ExprHandle, right: ExprHandle, meta: BlockContext): ExprHandle {
    return this.comparison(NagaBinaryOp.NotEqual, left, right, meta);
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
    const aNagaType = this.typeArena.get(aType);
    const tNagaType = this.typeArena.get(tType);

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
    const trueNagaType = this.typeArena.get(trueType);
    const condNagaType = this.typeArena.get(condType);

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
    const sourceTypeHandle = this.requireExpressionType(value);
    const sourceType = this.typeArena.get(sourceTypeHandle);
    const targetTypeHandle = this.resolveNagaType(targetType);
    const targetNagaType = this.typeArena.get(targetTypeHandle);

    // [LAW:single-enforcer] Cast shape rules are enforced at the constrained builder boundary.
    if (targetNagaType.kind === 'Scalar' && sourceType.kind !== 'Scalar') {
      throw new Error('NagaBuilder.cast: scalar casts require scalar source values.');
    }
    if (targetNagaType.kind === 'Vector') {
      const vectorIdentity =
        sourceType.kind === 'Vector' &&
        sourceType.size === targetNagaType.size &&
        sourceType.scalar === targetNagaType.scalar;
      const scalarSplat = sourceType.kind === 'Scalar' && sourceType.scalar === targetNagaType.scalar;
      if (!vectorIdentity && !scalarSplat) {
        throw new Error('NagaBuilder.cast: vector casts require scalar splat or same-shape vector source.');
      }
    }
    if (targetNagaType.kind === 'Matrix') {
      const matrixIdentity =
        sourceType.kind === 'Matrix' &&
        sourceType.columns === targetNagaType.columns &&
        sourceType.rows === targetNagaType.rows;
      const scalarSplat = sourceType.kind === 'Scalar' && sourceType.scalar === NagaScalarKind.Float;
      if (!matrixIdentity && !scalarSplat) {
        throw new Error('NagaBuilder.cast: matrix casts require float scalar splat or same-shape matrix source.');
      }
    }

    const expr: NagaExpression = {
      type: 'Compose',
      ty: targetTypeHandle,
      components: [value.nagaHandle],
    };
    return this.registerExpression(expr, targetTypeHandle, meta);
  }

  // ==========================================================================
  // New Expression Methods
  // ==========================================================================

  public accessIndex(base: ExprHandle, index: number, resultType: NagaHandle, meta: BlockContext): ExprHandle {
    const expr: NagaExpression = {
      type: 'AccessIndex',
      base: base.nagaHandle,
      index,
    };
    return this.registerExpression(expr, resultType, meta);
  }

  public compose(targetType: NagaHandle, components: readonly ExprHandle[], meta: BlockContext): ExprHandle {
    const expr: NagaExpression = {
      type: 'Compose',
      ty: targetType,
      components: components.map(c => c.nagaHandle),
    };
    return this.registerExpression(expr, targetType, meta);
  }

  public castScalar(value: ExprHandle, targetKind: NagaScalarKind, convert: boolean, meta: BlockContext): ExprHandle {
    const targetTypeHandle = this.getOrCreateScalarType(targetKind);
    const expr: NagaExpression = {
      type: 'As',
      expr: value.nagaHandle,
      kind: targetKind,
      convert,
    };
    return this.registerExpression(expr, targetTypeHandle, meta);
  }

  public functionArgument(index: number, resultType: NagaHandle, meta: BlockContext): ExprHandle {
    if (this.currentFunction === null) {
      throw new Error('NagaBuilder.functionArgument: must be inside a function scope.');
    }
    const expr: NagaExpression = {
      type: 'FunctionArgument',
      index,
    };
    return this.registerExpression(expr, resultType, meta);
  }

  /**
   * Create a reference to a global variable inside the current function scope.
   * Returns an ExprHandle that can be used as the `base` for Access/Load expressions.
   *
   * @param variableHandle - Handle returned by declareGlobalVariable()
   * @param resultType - The type of the global variable's contents (e.g., array type)
   */
  public globalVariableRef(variableHandle: NagaHandle, resultType: NagaHandle, meta: BlockContext): ExprHandle {
    const expr: NagaExpression = {
      type: 'GlobalVariable',
      variable: variableHandle,
    };
    return this.registerExpression(expr, resultType, meta);
  }

  /**
   * Read a single element from a storage buffer by index: buffer[index].
   * Uses proper expression handles (GlobalVariable → Access → Load chain).
   *
   * @param bufferRef - ExprHandle from globalVariableRef() pointing to an array global
   * @param index - ExprHandle for the dynamic index (must be integer scalar)
   * @param elementType - NagaHandle for the element type (e.g., f32 or u32)
   */
  public accessLoad(bufferRef: ExprHandle, index: ExprHandle, elementType: NagaHandle, meta: BlockContext): ExprHandle {
    const indexType = this.typeArena.get(this.requireExpressionType(index));
    if (!isIntegerScalar(indexType)) {
      throw new Error('NagaBuilder.accessLoad: dynamic index must be integer scalar.');
    }
    const accessExpr: NagaExpression = {
      type: 'Access',
      base: bufferRef.nagaHandle,
      index: index.nagaHandle,
    };
    const accessHandle = this.exprArena.append(accessExpr);
    this.exprSourceMap.set(accessHandle, meta);
    const loadExpr: NagaExpression = { type: 'Load', pointer: accessHandle };
    return this.registerExpression(loadExpr, elementType, meta);
  }

  /**
   * Write a value to a storage buffer element by index: buffer[index] = value.
   * Complement to accessLoad() for write operations.
   *
   * @param bufferRef - ExprHandle from globalVariableRef() pointing to an array global
   * @param index - ExprHandle for the dynamic index (must be integer scalar)
   * @param value - ExprHandle for the value to store
   */
  public storeAt(bufferRef: ExprHandle, index: ExprHandle, value: ExprHandle, meta: BlockContext): void {
    const indexType = this.typeArena.get(this.requireExpressionType(index));
    if (!isIntegerScalar(indexType)) {
      throw new Error('NagaBuilder.storeAt: dynamic index must be integer scalar.');
    }
    this.requireExpressionType(value);

    const accessExpr: NagaExpression = {
      type: 'Access',
      base: bufferRef.nagaHandle,
      index: index.nagaHandle,
    };
    const pointerHandle = this.exprArena.append(accessExpr);
    this.exprSourceMap.set(pointerHandle, meta);

    this.emitStatement({
      type: 'Store',
      pointer: pointerHandle,
      value: value.nagaHandle,
    }, meta);
  }

  /**
   * Get the runtime array length of a storage buffer.
   * Uses proper expression handle chain (no ghost handles).
   *
   * @param bufferRef - ExprHandle from globalVariableRef() pointing to a dynamic array global
   */
  public arrayLengthOf(bufferRef: ExprHandle, meta: BlockContext): ExprHandle {
    const expr: NagaExpression = {
      type: 'ArrayLength',
      expr: bufferRef.nagaHandle,
    };
    const typeHandle = this.getOrCreateScalarType(NagaScalarKind.Uint);
    return this.registerExpression(expr, typeHandle, meta);
  }

  /**
   * Load a value from a pointer expression (GlobalVariable → Load).
   * For uniform struct access: globalVariableRef → load.
   */
  public load(pointer: ExprHandle, resultType: NagaHandle, meta: BlockContext): ExprHandle {
    const expr: NagaExpression = { type: 'Load', pointer: pointer.nagaHandle };
    return this.registerExpression(expr, resultType, meta);
  }

  /**
   * Access the completed function list for validation.
   * [LAW:single-enforcer] NagaValidator uses this to validate per-function arenas.
   */
  public getCompletedFunctions(): readonly NagaFunction[] {
    return this.completedFunctions;
  }

  public getCompletedFunctionExpressionType(functionHandle: NagaHandle, expressionHandle: NagaHandle): NagaHandle | undefined {
    return this.completedFunctionMetadata[functionHandle]?.expressionTypeByHandle.get(expressionHandle);
  }

  public getCompletedFunctionExpressionContext(functionHandle: NagaHandle, expressionHandle: NagaHandle): BlockContext | null {
    return this.completedFunctionMetadata[functionHandle]?.expressionSourceMap.get(expressionHandle) ?? null;
  }

  public getCompletedFunctionStatementContext(functionHandle: NagaHandle, statementHandle: NagaHandle): BlockContext | null {
    return this.completedFunctionMetadata[functionHandle]?.statementSourceMap.get(statementHandle) ?? null;
  }

  public callBuiltin(functionHandle: NagaHandle, args: readonly ExprHandle[], resultType: NagaHandle, meta: BlockContext): ExprHandle {
    const expr: NagaExpression = {
      type: 'Call',
      function: functionHandle,
      arguments: args.map((a) => a.nagaHandle),
    };
    return this.registerExpression(expr, resultType, meta);
  }

  // ==========================================================================
  // Math Functions (New)
  // ==========================================================================

  public abs(a: ExprHandle, meta: BlockContext): ExprHandle {
    return this.math(NagaMathFunction.Abs, a, meta);
  }

  public atan2(y: ExprHandle, x: ExprHandle, meta: BlockContext): ExprHandle {
    return this.math(NagaMathFunction.Atan2, y, meta, x);
  }

  public ceil(a: ExprHandle, meta: BlockContext): ExprHandle {
    return this.math(NagaMathFunction.Ceil, a, meta);
  }

  public clamp(value: ExprHandle, lo: ExprHandle, hi: ExprHandle, meta: BlockContext): ExprHandle {
    return this.math(NagaMathFunction.Clamp, value, meta, lo, hi);
  }

  public exp(a: ExprHandle, meta: BlockContext): ExprHandle {
    return this.math(NagaMathFunction.Exp, a, meta);
  }

  public floor(a: ExprHandle, meta: BlockContext): ExprHandle {
    return this.math(NagaMathFunction.Floor, a, meta);
  }

  public fract(a: ExprHandle, meta: BlockContext): ExprHandle {
    return this.math(NagaMathFunction.Fract, a, meta);
  }

  public log(a: ExprHandle, meta: BlockContext): ExprHandle {
    return this.math(NagaMathFunction.Log, a, meta);
  }

  public pow(base: ExprHandle, exponent: ExprHandle, meta: BlockContext): ExprHandle {
    return this.math(NagaMathFunction.Pow, base, meta, exponent);
  }

  public round(a: ExprHandle, meta: BlockContext): ExprHandle {
    return this.math(NagaMathFunction.Round, a, meta);
  }

  public sign(a: ExprHandle, meta: BlockContext): ExprHandle {
    return this.math(NagaMathFunction.Sign, a, meta);
  }

  public sqrt(a: ExprHandle, meta: BlockContext): ExprHandle {
    return this.math(NagaMathFunction.Sqrt, a, meta);
  }

  public sin(a: ExprHandle, meta: BlockContext): ExprHandle {
    return this.math(NagaMathFunction.Sin, a, meta);
  }

  public cos(a: ExprHandle, meta: BlockContext): ExprHandle {
    return this.math(NagaMathFunction.Cos, a, meta);
  }

  public tan(a: ExprHandle, meta: BlockContext): ExprHandle {
    return this.math(NagaMathFunction.Tan, a, meta);
  }

  public trunc(a: ExprHandle, meta: BlockContext): ExprHandle {
    return this.math(NagaMathFunction.Trunc, a, meta);
  }

  // ==========================================================================
  // State Management
  // ==========================================================================

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

  // ==========================================================================
  // Dynamic Memory (With Bounds Safety)
  // ==========================================================================

  public arrayLength(bufferKey: string, meta: BlockContext): ExprHandle {
    void bufferKey;
    void meta;
    // [LAW:single-enforcer] Legacy string-key buffer APIs are forbidden here.
    // Function-scope lowering must use globalVariableRef()/arrayLengthOf().
    throw new Error(
      'NagaBuilder.arrayLength is deprecated. Use arrayLengthOf(bufferRef, meta) with a globalVariableRef handle.',
    );
  }

  public bufferRead(bufferKey: string, index: ExprHandle, targetType: CanonicalType, meta: BlockContext): ExprHandle {
    void bufferKey;
    void index;
    void targetType;
    void meta;
    // [LAW:single-enforcer] Legacy string-key buffer APIs are forbidden here.
    // Function-scope lowering must use accessLoad() with explicit buffer refs.
    throw new Error(
      'NagaBuilder.bufferRead is deprecated. Use accessLoad(bufferRef, index, elementType, meta).',
    );
  }

  /**
   * Read from a storage buffer with an explicit NagaType handle as result type.
   * Use this for non-CanonicalType buffers (e.g. u32 shape bank).
   */
  public bufferReadTyped(bufferKey: string, index: ExprHandle, resultTypeHandle: NagaHandle, meta: BlockContext): ExprHandle {
    void bufferKey;
    void index;
    void resultTypeHandle;
    void meta;
    // [LAW:single-enforcer] Legacy string-key buffer APIs are forbidden here.
    // Function-scope lowering must use accessLoad() with explicit buffer refs.
    throw new Error(
      'NagaBuilder.bufferReadTyped is deprecated. Use accessLoad(bufferRef, index, resultTypeHandle, meta).',
    );
  }

  public bufferWrite(bufferKey: string, index: ExprHandle, value: ExprHandle, meta: BlockContext): void {
    void bufferKey;
    void index;
    void value;
    void meta;
    // [LAW:single-enforcer] Legacy string-key buffer APIs are forbidden here.
    // Function-scope lowering must use storeAt() with explicit buffer refs.
    throw new Error(
      'NagaBuilder.bufferWrite is deprecated. Use storeAt(bufferRef, index, value, meta).',
    );
  }

  public atomicAdd(bufferKey: string, index: ExprHandle, value: ExprHandle, meta: BlockContext): ExprHandle {
    void bufferKey;
    void index;
    void value;
    void meta;
    // [LAW:single-enforcer] Legacy string-key buffer APIs are forbidden here.
    // If atomic ops are required, add explicit pointer-based APIs.
    throw new Error(
      'NagaBuilder.atomicAdd is deprecated. Add a pointer-based atomic API before using atomics.',
    );
  }

  // ==========================================================================
  // Global Variable Declaration
  // ==========================================================================

  public declareGlobalVariable(
    name: string,
    storageClass: NagaStorageClass,
    access: NagaStorageAccess,
    group: number,
    binding: number,
    type: NagaHandle,
  ): NagaHandle {
    const handle = this.globalVariables.length;
    this.globalVariables.push({
      name,
      storageClass,
      access,
      binding: { group, binding },
      type,
    });
    return handle;
  }

  // ==========================================================================
  // Entry Point Declaration
  // ==========================================================================

  public declareEntryPoint(
    stage: NagaEntryPointStage,
    functionName: string,
    workgroupSize: readonly [number, number, number],
  ): void {
    this.entryPoints.push({
      stage,
      function: functionName,
      workgroupSize,
    });
  }

  // ==========================================================================
  // Module Building
  // ==========================================================================

  public buildModule(): NagaModule {
    return {
      types: this.typeArena.toArray(),
      constants: this.constantArena.toArray(),
      global_variables: this.globalVariables,
      functions: this.completedFunctions,
      entry_points: this.entryPoints,
    };
  }

  // ==========================================================================
  // Type Creation
  // ==========================================================================

  public getOrCreateScalarType(kind: NagaScalarKind): NagaHandle {
    const key = scalarTypeKey(kind);
    const cached = this.typeCache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const handle = this.typeArena.append({
      kind: 'Scalar',
      scalar: kind,
      width: 4,
    });
    this.typeCache.set(key, handle);
    return handle;
  }

  public getOrCreateVectorType(size: 2 | 3 | 4, kind: NagaScalarKind): NagaHandle {
    const key = vectorTypeKey(size, kind);
    const cached = this.typeCache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const handle = this.typeArena.append({
      kind: 'Vector',
      size,
      scalar: kind,
      width: 4,
    });
    this.typeCache.set(key, handle);
    return handle;
  }

  public getOrCreateMatrixType(columns: 2 | 3 | 4, rows: 2 | 3 | 4): NagaHandle {
    const key = matrixTypeKey(columns, rows);
    const cached = this.typeCache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const handle = this.typeArena.append({
      kind: 'Matrix',
      columns,
      rows,
      width: 4,
    });
    this.typeCache.set(key, handle);
    return handle;
  }

  public getOrCreateArrayType(base: NagaHandle, size: 'dynamic' | number): NagaHandle {
    const key = arrayTypeKey(base, size);
    const cached = this.typeCache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const handle = this.typeArena.append({
      kind: 'Array',
      base,
      size,
    });
    this.typeCache.set(key, handle);
    return handle;
  }

  public getOrCreateStructType(name: string, fields: readonly NagaStructField[]): NagaHandle {
    const cached = this.structTypeCache.get(name);
    if (cached !== undefined) {
      return cached;
    }
    const handle = this.typeArena.append({
      kind: 'Struct',
      name,
      fields,
    });
    this.structTypeCache.set(name, handle);
    return handle;
  }

  public resolveNagaType(cType: CanonicalType): NagaHandle {
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

  // ==========================================================================
  // Inspector API
  // ==========================================================================

  public getExpressionType(handle: NagaHandle): NagaHandle | undefined {
    // Check current function scope first, then legacy
    const fromFn = this.currentFunction?.expressionTypeByHandle.get(handle);
    if (fromFn !== undefined) return fromFn;
    return this.legacyExpressionTypeByHandle.get(handle);
  }

  public getExpressionContext(handle: NagaHandle): BlockContext | null {
    const fromFn = this.currentFunction?.expressionSourceMap.get(handle);
    if (fromFn !== undefined) return fromFn;
    return this.legacyExpressionSourceMap.get(handle) ?? null;
  }

  public getStatementContext(handle: NagaHandle): BlockContext | null {
    const fromFn = this.currentFunction?.statementSourceMap.get(handle);
    if (fromFn !== undefined) return fromFn;
    return this.legacyStatementSourceMap.get(handle) ?? null;
  }

  // ==========================================================================
  // Test-Only Seams
  // ==========================================================================

  // [LAW:single-enforcer] exception: explicit test-only seam for validator trap coverage.
  public unsafeAppendExpressionForTesting(
    expression: NagaExpression,
    meta: BlockContext | null = null,
    resultTypeHandle?: NagaHandle,
  ): NagaHandle {
    const handle = this.exprArena.append(expression);
    if (meta !== null) {
      this.exprSourceMap.set(handle, meta);
    }
    if (resultTypeHandle !== undefined) {
      this.exprTypeMap.set(handle, resultTypeHandle);
    }
    return handle;
  }

  // [LAW:single-enforcer] exception: explicit test-only seam for statement validation coverage.
  public unsafeAppendStatementForTesting(statement: NagaStatement, meta: BlockContext | null = null): NagaHandle {
    const handle = this.stmtArena.append(statement);
    if (meta !== null) {
      this.stmtSourceMap.set(handle, meta);
    }
    return handle;
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private emitStatement(statement: NagaStatement, meta: BlockContext): void {
    const handle = this.stmtArena.append(statement);
    this.stmtSourceMap.set(handle, meta);
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
    const leftNagaType = this.typeArena.get(leftType);

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

  private comparison(op: NagaBinaryOp, left: ExprHandle, right: ExprHandle, meta: BlockContext): ExprHandle {
    const leftType = this.requireExpressionType(left);
    const rightType = this.requireExpressionType(right);
    const leftNagaType = this.typeArena.get(leftType);

    if (leftType !== rightType) {
      throw new Error('NagaBuilder.comparison: operand type mismatch for ' + String(op) + '.');
    }
    if (!isNumericScalar(leftNagaType) && !isNumericVector(leftNagaType)) {
      throw new Error('NagaBuilder.comparison: invalid operand type ' + leftNagaType.kind + ' for ' + String(op) + '.');
    }

    // Comparisons produce bool (scalar) or bool vector matching input vector size
    const resultType = leftNagaType.kind === 'Vector'
      ? this.getOrCreateVectorType(leftNagaType.size, NagaScalarKind.Bool)
      : this.getOrCreateScalarType(NagaScalarKind.Bool);

    const expr: NagaExpression = {
      type: 'Binary',
      op,
      left: left.nagaHandle,
      right: right.nagaHandle,
    };
    return this.registerExpression(expr, resultType, meta);
  }

  private registerConstantExpression(
    typeHandle: NagaHandle,
    value: number | boolean | readonly number[],
    meta: BlockContext,
  ): ExprHandle {
    const constantHandle = this.constantArena.append({
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
    const handle = this.exprArena.append(expr);
    this.exprSourceMap.set(handle, meta);
    this.exprTypeMap.set(handle, typeHandle);
    return new ExprHandle(handle);
  }

  private requireExpressionType(handle: ExprHandle): NagaHandle {
    const typeHandle = this.exprTypeMap.get(handle.nagaHandle);
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
      variableHandle: this.nextGlobalVariableHandle,
      typeHandle: requestedTypeHandle,
    };
    this.nextGlobalVariableHandle += 1;
    this.stateVariables.set(stateKey, binding);
    return binding;
  }
}
