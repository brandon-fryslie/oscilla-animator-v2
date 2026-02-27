import type {
  NagaFunctionIR,
  NagaLoweringProgramIR,
  NagaStatementIR,
} from './naga-lowering';

export interface NagaLoweringValidationIssue {
  readonly code:
    | 'E_NAGA_ENTRYPOINT_MISSING'
    | 'E_NAGA_ENTRYPOINT_TARGET_MISSING'
    | 'E_NAGA_FUNCTION_MISSING'
    | 'E_NAGA_SOURCE_MAP_EXPR_MISSING'
    | 'E_NAGA_SOURCE_MAP_STMT_MISSING';
  readonly message: string;
}

function validateFunctionSourceMap(
  fn: NagaFunctionIR,
  sourceMap: Readonly<Record<string, unknown>>,
): NagaLoweringValidationIssue[] {
  const issues: NagaLoweringValidationIssue[] = [];

  for (let exprIndex = 0; exprIndex < fn.expressions.length; exprIndex++) {
    const key = `Expr_${exprIndex}`;
    if (!(key in sourceMap)) {
      issues.push({
        code: 'E_NAGA_SOURCE_MAP_EXPR_MISSING',
        message: `Naga lowering sourceMap is missing ${key}`,
      });
    }
  }

  for (let stmtIndex = 0; stmtIndex < fn.body.length; stmtIndex++) {
    const statement = fn.body[stmtIndex] as NagaStatementIR;
    if (statement.kind === 'comment') continue;
    const key = `Stmt_${stmtIndex}`;
    if (!(key in sourceMap)) {
      issues.push({
        code: 'E_NAGA_SOURCE_MAP_STMT_MISSING',
        message: `Naga lowering sourceMap is missing ${key}`,
      });
    }
  }

  return issues;
}

export function validateNagaLoweringProgram(
  artifact: NagaLoweringProgramIR,
): readonly NagaLoweringValidationIssue[] {
  const issues: NagaLoweringValidationIssue[] = [];
  const entryPoints = artifact.module.entry_points;

  if (entryPoints.length === 0) {
    issues.push({
      code: 'E_NAGA_ENTRYPOINT_MISSING',
      message: 'Naga lowering artifact must include at least one compute entry point',
    });
    return issues;
  }

  const computeEntry = entryPoints.find((entry) => entry.stage === 'compute');
  if (!computeEntry) {
    issues.push({
      code: 'E_NAGA_ENTRYPOINT_TARGET_MISSING',
      message: 'Naga lowering artifact has no compute-stage entry point',
    });
    return issues;
  }

  const fn = artifact.module.functions.find((candidate) => candidate.name === computeEntry.function);
  if (!fn) {
    issues.push({
      code: 'E_NAGA_FUNCTION_MISSING',
      message: `Naga lowering artifact entry point targets missing function "${computeEntry.function}"`,
    });
    return issues;
  }

  issues.push(...validateFunctionSourceMap(fn, artifact.sourceMap));
  return issues;
}

