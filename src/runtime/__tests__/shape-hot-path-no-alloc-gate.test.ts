import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME_DIR = path.resolve(TEST_DIR, '..');

function readRuntimeFile(name: string): string {
  return fs.readFileSync(path.join(RUNTIME_DIR, name), 'utf8');
}

describe('shape hot-path no-alloc gate', () => {
  it('removes legacy shape2d record writes from frame executors', () => {
    const scheduleExecutor = readRuntimeFile('ScheduleExecutor.ts');
    const steppedExecutor = readRuntimeFile('executeFrameStepped.ts');

    // [LAW:one-source-of-truth] Shape handles are emitted through numeric arena writes;
    // legacy packed shape2d write paths must not reappear in executor hot loops.
    expect(scheduleExecutor).not.toMatch(/writeShape2D\s*\(/);
    expect(steppedExecutor).not.toMatch(/writeShape2D\s*\(/);
  });

  it('avoids shape2d object unpack helper in RenderAssembler hot grouping loop', () => {
    const renderAssembler = readRuntimeFile('RenderAssembler.ts');

    // [LAW:verifiable-goals] Static gate prevents reintroducing per-instance object
    // unpack allocation in render grouping hot path.
    expect(renderAssembler).not.toMatch(/readShape2D\s*\(/);
  });

  it('forbids Path2D allocation in runtime hot modules', () => {
    const renderAssembler = readRuntimeFile('RenderAssembler.ts');
    const materializer = readRuntimeFile('ValueExprMaterializer.ts');
    const scheduleExecutor = readRuntimeFile('ScheduleExecutor.ts');

    expect(renderAssembler).not.toMatch(/new\s+Path2D\s*\(/);
    expect(materializer).not.toMatch(/new\s+Path2D\s*\(/);
    expect(scheduleExecutor).not.toMatch(/new\s+Path2D\s*\(/);
  });
});
