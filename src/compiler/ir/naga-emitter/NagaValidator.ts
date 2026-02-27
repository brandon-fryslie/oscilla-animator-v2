import { NagaBuilder } from './NagaBuilder';
import { NagaBinaryOp, NagaHandle, NagaMathFunction, NagaScalarKind, NagaType } from './naga-types';

export interface NagaValidationIssue {
  readonly handle: NagaHandle;
  readonly message: string;
  readonly visualBlockId: string | null;
}

export class NagaValidationError extends Error {
  public readonly handle: NagaHandle;
  public readonly visualBlockId: string | null;

  public constructor(handle: NagaHandle, visualBlockId: string | null, message: string) {
    const prefix = 'Naga Validation Error at Expression [' + String(handle) + ']: ';
    const suffix = visualBlockId ? ' (visualBlockId=' + visualBlockId + ')' : '';
    super(prefix + message + suffix);
    this.name = 'NagaValidationError';
    this.handle = handle;
    this.visualBlockId = visualBlockId;
  }
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

function isValidBinaryOperand(type: NagaType): boolean {
  return isNumericScalar(type) || isNumericVector(type);
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

function pushIssue(
  issues: NagaValidationIssue[],
  handle: NagaHandle,
  visualBlockId: string | null,
  message: string,
): void {
  issues.push({
    handle,
    visualBlockId,
    message,
  });
}

export function collectNagaValidationIssues(builder: NagaBuilder): readonly NagaValidationIssue[] {
  // [LAW:single-enforcer] Validation coverage is centralized in this single pass.
  const issues: NagaValidationIssue[] = [];
  const expressions = builder.expressions.toArray();

  for (let handle = 0; handle < expressions.length; handle++) {
    const expression = expressions[handle];
    const visualBlockId = builder.getExpressionContext(handle)?.visualBlockId ?? null;
    const expressionTypeHandle = builder.getExpressionType(handle);
    if (expressionTypeHandle === undefined) {
      pushIssue(issues, handle, visualBlockId, 'Expression is missing result type metadata.');
      continue;
    }
    const expressionType = builder.types.get(expressionTypeHandle);

    if (expression.type === 'Binary') {
      const leftTypeHandle = builder.getExpressionType(expression.left);
      const rightTypeHandle = builder.getExpressionType(expression.right);
      if (leftTypeHandle === undefined || rightTypeHandle === undefined) {
        pushIssue(issues, handle, visualBlockId, 'Binary expression has missing operand type metadata.');
        continue;
      }
      if (leftTypeHandle !== rightTypeHandle) {
        pushIssue(issues, handle, visualBlockId, 'Type mismatch for ' + expression.op + ' operation.');
        continue;
      }
      const leftType = builder.types.get(leftTypeHandle);
      if (!isValidBinaryOperand(leftType)) {
        const op = expression.op === NagaBinaryOp.Add ? 'Add' : String(expression.op);
        pushIssue(issues, handle, visualBlockId, op + ' does not accept operand type ' + leftType.kind + '.');
      }
      continue;
    }

    if (expression.type === 'Math' && expression.fun === NagaMathFunction.Mix) {
      if (expression.arg1 === undefined || expression.arg2 === undefined) {
        pushIssue(issues, handle, visualBlockId, 'Mix requires arg, arg1, and arg2.');
        continue;
      }
      const aTypeHandle = builder.getExpressionType(expression.arg);
      const bTypeHandle = builder.getExpressionType(expression.arg1);
      const tTypeHandle = builder.getExpressionType(expression.arg2);
      if (aTypeHandle === undefined || bTypeHandle === undefined || tTypeHandle === undefined) {
        pushIssue(issues, handle, visualBlockId, 'Mix expression has missing operand type metadata.');
        continue;
      }
      if (aTypeHandle !== bTypeHandle) {
        pushIssue(issues, handle, visualBlockId, 'Mix requires matching a/b operand types.');
        continue;
      }
      const aType = builder.types.get(aTypeHandle);
      const tType = builder.types.get(tTypeHandle);
      if (!isMixValueType(aType)) {
        pushIssue(issues, handle, visualBlockId, 'Mix requires float scalar or float vector a/b operands.');
        continue;
      }
      const hasCompatibleFactorType = tTypeHandle === aTypeHandle || isFloatScalar(tType);
      if (!hasCompatibleFactorType) {
        pushIssue(issues, handle, visualBlockId, 'Mix factor must be float scalar or match a/b type.');
      }
      continue;
    }

    if (expression.type === 'Select') {
      const condTypeHandle = builder.getExpressionType(expression.condition);
      const acceptTypeHandle = builder.getExpressionType(expression.accept);
      const rejectTypeHandle = builder.getExpressionType(expression.reject);
      if (condTypeHandle === undefined || acceptTypeHandle === undefined || rejectTypeHandle === undefined) {
        pushIssue(issues, handle, visualBlockId, 'Select expression has missing operand type metadata.');
        continue;
      }
      if (acceptTypeHandle !== rejectTypeHandle) {
        pushIssue(issues, handle, visualBlockId, 'Select requires matching true/false value types.');
        continue;
      }
      const condType = builder.types.get(condTypeHandle);
      const acceptType = builder.types.get(acceptTypeHandle);
      if (!isBoolScalar(condType) && !isBoolVector(condType)) {
        pushIssue(issues, handle, visualBlockId, 'Select condition must be bool scalar or bool vector.');
        continue;
      }
      if (
        acceptType.kind === 'Vector' &&
        condType.kind === 'Vector' &&
        condType.scalar === NagaScalarKind.Bool &&
        condType.size !== acceptType.size
      ) {
        pushIssue(issues, handle, visualBlockId, 'Select bool vector condition size must match value vector size.');
        continue;
      }
      if (
        acceptType.kind !== 'Vector' &&
        condType.kind === 'Vector' &&
        condType.scalar === NagaScalarKind.Bool
      ) {
        pushIssue(issues, handle, visualBlockId, 'Select bool vector condition requires vector values.');
        continue;
      }
      if (expressionTypeHandle !== acceptTypeHandle) {
        pushIssue(issues, handle, visualBlockId, 'Select result type must match value operand type.');
      }
      continue;
    }

    if (expression.type === 'Compose') {
      if (expression.components.length === 0) {
        pushIssue(issues, handle, visualBlockId, 'Compose requires at least one component.');
      }
      if (expressionTypeHandle !== expression.ty) {
        pushIssue(issues, handle, visualBlockId, 'Compose result type must match target compose type.');
      }
      continue;
    }

    if (expression.type === 'GlobalVariable') {
      if (expression.variable < 0) {
        pushIssue(issues, handle, visualBlockId, 'GlobalVariable handle must be non-negative.');
      }
      continue;
    }

    if (expression.type === 'Constant') {
      if (expression.constant < 0) {
        pushIssue(issues, handle, visualBlockId, 'Constant handle must be non-negative.');
      }
      const constant = builder.constants.get(expression.constant);
      if (constant.type !== expressionTypeHandle) {
        pushIssue(issues, handle, visualBlockId, 'Constant result type must match constant type handle.');
      }
      if (expressionType.kind === 'Matrix' && !Array.isArray(constant.value)) {
        pushIssue(issues, handle, visualBlockId, 'Matrix constants must store component arrays.');
      }
    }
  }

  return issues;
}

export function validateNagaBuilder(builder: NagaBuilder): void {
  const issues = collectNagaValidationIssues(builder);
  if (issues.length === 0) {
    return;
  }
  const first = issues[0];
  throw new NagaValidationError(first.handle, first.visualBlockId, first.message);
}
