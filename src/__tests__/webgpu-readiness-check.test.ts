// @vitest-environment node

import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

const execFileAsync = promisify(execFile);

const SCRIPT_PATH = path.resolve('scripts/webgpu-readiness-check.mjs');
const SYNC_SCRIPT_PATH = path.resolve('scripts/sync-webgpu-proof-from-matrix.mjs');
const SOURCE_PROOF_DIR = path.resolve('migration-proof');
const SOURCE_ARTIFACTS_DIR = path.resolve('artifacts');

async function writeCanonicalPassingMatrixReport(workspace: string): Promise<void> {
  const w15 = JSON.parse(
    await readFile(path.join(workspace, 'migration-proof', 'w15-browser-matrix-perf.json'), 'utf8'),
  );
  const chromium = w15.results?.chromium ?? {};
  const reportGeneratedAt = String(w15.artifact?.report_generated_at ?? '2026-02-24T17:39:03.960Z');
  const url = String(w15.artifact?.url ?? 'http://127.0.0.1:5174/?showPreview=true');
  const sampleFrames = Number(w15.artifact?.sample_frames ?? 180);

  const report = {
    generatedAt: reportGeneratedAt,
    sampleFrames,
    url,
    server: {
      startServer: true,
      buildFirst: true,
      mode: 'preview',
      allowReuse: true,
    },
    skipPolicy: {
      failOnSkip: false,
    },
    results: [
      {
        browser: 'chromium',
        blocking: true,
        status: 'passed',
        browserVersion: chromium.browser_version ?? null,
        url,
        startedAt: reportGeneratedAt,
        durationMs: 0,
        readiness: {
          hasNavigatorGpu: Boolean(chromium.readiness?.hasNavigatorGpu ?? true),
          hasAdapter: Boolean(chromium.readiness?.hasAdapter ?? true),
          hasCanvas: Boolean(chromium.readiness?.hasCanvas ?? true),
          hasWebGPUContext: Boolean(chromium.readiness?.hasWebGPUContext ?? true),
          runtimeProbePresent: true,
          bootstrapSucceeded: true,
          frameAdvanceDetected: true,
          runtimeProbe: {
            present: true,
            bootstrapState: 'succeeded',
            bootstrapFailureMessage: null,
            bootstrapReadyBeforeSample: true,
            renderedFramesBeforeSample: 0,
            renderedFramesAfterSample: sampleFrames,
            frameAdvanceCount: sampleFrames,
          },
          consoleErrorCount: Number(chromium.readiness?.consoleErrorCount ?? 0),
          pageErrorCount: Number(chromium.readiness?.pageErrorCount ?? 0),
        },
        timing: {
          sampleCount: Number(chromium.timing?.sampleCount ?? sampleFrames),
          avgFrameDeltaMs: Number(chromium.timing?.avgFrameDeltaMs ?? 8.333),
          p95FrameDeltaMs: Number(chromium.timing?.p95FrameDeltaMs ?? 9.3),
          avgFps: Number(chromium.timing?.avgFps ?? 120),
        },
        errors: {
          console: [],
          page: [],
          setup: [],
        },
        failureReason: null,
        passed: true,
        skipped: false,
      },
    ],
    skippedCount: 0,
    gatingBrowsers: ['chromium'],
    nonBlockingBrowsers: [],
    passed: true,
    hardPassed: true,
  };

  await writeFile(
    path.join(workspace, 'artifacts', 'webgpu-browser-matrix.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}

async function buildSandboxWorkspace(): Promise<string> {
  const workspace = await mkdtemp(path.join(tmpdir(), 'oscilla-readiness-'));
  await mkdir(path.join(workspace, 'migration-proof'), { recursive: true });
  await mkdir(path.join(workspace, 'artifacts'), { recursive: true });

  await cp(SOURCE_PROOF_DIR, path.join(workspace, 'migration-proof'), { recursive: true });
  await cp(
    path.join(SOURCE_ARTIFACTS_DIR, 'webgpu-browser-matrix.json'),
    path.join(workspace, 'artifacts', 'webgpu-browser-matrix.json'),
  );
  await writeCanonicalPassingMatrixReport(workspace);

  return workspace;
}

const sandboxes: string[] = [];

afterEach(async () => {
  await Promise.all(
    sandboxes.map(async (workspace) => {
      await rm(workspace, { recursive: true, force: true });
    }),
  );
  sandboxes.length = 0;
});

describe('webgpu-readiness-check', () => {
  it('emits overall=ready when artifacts are complete', async () => {
    const workspace = await buildSandboxWorkspace();
    sandboxes.push(workspace);

    const result = await execFileAsync('node', [SCRIPT_PATH], {
      cwd: workspace,
    });

    expect(result.stdout).toContain('overall: ready');

    const report = JSON.parse(
      await readFile(path.join(workspace, 'artifacts', 'webgpu-readiness.json'), 'utf8'),
    );

    expect(report.overall).toBe('ready');
    expect(report.blockers).toEqual([]);
    expect(report.gates.G1.passed).toBe(true);
    expect(report.gates.G5.passed).toBe(true);
  });

  it('fails with overall=not_ready when a required workstream is non-terminal', async () => {
    const workspace = await buildSandboxWorkspace();
    sandboxes.push(workspace);

    const w2Path = path.join(workspace, 'migration-proof', 'w2-slotmeta-runtime-removal.json');
    const w2 = JSON.parse(await readFile(w2Path, 'utf8'));
    w2.status = 'slice_completed';
    await writeFile(w2Path, `${JSON.stringify(w2, null, 2)}\n`);

    await expect(
      execFileAsync('node', [SCRIPT_PATH], {
        cwd: workspace,
      }),
    ).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('overall: not_ready'),
    });

    const report = JSON.parse(
      await readFile(path.join(workspace, 'artifacts', 'webgpu-readiness.json'), 'utf8'),
    );

    expect(report.overall).toBe('not_ready');
    expect(report.gates.G1.passed).toBe(false);
    expect(report.gates.G5.passed).toBe(false);
    expect(report.blockers.some((b: { workstream?: string }) => b.workstream === 'W2')).toBe(
      true,
    );
  });

  it('fails when Safari/WebKit policy terms reappear in gated files', async () => {
    const workspace = await buildSandboxWorkspace();
    sandboxes.push(workspace);

    const w10Path = path.join(workspace, 'migration-proof', 'w10-webgpu-contract.json');
    const w10 = JSON.parse(await readFile(w10Path, 'utf8'));
    w10.notes = [...(w10.notes ?? []), 'Safari lane should be required'];
    await writeFile(w10Path, `${JSON.stringify(w10, null, 2)}\n`);

    await expect(
      execFileAsync('node', [SCRIPT_PATH], {
        cwd: workspace,
      }),
    ).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('overall: not_ready'),
    });

    const report = JSON.parse(
      await readFile(path.join(workspace, 'artifacts', 'webgpu-readiness.json'), 'utf8'),
    );

    expect(report.overall).toBe('not_ready');
    expect(report.gates.G5.passed).toBe(false);
    expect(
      report.blockers.some(
        (b: { code?: string; message?: string }) =>
          b.code === 'deprecated_browser_vocab' &&
          (b.message?.includes('Safari') || b.message?.includes('WebKit')),
      ),
    ).toBe(true);
  });

  it('syncs W15 proof from matrix artifact deterministically', async () => {
    const workspace = await buildSandboxWorkspace();
    sandboxes.push(workspace);

    const w10Path = path.join(workspace, 'migration-proof', 'w10-webgpu-contract.json');
    const w15Path = path.join(workspace, 'migration-proof', 'w15-browser-matrix-perf.json');
    const w10Before = JSON.parse(await readFile(w10Path, 'utf8'));
    const w15Before = JSON.parse(await readFile(w15Path, 'utf8'));
    const w10MatrixIndex = w10Before.verification.findIndex((entry: { command?: string }) =>
      String(entry.command ?? '').includes('test:webgpu-matrix'),
    );
    w10Before.verification[w10MatrixIndex].exit_code = 99;
    await writeFile(w10Path, `${JSON.stringify(w10Before, null, 2)}\n`);

    w15Before.artifact.report_generated_at = '2000-01-01T00:00:00.000Z';
    w15Before.results.chromium.timing.avgFrameDeltaMs = 0;
    await writeFile(w15Path, `${JSON.stringify(w15Before, null, 2)}\n`);

    const syncResult = await execFileAsync('node', [SYNC_SCRIPT_PATH], {
      cwd: workspace,
    });
    expect(syncResult.stdout).toContain('updated');

    const matrix = JSON.parse(
      await readFile(path.join(workspace, 'artifacts', 'webgpu-browser-matrix.json'), 'utf8'),
    );
    const w10After = JSON.parse(await readFile(w10Path, 'utf8'));
    const w15After = JSON.parse(await readFile(w15Path, 'utf8'));

    const w10MatrixAfter = w10After.verification.find((entry: { command?: string }) =>
      String(entry.command ?? '').includes('test:webgpu-matrix'),
    );
    expect(w10MatrixAfter.exit_code).toBe(matrix.passed ? 0 : 1);

    expect(w15After.artifact.report_generated_at).toBe(matrix.generatedAt);
    expect(w15After.artifact.overall_passed).toBe(matrix.passed);
    expect(w15After.results.chromium.timing.avgFrameDeltaMs).toBe(
      matrix.results[0].timing.avgFrameDeltaMs,
    );
  });
});
