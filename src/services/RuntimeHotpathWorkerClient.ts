import type { CompiledProgramIR } from '../compiler/ir/program';
import type { ExternalWriteBus } from '../runtime';
import { stripKernelRegistry } from './compile-worker-serialization';
import type {
  RuntimeExternalWrite,
  RuntimeHotpathWorkerInboundMessage,
  RuntimeHotpathWorkerOutboundMessage,
  RuntimeHotpathSinkTableSample,
} from './runtime-hotpath-worker-protocol';

export interface RuntimeHotpathWorkerStats {
  readonly frameCount: number;
  readonly meanTickMs: number;
  readonly lastTickMs: number;
  readonly drawOpCount: number;
  readonly sinkWordCount: number;
  readonly sinkTableSample: RuntimeHotpathSinkTableSample | null;
}

export interface RuntimeHotpathSharedPlanes {
  readonly sharedInput: SharedArrayBuffer;
  readonly sharedShapeBank: SharedArrayBuffer;
  readonly sharedSinkTable: SharedArrayBuffer;
}

export interface RuntimeHotpathViewportFrame {
  readonly width: number;
  readonly height: number;
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
}

export class RuntimeHotpathWorkerClient {
  private readonly worker: Worker;
  private disposed = false;
  private bootstrapped = false;
  private latestStats: RuntimeHotpathWorkerStats | null = null;
  private fatalError: Error | null = null;
  private lastViewportFrame: RuntimeHotpathViewportFrame | null = null;

  private constructor(
    worker: Worker,
    private readonly onFatal: (err: Error) => void,
  ) {
    this.worker = worker;
    this.worker.addEventListener('message', this.handleMessage);
    this.worker.addEventListener('error', this.handleError);
  }

  static async create(
    planes: RuntimeHotpathSharedPlanes,
    onFatal: (err: Error) => void,
  ): Promise<RuntimeHotpathWorkerClient> {
    const worker = new Worker(new URL('./runtime-hotpath.worker.ts', import.meta.url), {
      type: 'module',
    });
    const client = new RuntimeHotpathWorkerClient(worker, onFatal);
    await client.bootstrap(planes);
    return client;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.worker.removeEventListener('message', this.handleMessage);
    this.worker.removeEventListener('error', this.handleError);
    this.worker.postMessage({ type: 'SHUTDOWN' } satisfies RuntimeHotpathWorkerInboundMessage);
    this.worker.terminate();
  }

  getLatestStats(): RuntimeHotpathWorkerStats | null {
    return this.latestStats;
  }

  installProgram(program: CompiledProgramIR | null): void {
    if (!program) return;
    this.assertReady();
    this.worker.postMessage({
      type: 'INSTALL_PROGRAM',
      // [LAW:one-source-of-truth] Kernel registry reconstruction belongs in
      // worker runtime ownership; transport only carries clone-safe IR.
      program: stripKernelRegistry(program),
    } satisfies RuntimeHotpathWorkerInboundMessage);
  }

  setViewportFrame(frame: RuntimeHotpathViewportFrame): void {
    this.assertReady();
    const previous = this.lastViewportFrame;
    if (
      previous &&
      previous.width === frame.width &&
      previous.height === frame.height &&
      previous.zoom === frame.zoom &&
      previous.panX === frame.panX &&
      previous.panY === frame.panY
    ) {
      return;
    }
    // [LAW:dataflow-not-control-flow] Main thread always runs the same frame
    // path; unchanged viewport data is represented as an equal-value message.
    this.lastViewportFrame = frame;
    this.worker.postMessage({
      type: 'SET_VIEWPORT',
      width: frame.width,
      height: frame.height,
      zoom: frame.zoom,
      panX: frame.panX,
      panY: frame.panY,
    } satisfies RuntimeHotpathWorkerInboundMessage);
  }

  bindExternalWriteBus(writeBus: ExternalWriteBus): () => void {
    this.assertReady();
    const mutableBus = writeBus as ExternalWriteBus & {
      set(name: string, v: number): void;
      pulse(name: string): void;
      add(name: string, dv: number): void;
    };
    const originalSet = mutableBus.set.bind(writeBus);
    const originalPulse = mutableBus.pulse.bind(writeBus);
    const originalAdd = mutableBus.add.bind(writeBus);

    // [LAW:single-enforcer] Worker runtime is the single input-commit owner in
    // hot path mode, so bus writes are forwarded there and not queued locally.
    mutableBus.set = (name: string, v: number): void => {
      this.publishExternalWrites([{ op: 'set', name, v }]);
    };
    mutableBus.pulse = (name: string): void => {
      this.publishExternalWrites([{ op: 'pulse', name }]);
    };
    mutableBus.add = (name: string, dv: number): void => {
      this.publishExternalWrites([{ op: 'add', name, dv }]);
    };

    return () => {
      mutableBus.set = originalSet;
      mutableBus.pulse = originalPulse;
      mutableBus.add = originalAdd;
    };
  }

  private publishExternalWrites(writes: readonly RuntimeExternalWrite[]): void {
    if (writes.length === 0 || this.disposed || !this.bootstrapped) return;
    this.worker.postMessage({
      type: 'EXTERNAL_WRITES',
      writes,
    } satisfies RuntimeHotpathWorkerInboundMessage);
  }

  private async bootstrap(planes: RuntimeHotpathSharedPlanes): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const settle = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        this.worker.removeEventListener('message', onMessage);
        fn();
      };
      const onMessage = (event: MessageEvent<RuntimeHotpathWorkerOutboundMessage>): void => {
        const payload = event.data;
        if (!payload) return;
        if (payload.type === 'BOOTSTRAP_SUCCESS') {
          settle(resolve);
          return;
        }
        if (payload.type === 'FATAL') {
          settle(() => reject(new Error(`[${payload.code}] ${payload.message}`)));
        }
      };
      this.worker.addEventListener('message', onMessage);
      this.worker.postMessage({
        type: 'BOOTSTRAP',
        sharedInput: planes.sharedInput,
        sharedShapeBank: planes.sharedShapeBank,
        sharedSinkTable: planes.sharedSinkTable,
      } satisfies RuntimeHotpathWorkerInboundMessage);
    });
    this.bootstrapped = true;
  }

  private assertReady(): void {
    if (this.fatalError) throw this.fatalError;
    if (this.disposed) {
      throw new Error('Runtime hotpath worker has been disposed');
    }
    if (!this.bootstrapped) {
      throw new Error('Runtime hotpath worker is not bootstrapped');
    }
  }

  private readonly handleMessage = (event: MessageEvent<RuntimeHotpathWorkerOutboundMessage>): void => {
    const payload = event.data;
    if (!payload) return;
    if (payload.type === 'HEARTBEAT') {
      this.latestStats = {
        frameCount: payload.frameCount,
        meanTickMs: payload.meanTickMs,
        lastTickMs: payload.lastTickMs,
        drawOpCount: payload.drawOpCount,
        sinkWordCount: payload.sinkWordCount,
        sinkTableSample: payload.sinkTableSample ?? null,
      };
      return;
    }
    if (payload.type === 'FATAL') {
      this.fatalError = new Error(`[${payload.code}] ${payload.message}`);
      this.onFatal(this.fatalError);
    }
  };

  private readonly handleError = (event: ErrorEvent): void => {
    this.fatalError = new Error(event.message || 'Runtime hotpath worker crashed');
    this.onFatal(this.fatalError);
  };
}
