/**
 * Payload Tester Fixtures — Registry
 *
 * [LAW:one-source-of-truth] Each fixture file is pure DSL text (a gpu({...}) expression).
 * Loaded as raw strings via import.meta.glob, evaluated via evalDsl() to produce payloads.
 * The same text is displayed in the DSL editor.
 */

import type { PipelineInstallPayload } from '../boundary-contract';
import { evalDsl } from '../../../payload-tester/dsl-eval';

// Load all fixture files as raw text at build time
const rawSources = import.meta.glob('./*.ts', { query: '?raw', eager: true, import: 'default' }) as Record<string, string>;

function loadFixture(filename: string): { payload: PipelineInstallPayload; dslSource: string } {
  const key = `./${filename}.ts`;
  const dslSource = rawSources[key];
  if (!dslSource) throw new Error(`Fixture file not found: ${key}`);
  const result = evalDsl(dslSource);
  if (!result.ok) throw new Error(`Fixture '${filename}' failed to compile: ${result.error}`);
  return { payload: result.payload, dslSource };
}

export interface PayloadFixture {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly payload: PipelineInstallPayload;
  readonly dslSource: string;
}

function fixture(id: string, name: string, description: string): PayloadFixture {
  const { payload, dslSource } = loadFixture(id);
  return { id, name, description, payload, dslSource };
}

export const PAYLOAD_FIXTURES: readonly PayloadFixture[] = [
  fixture('hello-triangle', 'Visible Triangle', 'Compute writes time-varying RGB, render draws a colored triangle.'),
  fixture('instanced-write', 'Instanced Ring', '64 instances in a ring via domain dispatch. Tests Cast, Intrinsic, instanced draw.'),
  fixture('for-loop-gradient', 'Loop Gradient', '32 bars with brightness from a For loop accumulator. Tests Var, Assign, For.'),
  fixture('hash-color', 'Hash Colors', '64 instances with PCG-hash-derived colors. Tests bitwise XOR, shift, AND.'),
  fixture('varying-gradient', 'Gradient Triangle', 'Per-vertex color as varying, GPU-interpolated. Tests vertex_index, varyings.'),
  fixture('texture-readwrite', 'Texture Pattern', 'Compute writes to storage texture, render reads via TextureLoad.'),
  fixture('sdf-circle', 'SDF Circle', 'Anti-aliased SDF circle. Tests dpdx, dpdy, fwidth, smoothstep.'),
  fixture('atomic-boids', 'Atomic Boids', '10,000 boids with atomic<u32> grid_cell. Tests AtomicOpField(Exchange).'),
  fixture('spirograph-trace', 'Spirograph Trace', '1000 points tracing a hypotrochoid. Rainbow color, alpha blending.'),
  fixture('conditional-ring', 'Conditional Ring', 'If, Var, Assign, LiteralBool, BinaryOp(==, !=, &&, ||, %), UnaryOp(!).'),
  fixture('search-break', 'Search Break', 'For+If+Break (nested early exit), Continue, BinaryOp(<=, >).'),
  fixture('bitfield-palette', 'Bitfield Palette', 'BinaryOp(|, <<, >=), UnaryOp(~). Bitfield manipulation for color.'),
  fixture('scalar-accumulator', 'Scalar Accumulator', 'LoadScalar + AtomicOpScalar(Add). Phase from scalar read, atomic counter.'),
];
