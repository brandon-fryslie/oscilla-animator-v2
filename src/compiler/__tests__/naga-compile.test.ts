import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPatch } from '../../graph';
import { compile } from '../compile';

const hoisted = vi.hoisted(() => ({
  bootMock: vi.fn(async () => {}),
  compileMock: vi.fn((_: unknown, options?: { maxActiveLanes?: number }) => ({
    wgsl: `const MAX_ACTIVE_LANES: u32 = ${options?.maxActiveLanes ?? 1}u;\n@compute @workgroup_size(64, 1, 1)\nfn compute_main() {}`,
  })),
  MockNagaValidationError: class MockNagaValidationError extends Error {
    readonly errors: readonly { message: string; location: string; path: string }[];

    constructor(errors: readonly { message: string; location: string; path: string }[]) {
      super(errors.map((error) => error.message).join('; ') || 'Naga validation failed');
      this.name = 'NagaValidationError';
      this.errors = errors;
    }
  },
}));

vi.mock('../naga-bridge', () => ({
  NagaService: {
    boot: hoisted.bootMock,
    compile: hoisted.compileMock,
  },
  NagaValidationError: hoisted.MockNagaValidationError,
}));

import {
  compileProgramWithNaga,
  validateGpuPassSignaturesAtCompileBoundary,
} from '../naga-compile';

function buildSimplePatch() {
  return buildPatch((b) => {
    const time = b.addBlock('InfiniteTimeRoot');
    b.setPortDefault(time, 'periodAMs', 1000);
    b.setPortDefault(time, 'periodBMs', 2000);

    const osc = b.addBlock('Oscillator');
    b.wire(time, 'phaseA', osc, 'phase');
  });
}

describe('compileProgramWithNaga', () => {
  beforeEach(() => {
    hoisted.bootMock.mockClear();
    hoisted.compileMock.mockClear();
  });

  it('compiles lowering artifact to WGSL through NagaService boundary', async () => {
    const result = compile(buildSimplePatch());
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const compiled = await compileProgramWithNaga(result.program);
    expect(compiled.kind).toBe('ok');
    if (compiled.kind !== 'ok') return;

    expect(hoisted.bootMock).toHaveBeenCalledTimes(1);
    expect(hoisted.compileMock).toHaveBeenCalledTimes(1);
    expect(compiled.wgsl).toContain('@compute @workgroup_size(');
    expect(compiled.wgsl).toContain('fn compute_main');
  });

  it('passes canonical maxActiveLanes metadata to NagaService', async () => {
    const result = compile(buildSimplePatch());
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const expected = result.program.generatedComputeProgram.maxActiveLanes;

    const compiled = await compileProgramWithNaga(result.program);
    expect(compiled.kind).toBe('ok');
    if (compiled.kind !== 'ok') return;

    expect(hoisted.compileMock).toHaveBeenCalledTimes(1);
    const options = hoisted.compileMock.mock.calls[0]?.[1] as { maxActiveLanes?: number } | undefined;
    expect(options?.maxActiveLanes).toBe(expected);
    expect(compiled.wgsl).toContain(`const MAX_ACTIVE_LANES: u32 = ${expected}u;`);
  });

  it('fails when compiled program payload is missing lowering artifact', async () => {
    const result = compile(buildSimplePatch());
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const malformed = {
      ...result.program,
      nagaLoweringProgram: undefined,
    };
    const compiled = await compileProgramWithNaga(malformed as unknown as typeof result.program);
    expect(compiled.kind).toBe('error');
    if (compiled.kind !== 'error') return;
    expect(compiled.errors.some((error) => error.message.includes('Missing nagaLoweringProgram'))).toBe(true);
  });

  it('fails when compiled program payload is missing compute metadata', async () => {
    const result = compile(buildSimplePatch());
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const malformed = {
      ...result.program,
      generatedComputeProgram: undefined,
    };
    const compiled = await compileProgramWithNaga(malformed as unknown as typeof result.program);
    expect(compiled.kind).toBe('error');
    if (compiled.kind !== 'error') return;
    expect(compiled.errors.some((error) => error.message.includes('Missing generatedComputeProgram metadata'))).toBe(true);
  });

  it('maps statement validation failures to source block IDs', async () => {
    const result = compile(buildSimplePatch());
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const lowering = result.program.nagaLoweringProgram;

    const stmtEntry = Object.entries(lowering.sourceMap).find(
      ([key, value]) => key.startsWith('Stmt_') && value.blockId,
    );
    expect(stmtEntry).toBeDefined();
    if (!stmtEntry) return;

    const stmtId = Number.parseInt(stmtEntry[0].slice('Stmt_'.length), 10);
    const blockId = stmtEntry[1].blockId;
    expect(typeof blockId).toBe('string');
    if (typeof blockId !== 'string') return;

    hoisted.compileMock.mockImplementationOnce(() => {
      throw new hoisted.MockNagaValidationError([
        {
          message: 'Bad statement',
          location: `Statement [${stmtId}]`,
          path: 'Function [compute_main]',
        },
      ]);
    });

    const compiled = await compileProgramWithNaga(result.program);
    expect(compiled.kind).toBe('error');
    if (compiled.kind !== 'error') return;
    expect(compiled.errors.some((error) => error.where?.blockId === blockId)).toBe(true);
  });

  it('fails when maxActiveLanes metadata is invalid', async () => {
    const result = compile(buildSimplePatch());
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    const faultyProgram = {
      ...result.program,
      generatedComputeProgram: {
        ...result.program.generatedComputeProgram,
        maxActiveLanes: 0,
      },
    };

    const compiled = await compileProgramWithNaga(faultyProgram as typeof result.program);
    expect(compiled.kind).toBe('error');
    if (compiled.kind !== 'error') return;
    expect(
      compiled.errors.some((error) =>
        error.message.includes('generatedComputeProgram.maxActiveLanes is missing or invalid'),
      ),
    ).toBe(true);
  });
});

describe('validateGpuPassSignaturesAtCompileBoundary', () => {
  it('accepts valid compute pass signatures', () => {
    const result = validateGpuPassSignaturesAtCompileBoundary([
      {
        passId: 'simulation',
        stage: 'compute',
        entryPoint: 'compute_main',
        wgsl: '@compute @workgroup_size(64, 1, 1)\nfn compute_main() {}',
      },
    ]);
    expect(result).toMatchObject({
      kind: 'ok',
      signatures: [{
        passId: 'simulation',
        stage: 'compute',
        entryPoint: 'compute_main',
      }],
    });
  });

  it('rejects invalid stage metadata', () => {
    const result = validateGpuPassSignaturesAtCompileBoundary([
      {
        passId: 'simulation',
        stage: 'fragment',
        entryPoint: 'compute_main',
        wgsl: '@compute @workgroup_size(64, 1, 1)\nfn compute_main() {}',
      },
    ]);
    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    expect(result.errors.some((error) => error.message.includes('unsupported stage'))).toBe(true);
  });

  it('rejects WGSL payloads missing the declared entrypoint', () => {
    const result = validateGpuPassSignaturesAtCompileBoundary([
      {
        passId: 'simulation',
        stage: 'compute',
        entryPoint: 'compute_main',
        wgsl: '@compute @workgroup_size(64, 1, 1)\nfn wrong_entry() {}',
      },
    ]);
    expect(result.kind).toBe('error');
    if (result.kind !== 'error') return;
    expect(result.errors.some((error) => error.message.includes('missing fn compute_main'))).toBe(true);
  });
});
