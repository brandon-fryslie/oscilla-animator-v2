import { NagaBuilder } from './NagaBuilder';
import {
  NagaBinaryOp,
  NagaHandle,
  NagaMathFunction,
  NagaScalarKind,
  NagaType,
} from './naga-types';

export interface NagaValidationIssue {
  readonly handle: NagaHandle;
  readonly message: string;
  readonly visualBlockId: string | null;
  readonly isStatement: boolean;
}

export class NagaValidationError extends Error {
  public readonly handle: NagaHandle;
  public readonly visualBlockId: string | null;

  public constructor(handle: NagaHandle, visualBlockId: string | null, message: string, isStatement: boolean) {
    const prefix = isStatement
      ? 'Naga Validation Error at Statement [' + String(handle) + ']: '
      : 'Naga Validation Error at Expression [' + String(handle) + ']: ';
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

function isIntegerScalar(type: NagaType): boolean {
  return type.kind === 'Scalar' && (
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

function expectedComposeComponentCount(type: NagaType): number {
  if (type.kind === 'Scalar') {
    return 1;
  }
  if (type.kind === 'Vector') {
    return type.size;
  }
  return type.columns * type.rows;
}

function pushIssue(
  issues: NagaValidationIssue[],
  handle: NagaHandle,
  visualBlockId: string | null,
  message: string,
  isStatement = false,
): void {
  issues.push({
    handle,
    visualBlockId,
    message,
    isStatement,
  });
}

export function collectNagaValidationIssues(builder: NagaBuilder): readonly NagaValidationIssue[] {
  // [LAW:single-enforcer] Validation coverage is centralized in this single pass.
  const issues: NagaValidationIssue[] = [];
  const expressions = builder.expressions.toArray();
  const statements = builder.statements.toArray();

  for (let handle = 0; handle < expressions.length; handle++) {
    const expression = expressions[handle];
    const visualBlockId = builder.getExpressionContext(handle)?.visualBlockId ?? null;
    const expressionTypeHandle = builder.getExpressionType(handle);

    if (expressionTypeHandle === undefined && expression.type !== 'Access') {
      pushIssue(issues, handle, visualBlockId, 'Expression is missing result type metadata.');
      continue;
    }

    const expressionType = expressionTypeHandle !== undefined ? builder.types.get(expressionTypeHandle) : null;

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

    if (expression.type === 'Math') {
      if (expression.fun === NagaMathFunction.Mix) {
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
      } else if (expression.fun === NagaMathFunction.Min || expression.fun === NagaMathFunction.Max) {
        const aTypeHandle = builder.getExpressionType(expression.arg);
        const bTypeHandle = expression.arg1 !== undefined ? builder.getExpressionType(expression.arg1) : undefined;
        if (aTypeHandle === undefined || bTypeHandle === undefined) {
          pushIssue(issues, handle, visualBlockId, String(expression.fun) + ' has missing operand type metadata.');
          continue;
        }
        if (aTypeHandle !== bTypeHandle) {
          pushIssue(issues, handle, visualBlockId, String(expression.fun) + ' requires matching operand types.');
          continue;
        }
        const aType = builder.types.get(aTypeHandle);
        if (!isValidBinaryOperand(aType)) {
          pushIssue(
            issues,
            handle,
            visualBlockId,
            String(expression.fun) + ' does not accept operand type ' + aType.kind + '.',
          );
        }
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
      let targetType: NagaType;
      try {
        targetType = builder.types.get(expression.ty);
      } catch {
        pushIssue(issues, handle, visualBlockId, 'Compose target type metadata is missing.');
        continue;
      }
      const componentCount = expression.components.length;
      const fullCount = expectedComposeComponentCount(targetType);
      if (componentCount !== 1 && componentCount !== fullCount) {
        if (targetType.kind === 'Scalar') {
          pushIssue(issues, handle, visualBlockId, 'Compose into scalar type requires exactly one component.');
          continue;
        }
        if (targetType.kind === 'Vector') {
          pushIssue(
            issues,
            handle,
            visualBlockId,
            'Compose into vector type requires one scalar splat component or one component per lane.',
          );
          continue;
        }
        pushIssue(
          issues,
          handle,
          visualBlockId,
          'Compose into matrix type requires one float splat component or one component per element.',
        );
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
      if (expressionType?.kind === 'Matrix') {
        if (!Array.isArray(constant.value)) {
          pushIssue(issues, handle, visualBlockId, 'Matrix constants must store component arrays.');
          continue;
        }
        const expectedComponents = expressionType.columns * expressionType.rows;
        if (constant.value.length !== expectedComponents) {
          pushIssue(issues, handle, visualBlockId, 'Matrix constant component count must match matrix dimensions.');
        }
      }
      continue;
    }

    if (expression.type === 'ArrayLength') {
      if (!isIntegerScalar(expressionType as NagaType)) {
        pushIssue(issues, handle, visualBlockId, 'ArrayLength result type must be integer scalar.');
      }
      continue;
    }

    if (expression.type === 'Access') {
      const indexTypeHandle = builder.getExpressionType(expression.index);
      if (indexTypeHandle === undefined) {
        pushIssue(issues, handle, visualBlockId, 'Access index is missing type metadata.');
        continue;
      }
      const indexType = builder.types.get(indexTypeHandle);
      if (!isIntegerScalar(indexType)) {
        pushIssue(issues, handle, visualBlockId, 'Access (array indexing) requires integer scalar index.');
      }
      continue;
    }

    if (expression.type === 'Load') {
      if (expression.pointer < 0) {
        pushIssue(issues, handle, visualBlockId, 'Load pointer handle must be non-negative.');
      }
      continue;
    }

    if (expression.type === 'AtomicResult') {
      const valueTypeHandle = builder.getExpressionType(expression.value);
      if (valueTypeHandle === undefined) {
        pushIssue(issues, handle, visualBlockId, 'Atomic operation value is missing type metadata.');
        continue;
      }
      const valueType = builder.types.get(valueTypeHandle);
      if (!isIntegerScalar(valueType)) {
        pushIssue(issues, handle, visualBlockId, 'Atomic operations strictly require integer payloads (Sint/Uint).');
      }
      if (expressionTypeHandle !== valueTypeHandle) {
        pushIssue(issues, handle, visualBlockId, 'AtomicResult type must match payload type.');
      }
      continue;
    }
  }

  for (let handle = 0; handle < statements.length; handle++) {
    const statement = statements[handle];
    const visualBlockId = builder.getStatementContext(handle)?.visualBlockId ?? null;

    if (statement.type === 'If') {
      const condTypeHandle = builder.getExpressionType(statement.condition);
      if (condTypeHandle === undefined) {
        pushIssue(issues, handle, visualBlockId, 'If statement condition is missing type metadata.', true);
        continue;
      }
      const condType = builder.types.get(condTypeHandle);
      if (!isBoolScalar(condType)) {
        pushIssue(issues, handle, visualBlockId, 'If statement condition strictly requires a boolean scalar.', true);
      }
      for (const acceptStatement of statement.accept) {
        try {
          builder.statements.get(acceptStatement);
        } catch {
          pushIssue(issues, handle, visualBlockId, 'If accept block contains an invalid nested statement handle.', true);
          break;
        }
      }
      for (const rejectStatement of statement.reject) {
        try {
          builder.statements.get(rejectStatement);
        } catch {
          pushIssue(issues, handle, visualBlockId, 'If reject block contains an invalid nested statement handle.', true);
          break;
        }
      }
      continue;
    }

    if (statement.type === 'StoreState' || statement.type === 'Store') {
      const valueTypeHandle = builder.getExpressionType(statement.value);
      if (valueTypeHandle === undefined) {
        pushIssue(issues, handle, visualBlockId, 'Store statement value is missing type metadata.', true);
      }
      continue;
    }

    if (statement.type === 'Loop') {
      for (const bodyStatement of statement.body) {
        try {
          builder.statements.get(bodyStatement);
        } catch {
          pushIssue(issues, handle, visualBlockId, 'Loop contains an invalid nested statement handle.', true);
          break;
        }
      }
      continue;
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
  throw new NagaValidationError(first.handle, first.visualBlockId, first.message, first.isStatement);
}
