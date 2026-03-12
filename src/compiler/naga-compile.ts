import type { CompileError } from './types';
import { NagaService, NagaValidationError } from './naga-bridge';
import type { CompiledProgramIR } from './ir/program';

interface NagaSourceRef {
  readonly blockId: string | null;
}

export type NagaCompilationOutcome =
  | { readonly kind: 'ok'; readonly wgsl: string }
  | { readonly kind: 'error'; readonly errors: readonly CompileError[] };

export interface GpuPassSignatureCandidate {
  readonly passId: string;
  readonly stage: string;
  readonly entryPoint: string;
  readonly wgsl: string;
}

export interface ValidatedGpuPassSignature {
  readonly passId: string;
  readonly stage: 'compute';
  readonly entryPoint: string;
}

export type GpuPassSignatureValidationOutcome =
  | { readonly kind: 'ok'; readonly signatures: readonly ValidatedGpuPassSignature[] }
  | { readonly kind: 'error'; readonly errors: readonly CompileError[] };

function parseMaxActiveLanes(maxActiveLanes: number): number | undefined {
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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function escapeRegex(source: string): string {
  return source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isValidWgslIdentifier(value: string): boolean {
  return /^[_A-Za-z][_A-Za-z0-9]*$/.test(value);
}

function makeGpuPassError(message: string): CompileError {
  return {
    code: 'IRValidationFailed',
    message,
  };
}

export function validateGpuPassSignaturesAtCompileBoundary(
  passes: readonly GpuPassSignatureCandidate[],
): GpuPassSignatureValidationOutcome {
  if (passes.length === 0) {
    return {
      kind: 'error',
      errors: [makeGpuPassError('Compiler emitted an empty GPU artifact pass bundle')],
    };
  }

  const signatures: ValidatedGpuPassSignature[] = [];
  const errors: CompileError[] = [];
  for (const [index, pass] of passes.entries()) {
    const passRef = isNonEmptyString(pass.passId) ? `"${pass.passId}"` : `at index ${index}`;
    if (!isNonEmptyString(pass.passId)) {
      errors.push(makeGpuPassError(`GPU pass contract violation: pass ${index} is missing passId`));
      continue;
    }
    if (pass.stage !== 'compute') {
      errors.push(
        makeGpuPassError(`GPU pass contract violation: pass ${passRef} has unsupported stage "${String(pass.stage)}"`),
      );
      continue;
    }
    if (!isNonEmptyString(pass.entryPoint)) {
      errors.push(makeGpuPassError(`GPU pass contract violation: pass ${passRef} is missing entryPoint`));
      continue;
    }
    if (!isValidWgslIdentifier(pass.entryPoint)) {
      errors.push(
        makeGpuPassError(
          `GPU pass contract violation: pass ${passRef} has invalid entryPoint "${pass.entryPoint}"`,
        ),
      );
      continue;
    }
    if (!isNonEmptyString(pass.wgsl)) {
      errors.push(makeGpuPassError(`GPU pass contract violation: pass ${passRef} is missing WGSL source`));
      continue;
    }
    if (!pass.wgsl.includes('@compute')) {
      errors.push(
        makeGpuPassError(`GPU pass contract violation: pass ${passRef} WGSL is missing @compute annotation`),
      );
      continue;
    }

    const entryPattern = new RegExp(`\\bfn\\s+${escapeRegex(pass.entryPoint)}\\s*\\(`);
    if (!entryPattern.test(pass.wgsl)) {
      errors.push(
        makeGpuPassError(
          `GPU pass contract violation: pass ${passRef} WGSL is missing fn ${pass.entryPoint}(...)`,
        ),
      );
      continue;
    }

    signatures.push({
      passId: pass.passId,
      stage: 'compute',
      entryPoint: pass.entryPoint,
    });
  }

  return errors.length > 0
    ? {
        kind: 'error',
        errors,
      }
    : {
        kind: 'ok',
        signatures,
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
  // [LAW:single-enforcer] Naga compile boundary validates malformed payloads
  // from untyped callers before crossing into the Naga bridge.
  const unsafeProgram = program as Partial<Pick<CompiledProgramIR, 'nagaLoweringProgram' | 'generatedComputeProgram'>>;
  const lowering = unsafeProgram.nagaLoweringProgram;
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
  const generatedComputeProgram = unsafeProgram.generatedComputeProgram;
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
