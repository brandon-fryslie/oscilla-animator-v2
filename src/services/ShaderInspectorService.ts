import type { RustRendererGpuPass } from '../render/rust/worker-protocol';

export interface ShaderInspectorSnapshot {
  readonly updatedAtMs: number;
  readonly passes: readonly RustRendererGpuPass[];
}

type Listener = () => void;

class ShaderInspectorService {
  private snapshot: ShaderInspectorSnapshot | null = null;
  private readonly listeners = new Set<Listener>();

  getSnapshot(): ShaderInspectorSnapshot | null {
    return this.snapshot;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setPasses(passes: readonly RustRendererGpuPass[]): void {
    // [LAW:one-source-of-truth] Shader inspector snapshot is sourced from the
    // canonical runtime-installed pass bundle, not ad-hoc compiler side-copies.
    this.snapshot = {
      updatedAtMs: performance.now(),
      passes: passes.map((pass) => ({ ...pass })),
    };
    this.emit();
  }

  clear(): void {
    this.snapshot = null;
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const shaderInspector = new ShaderInspectorService();

