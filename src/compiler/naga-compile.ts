import type { CompileError } from './types';
import { NagaService, NagaValidationError } from './naga-bridge';
import type { CompiledProgramIR } from './ir/program';

interface NagaSourceRef {
  readonly blockId: string | null;
}

export type NagaCompilationOutcome =
  | { readonly kind: 'ok'; readonly wgsl: string }
  | { readonly kind: 'error'; readonly errors: readonly CompileError[] };

function parseMaxActiveLanes(maxActiveLanes: number | undefined): number | undefined {
  if (typeof maxActiveLanes !== 'number') return undefined;
  const parsed = Math.trunc(maxActiveLanes);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

function parseSourceHandle(value: string): { readonly kind: 'expression' | 'statement'; readonly id: number } | null {
  const match = /(Expression|Statement)\s*\[(\d+)\]/i.exec(value);
  if (!match) return null;
  const id = Number.parseInt(match[2], 10);
  if (!Number.isFinite(id)) return null;
  return {
    kind: match[1].toLowerCase() === 'statement' ? 'statement' : 'expression',
    id,
  };
}

function toCompileErrors(
  error: NagaValidationError,
  sourceMap: Readonly<Record<string, NagaSourceRef>>,
): readonly CompileError[] {
  return error.errors.map((entry) => {
    const handle = parseSourceHandle(entry.location);
    const sourceRef =
      handle?.kind === 'statement'
        ? sourceMap[`Stmt_${handle.id}`]
        : handle?.kind === 'expression'
          ? sourceMap[`Expr_${handle.id}`]
          : undefined;
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

  const generatedComputeProgram = program.generatedComputeProgram;
  if (!generatedComputeProgram) {
    return {
      kind: 'error',
      errors: [
        {
          code: 'IRValidationFailed',
          message: 'Missing generatedComputeProgram metadata on compiled IR',
        },
      ],
    };
  }

  const maxActiveLanes = parseMaxActiveLanes(generatedComputeProgram.maxActiveLanes);
  if (!maxActiveLanes) {
    return {
      kind: 'error',
      errors: [
        {
          code: 'IRValidationFailed',
          message: 'generatedComputeProgram.maxActiveLanes is missing or invalid',
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
