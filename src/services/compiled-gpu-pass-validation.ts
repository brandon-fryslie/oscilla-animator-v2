import type { GeneratedGpuArtifactManifestIR, GpuPassManifestEntryIR } from '../compiler/ir/program';
import type { CompileError } from '../compiler/types';
import type { CompiledGpuArtifactBundle, CompiledGpuPassArtifact, CompiledGpuPassSignature } from './compile-worker-protocol';

interface ValidCompiledGpuPassValidation {
  readonly kind: 'ok';
  readonly bundle: CompiledGpuArtifactBundle;
  readonly signatures: readonly CompiledGpuPassSignature[];
  readonly manifest: GeneratedGpuArtifactManifestIR;
}

interface InvalidCompiledGpuPassValidation {
  readonly kind: 'error';
  readonly errors: readonly CompileError[];
}

export type CompiledGpuPassValidationResult =
  | ValidCompiledGpuPassValidation
  | InvalidCompiledGpuPassValidation;

const WGSL_IDENTIFIER_PATTERN = /^[_A-Za-z][_0-9A-Za-z]*$/;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function createPassError(index: number, message: string): CompileError {
  return {
    code: 'IRValidationFailed',
    message: `Compiler emitted invalid GPU pass at passes[${index}]: ${message}`,
  };
}

function validatePassShape(
  pass: CompiledGpuPassArtifact,
  index: number,
  errors: CompileError[],
): CompiledGpuPassArtifact {
  const fallbackPassId = `invalid-pass-${index}`;
  const passId = isNonEmptyString(pass.passId)
    ? pass.passId
    : fallbackPassId;
  if (!isNonEmptyString(pass.passId)) {
    errors.push(createPassError(index, 'passId is required'));
  }

  const stage = pass.stage;
  if (stage !== 'compute') {
    errors.push(createPassError(index, `unsupported stage "${String(stage)}"`));
  }

  const entryPoint = isNonEmptyString(pass.entryPoint)
    ? pass.entryPoint
    : '';
  if (!isNonEmptyString(pass.entryPoint)) {
    errors.push(createPassError(index, `pass "${passId}" is missing entryPoint`));
  } else if (!WGSL_IDENTIFIER_PATTERN.test(pass.entryPoint)) {
    errors.push(createPassError(index, `pass "${passId}" has invalid entryPoint "${pass.entryPoint}"`));
  }

  const wgsl = isNonEmptyString(pass.wgsl)
    ? pass.wgsl
    : '';
  if (!isNonEmptyString(pass.wgsl)) {
    errors.push(createPassError(index, `pass "${passId}" is missing WGSL source`));
  }
  if (wgsl && !wgsl.includes('@compute')) {
    errors.push(createPassError(index, `pass "${passId}" is missing @compute entry annotation`));
  }
  if (wgsl && entryPoint) {
    const entryPattern = new RegExp(`\\bfn\\s+${escapeRegex(entryPoint)}\\s*\\(`);
    if (!entryPattern.test(wgsl)) {
      errors.push(createPassError(index, `pass "${passId}" is missing fn ${entryPoint}(...)`));
    }
  }

  return {
    passId,
    stage: 'compute',
    entryPoint,
    wgsl,
  };
}

/**
 * Validates compiler-emitted GPU pass signatures before runtime publication.
 *
 * // [LAW:single-enforcer] Compile worker owns semantic pass-signature
 * validation so runtime renderer install does not duplicate this policy.
 */
export function validateCompiledGpuPassBundle(bundle: CompiledGpuArtifactBundle): CompiledGpuPassValidationResult {
  const errors: CompileError[] = [];
  if (!Array.isArray(bundle.passes) || bundle.passes.length === 0) {
    errors.push({
      code: 'IRValidationFailed',
      message: 'Compiler emitted an empty GPU artifact pass bundle',
    });
  }

  // [LAW:dataflow-not-control-flow] Every emitted pass flows through the same
  // validation step; validity is represented in error data, not skipped ops.
  const validatedPasses = bundle.passes.map((pass, index) => validatePassShape(pass, index, errors));
  if (errors.length > 0) {
    return { kind: 'error', errors };
  }

  const signatures: GpuPassManifestEntryIR[] = validatedPasses.map((pass) => ({
    passId: pass.passId,
    stage: pass.stage,
    entryPoint: pass.entryPoint,
  }));

  return {
    kind: 'ok',
    bundle: {
      schemaVersion: bundle.schemaVersion,
      passes: validatedPasses,
    },
    signatures,
    manifest: {
      schemaVersion: 1,
      // [LAW:one-source-of-truth] Runtime pass-signature metadata is derived
      // only from compile-boundary validated pass signatures.
      passes: signatures,
    },
  };
}
