import type { GeneratedGpuArtifactManifestIR, GpuPassManifestEntryIR } from '../compiler/ir/program';
import type { CompileError } from '../compiler/types';
import type { CompiledGpuArtifactBundle, CompiledGpuPassArtifact } from './compile-worker-protocol';
import { CANONICAL_FLUID_PASS_STAGES } from './fluid-gpu-bundle';

interface ValidCompiledGpuPassValidation {
  readonly kind: 'ok';
  readonly bundle: CompiledGpuArtifactBundle;
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
// [LAW:one-source-of-truth] Derived from CANONICAL_FLUID_PASS_STAGES — no local duplicate.
const FLUID_PASS_ORDER: readonly string[] = CANONICAL_FLUID_PASS_STAGES.map(
  (stage) => `fluid.${stage}`,
);
const FLUID_PASS_INDEX: ReadonlyMap<string, number> = new Map(
  FLUID_PASS_ORDER.map((passId, index) => [passId, index]),
);

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

function createBundleError(message: string): CompileError {
  return {
    code: 'IRValidationFailed',
    message,
  };
}

function normalizePassId(pass: CompiledGpuPassArtifact, index: number, errors: CompileError[]): string {
  if (isNonEmptyString(pass.passId)) {
    return pass.passId;
  }
  errors.push(createPassError(index, 'passId is required'));
  return `invalid-pass-${index}`;
}

function normalizeEntryPoint(
  passId: string,
  pass: CompiledGpuPassArtifact,
  index: number,
  errors: CompileError[],
): string {
  if (!isNonEmptyString(pass.entryPoint)) {
    errors.push(createPassError(index, `pass "${passId}" is missing entryPoint`));
    return '';
  }
  if (!WGSL_IDENTIFIER_PATTERN.test(pass.entryPoint)) {
    errors.push(createPassError(index, `pass "${passId}" has invalid entryPoint "${pass.entryPoint}"`));
  }
  return pass.entryPoint;
}

function normalizeWgsl(passId: string, pass: CompiledGpuPassArtifact, index: number, errors: CompileError[]): string {
  if (isNonEmptyString(pass.wgsl)) {
    return pass.wgsl;
  }
  errors.push(createPassError(index, `pass "${passId}" is missing WGSL source`));
  return '';
}

function validatePassStage(pass: CompiledGpuPassArtifact, index: number, errors: CompileError[]): void {
  if (pass.stage !== 'compute') {
    errors.push(createPassError(index, `unsupported stage "${String(pass.stage)}"`));
  }
}

function validateWgslSignature(
  passId: string,
  entryPoint: string,
  wgsl: string,
  index: number,
  errors: CompileError[],
): void {
  if (!wgsl || !entryPoint) {
    return;
  }
  const entryPattern = new RegExp(
    `((?:\\s*@[\\w:]+(?:\\([^)]*\\))?)*)\\s*fn\\s+${escapeRegex(entryPoint)}\\s*\\(`,
  );
  const entryMatch = entryPattern.exec(wgsl);
  if (entryMatch === null) {
    errors.push(createPassError(index, `pass "${passId}" is missing fn ${entryPoint}(...)`));
    return;
  }
  const entryAttributes = entryMatch[1] ?? '';
  if (!entryAttributes.includes('@compute')) {
    errors.push(createPassError(index, `pass "${passId}" is missing @compute entry annotation`));
  }
}

function validateUniquePassIds(passes: readonly CompiledGpuPassArtifact[], errors: CompileError[]): void {
  const seenPassIds = new Set<string>();
  for (const [index, pass] of passes.entries()) {
    if (seenPassIds.has(pass.passId)) {
      errors.push(createPassError(index, `duplicate passId "${pass.passId}"`));
      continue;
    }
    seenPassIds.add(pass.passId);
  }
}

function findOutOfOrderFluidPass(fluidPassIds: readonly string[]): string | null {
  let cursor = -1;
  for (const passId of fluidPassIds) {
    const nextIndex = FLUID_PASS_INDEX.get(passId);
    if (nextIndex === undefined || nextIndex < cursor) {
      return passId;
    }
    cursor = nextIndex;
  }
  return null;
}

function validateFluidPassOrder(passes: readonly CompiledGpuPassArtifact[], errors: CompileError[]): void {
  const fluidPassIds = passes
    .filter((pass) => pass.passId.startsWith('fluid.'))
    .map((pass) => pass.passId);
  if (fluidPassIds.length === 0) {
    return;
  }
  const outOfOrderPassId = findOutOfOrderFluidPass(fluidPassIds);
  if (outOfOrderPassId !== null) {
    errors.push(createBundleError(`Compiler emitted invalid fluid pass order at "${outOfOrderPassId}"`));
  }
}

function validatePassShape(
  pass: CompiledGpuPassArtifact,
  index: number,
  errors: CompileError[],
): CompiledGpuPassArtifact {
  const passId = normalizePassId(pass, index, errors);
  validatePassStage(pass, index, errors);
  const entryPoint = normalizeEntryPoint(passId, pass, index, errors);
  const wgsl = normalizeWgsl(passId, pass, index, errors);
  validateWgslSignature(passId, entryPoint, wgsl, index, errors);

  return {
    passId,
    stage: 'compute',
    entryPoint,
    wgsl,
  };
}

function buildManifestFromPasses(passes: readonly CompiledGpuPassArtifact[]): GeneratedGpuArtifactManifestIR {
  const manifestPasses: GpuPassManifestEntryIR[] = passes.map((pass) => ({
    passId: pass.passId,
    stage: pass.stage,
    entryPoint: pass.entryPoint,
  }));
  return {
    schemaVersion: 1,
    // [LAW:one-source-of-truth] Runtime pass-signature metadata is derived
    // only from compile-boundary validated pass signatures.
    passes: manifestPasses,
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
  const passes = Array.isArray(bundle.passes) ? bundle.passes : [];
  if (passes.length === 0) {
    errors.push(createBundleError('Compiler emitted an empty GPU artifact pass bundle'));
  }

  // [LAW:dataflow-not-control-flow] Every emitted pass flows through the same
  // validation step; validity is represented in error data, not skipped ops.
  const validatedPasses = passes.map((pass, index) => validatePassShape(pass, index, errors));
  validateUniquePassIds(validatedPasses, errors);
  validateFluidPassOrder(validatedPasses, errors);

  if (errors.length > 0) {
    return { kind: 'error', errors };
  }

  return {
    kind: 'ok',
    bundle: {
      schemaVersion: bundle.schemaVersion,
      passes: validatedPasses,
    },
    manifest: buildManifestFromPasses(validatedPasses),
  };
}
