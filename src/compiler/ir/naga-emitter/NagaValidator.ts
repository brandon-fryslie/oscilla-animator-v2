import { NagaBuilder } from './NagaBuilder';
import { NagaBinaryOp, NagaHandle, NagaScalarKind, NagaType } from './naga-types';

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

export function collectNagaValidationIssues(builder: NagaBuilder): readonly NagaValidationIssue[] {
  // [LAW:single-enforcer] All emitter expression validation is performed in one validator pass.
  const issues: NagaValidationIssue[] = [];
  const expressions = builder.expressions.toArray();

  for (let handle = 0; handle < expressions.length; handle++) {
    const expression = expressions[handle];
    if (expression.type !== 'Binary') {
      continue;
    }

    const leftTypeHandle = builder.getExpressionType(expression.left);
    const rightTypeHandle = builder.getExpressionType(expression.right);
    const visualBlockId = builder.getExpressionContext(handle)?.visualBlockId ?? null;

    if (leftTypeHandle === undefined || rightTypeHandle === undefined) {
      issues.push({
        handle,
        visualBlockId,
        message: 'Binary expression has missing operand type metadata.',
      });
      continue;
    }

    if (leftTypeHandle !== rightTypeHandle) {
      issues.push({
        handle,
        visualBlockId,
        message: 'Type mismatch for ' + expression.op + ' operation.',
      });
      continue;
    }

    const leftType = builder.types.get(leftTypeHandle);
    if (!isValidBinaryOperand(leftType)) {
      const op = expression.op === NagaBinaryOp.Add ? 'Add' : String(expression.op);
      issues.push({
        handle,
        visualBlockId,
        message: op + ' does not accept operand type ' + leftType.kind + '.',
      });
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
