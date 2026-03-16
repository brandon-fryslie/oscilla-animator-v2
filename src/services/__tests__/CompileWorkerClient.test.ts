import { afterEach, describe, expect, it, vi } from 'vitest';
import { CompileSupersededError, CompileWorkerClient } from '../CompileWorkerClient';
import type { CompileWorkerRequest, CompileWorkerResponse } from '../compile-worker-protocol';
import type { Patch } from '../../graph';

class FakeWorker {
  static instances: FakeWorker[] = [];

  onmessage: ((event: MessageEvent<CompileWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly posted: CompileWorkerRequest[] = [];
  terminated = false;

  constructor(_url: URL, _options: WorkerOptions) {
    FakeWorker.instances.push(this);
  }

  postMessage(message: CompileWorkerRequest): void {
    this.posted.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  emitCompiled(requestId: number, patchRevision: number): void {
    this.onmessage?.({
      data: {
        kind: 'compiled',
        requestId,
        patchRevision,
        durationMs: 1,
        frontendResult: {} as any,
        backendResult: null,
      },
    } as MessageEvent<CompileWorkerResponse>);
  }
}

function makeEmptyPatch(): Patch {
  return {
    blocks: new Map(),
    edges: [],
  };
}

async function flushAsyncDispatch(turns: number = 4): Promise<void> {
  for (let i = 0; i < turns; i++) {
    await Promise.resolve();
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('CompileWorkerClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeWorker.instances.length = 0;
  });

  it('keeps only the latest queued compile while one request is in flight', async () => {
    vi.stubGlobal('Worker', FakeWorker as unknown as typeof Worker);
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: () => 'application/wasm' },
      arrayBuffer: async () => new Uint8Array([0x00, 0x61, 0x73, 0x6d]).buffer,
    })) as unknown as typeof fetch);

    const client = new CompileWorkerClient();
    const patch = makeEmptyPatch();

    const p1 = client.compile({ patch, patchRevision: 1 });
    const worker = FakeWorker.instances[0]!;
    await flushAsyncDispatch();
    expect(worker.posted.map((msg) => msg.patchRevision)).toEqual([1]);

    const p2 = client.compile({ patch, patchRevision: 2 });
    const p3 = client.compile({ patch, patchRevision: 3 });

    await expect(p1).rejects.toBeInstanceOf(CompileSupersededError);
    await expect(p2).rejects.toBeInstanceOf(CompileSupersededError);

    // No worker backlog while request #1 is still running.
    await flushAsyncDispatch();
    expect(worker.posted.map((msg) => msg.patchRevision)).toEqual([1]);

    worker.emitCompiled(1, 1);
    await flushAsyncDispatch();
    expect(worker.posted.map((msg) => msg.patchRevision)).toEqual([1, 3]);

    worker.emitCompiled(3, 3);
    await expect(p3).resolves.toMatchObject({ sourcePatchRevision: 3 });

    client.dispose();
    expect(worker.terminated).toBe(true);
  });
});
