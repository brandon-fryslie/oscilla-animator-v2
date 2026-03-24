import type { NagaModuleIR } from './ir/naga-emitter';
import type { MemoryManifestIR } from './ir/program';
import initShim, {
  compile_ir,
  compile_ir_with_manifest,
  type ShimBootStage,
  type ShimFormattedError,
} from './wasm/oscilla_naga_shim';

export interface NagaCompilationResult {
  readonly wgsl: string;
}

export interface NagaCompileOptions {
  readonly maxActiveLanes?: number;
  readonly memoryManifest?: MemoryManifestIR;
}

export interface NagaBootOptions {
  readonly onStage?: (stage: ShimBootStage) => void;
}

export class NagaValidationError extends Error {
  readonly errors: readonly ShimFormattedError[];

  constructor(errors: readonly ShimFormattedError[]) {
    super(errors.map((error) => error.message).join('; ') || 'Naga validation failed');
    this.name = 'NagaValidationError';
    this.errors = errors;
  }
}

export class NagaService {
  private static bootPromise: Promise<void> | null = null;
  private static ready = false;

  static async boot(options?: NagaBootOptions): Promise<void> {
    if (this.ready) return;
    if (!this.bootPromise) {
      // [LAW:single-enforcer] Naga WASM/bootstrap lifecycle is owned by one
      // service boundary to avoid duplicate initialization races.
      this.bootPromise = initShim({ onStage: options?.onStage })
        .then(() => {
          this.ready = true;
        })
        .catch((error) => {
          this.bootPromise = null;
          throw error;
        });
    }
    await this.bootPromise;
  }

  static compile(module: NagaModuleIR, options?: NagaCompileOptions): NagaCompilationResult {
    if (!this.ready) {
      throw new Error('NagaService.compile called before boot');
    }
    const result = options?.memoryManifest
      ? compile_ir_with_manifest(module, options.memoryManifest, options.maxActiveLanes)
      : compile_ir(module, options?.maxActiveLanes);
    if (!result.is_valid) {
      throw new NagaValidationError(result.errors);
    }
    return { wgsl: result.wgsl };
  }
}
