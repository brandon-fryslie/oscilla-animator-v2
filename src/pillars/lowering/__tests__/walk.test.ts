/**
 * src/pillars/lowering/__tests__/walk.test.ts
 *
 * Phase boundary test for the walker. Imports ONLY lowering/, block-api,
 * boundary-contract, ir-builders, and the frontend types module (type-only).
 * Does NOT import blocks/, block-dsl/, or frontend/build-normalized-graph
 * — the structural proof that the walker is generic over node closures.
 */

import { describe, it, expect } from 'vitest';
import { litF32 } from '../../../render/gpu-ir/ir-builders';
import type {
  ComputePassSpec,
  RenderPassSpec,
} from '../../../render/rust/boundary-contract';
import type {
  LoweredBlock,
  LoweringContext,
  MaterialSpec,
  NodeId,
} from '../../block-api';
import type { NormalizedGraph } from '../../frontend/normalized-graph';
import { lowerNormalizedGraph } from '../index';

describe('lowering: walker is opaque over node closures', () => {
  it('lowers a hand-rolled graph of bundle + sink closures', () => {
    const bundleNode = {
      id: 'gen' as NodeId,
      manifestContribution: {
        domains: {
          test: {
            capacity: 4,
            activeLanesSymbol: 'test:active' as never,
            fields: { v: { type: 'f32' as const, clearValue: 0 } } as never,
          } as never,
        },
      },
      lower: (): LoweredBlock => ({
        kind: 'bundle',
        output: { v: litF32(1) },
        domainId: 'test',
      }),
    };
    const sinkPass: ComputePassSpec = {
      type: 'Compute',
      passId: 'sink_pass',
      sourceBlockIds: ['sink'],
      workgroupSize: [1, 1, 1],
      dispatch: { mode: 'Domain', domainId: 'test' as never },
      dependencies: { requiresGlobals: false, domains: {}, textures: {} },
      ast: [],
    };
    const sinkNode = {
      id: 'sink' as NodeId,
      manifestContribution: {},
      lower: (): LoweredBlock => ({ kind: 'intent', passes: [sinkPass] }),
    };

    const graph: NormalizedGraph = {
      nodes: [bundleNode, sinkNode],
      edges: [
        {
          id: 'e0',
          source: 'gen' as NodeId,
          target: 'sink' as NodeId,
          inputSlot: 'primary',
          role: 'primary',
        },
      ],
    };

    const result = lowerNormalizedGraph(graph);
    expect(result.errors).toEqual([]);
    expect(result.rosterEntries).toHaveLength(1);
    expect(result.rosterEntries[0].type).toBe('Compute');
    expect((result.rosterEntries[0] as ComputePassSpec).passId).toBe('sink_pass');
    expect(result.manifest.domains['test']).toBeDefined();
  });

  it('reports an error when a sink returns kind=bundle', () => {
    const badSink = {
      id: 'sink' as NodeId,
      manifestContribution: {},
      lower: (): LoweredBlock => ({ kind: 'bundle', output: {} }),
    };
    const graph: NormalizedGraph = { nodes: [badSink], edges: [] };
    const result = lowerNormalizedGraph(graph);
    expect(result.errors.some((e) => /returned kind 'bundle'/.test(e))).toBe(true);
  });

  it('resolves a material-role edge into ctx.inputMaterials', () => {
    const spec: MaterialSpec = {
      vertexAst: [],
      fragmentAst: [],
      requiredFields: ['pos_x', 'pos_y'],
      colorVaryingName: 'color',
      pipelineState: {
        blendMode: 'opaque',
        cullMode: 'none',
        depthWrite: false,
        depthCompare: 'always',
      },
    };
    const materialNode = {
      id: 'mat' as NodeId,
      manifestContribution: {},
      lower: (): LoweredBlock => ({ kind: 'material', spec }),
    };

    let captured: Readonly<Record<string, MaterialSpec>> | undefined;
    const sinkNode = {
      id: 'sink' as NodeId,
      manifestContribution: {},
      lower: (ctx: LoweringContext): LoweredBlock => {
        captured = ctx.inputMaterials;
        return { kind: 'intent', passes: [] };
      },
    };

    const graph: NormalizedGraph = {
      nodes: [materialNode, sinkNode],
      edges: [
        {
          id: 'e0',
          source: 'mat' as NodeId,
          target: 'sink' as NodeId,
          inputSlot: 'material',
          role: 'material',
        },
      ],
    };

    const result = lowerNormalizedGraph(graph);
    expect(result.errors).toEqual([]);
    expect(captured).toBeDefined();
    // The exact spec object flows through untouched — no copy, no rewrite.
    expect(captured?.material).toBe(spec);
  });

  it('errors when a material-role edge points at a bundle-returning node', () => {
    const bundleNode = {
      id: 'gen' as NodeId,
      manifestContribution: {},
      lower: (): LoweredBlock => ({ kind: 'bundle', output: {} }),
    };
    const sinkNode = {
      id: 'sink' as NodeId,
      manifestContribution: {},
      lower: (): LoweredBlock => ({ kind: 'intent', passes: [] }),
    };

    const graph: NormalizedGraph = {
      nodes: [bundleNode, sinkNode],
      edges: [
        {
          id: 'e0',
          source: 'gen' as NodeId,
          target: 'sink' as NodeId,
          inputSlot: 'material',
          role: 'material',
        },
      ],
    };

    const result = lowerNormalizedGraph(graph);
    expect(
      result.errors.some((e) =>
        /referenced as a material source but lower\(\) returned 'bundle'/.test(e),
      ),
    ).toBe(true);
  });

  it('does not need any block-* import to compile or run', () => {
    // Compile-time proof: this file builds without importing blocks/ or
    // block-dsl/. dependency-cruiser enforces this in CI.
    expect(typeof lowerNormalizedGraph).toBe('function');
    // Suppress unused warning on RenderPassSpec import? Not needed.
    const _ = null as RenderPassSpec | null;
    expect(_).toBeNull();
  });
});
