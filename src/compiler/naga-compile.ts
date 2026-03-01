import type { CompileError } from './types';
import { NagaService, NagaValidationError } from './naga-bridge';
import type { CompiledProgramIR } from './ir/program';

interface NagaSourceRef {
  readonly blockId: string | null;
}

export type NagaCompilationOutcome =
  | { readonly kind: 'ok'; readonly wgsl: string }
  | { readonly kind: 'error'; readonly errors: readonly CompileError[] };

function parseExpressionId(value: string): number | null {
  const match = /Expression\s*\[(\d+)\]/i.exec(value);
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

function toCompileErrors(
  error: NagaValidationError,
  sourceMap: Readonly<Record<string, NagaSourceRef>>,
): readonly CompileError[] {
  return error.errors.map((entry) => {
    const exprId = parseExpressionId(entry.location);
    const sourceRef = exprId === null ? undefined : sourceMap[`Expr_${exprId}`];
    const where = sourceRef?.blockId ? { blockId: sourceRef.blockId } : undefined;
    return {
      code: 'IRValidationFailed',
      message: `${entry.message} (${entry.location})`,
      where,
      details: { path: entry.path },
    } as const;
  });
}

export async function compileProgramWithNaga(
  program: CompiledProgramIR,
): Promise<NagaCompilationOutcome> {
  const lowering = program.nagaLoweringProgram;
  if (!lowering) {
    return {
      kind: 'error',
      errors: [
        {
          code: 'IRValidationFailed',
          message: 'Missing nagaLoweringProgram on compiled IR',
        },
      ],
    };
  }

  const maxActiveLanes = lowering.compute?.maxActiveLanes;
  if (
    typeof maxActiveLanes !== 'number'
    || !Number.isFinite(maxActiveLanes)
    || maxActiveLanes <= 0
  ) {
    return {
      kind: 'error',
      errors: [
        {
          code: 'IRValidationFailed',
          message: 'Missing or invalid nagaLoweringProgram.compute.maxActiveLanes on compiled IR',
        },
      ],
    };
  }

  try {
    await NagaService.boot();
    const compiled = NagaService.compile(lowering.module, {
      maxActiveLanes: Math.max(1, Math.trunc(maxActiveLanes)),
    });
    return {
      kind: 'ok',
      wgsl: compiled.wgsl,
    };
  } catch (error) {
    if (error instanceof NagaValidationError) {
      return {
        kind: 'error',
        errors: toCompileErrors(error, lowering.sourceMap),
      };
    }
    return {
      kind: 'error',
      errors: [
        {
          code: 'IRValidationFailed',
          message: `Naga compilation bridge failure: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}
