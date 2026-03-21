import { describe, expect, it } from 'vitest';
import { registerAllBlocks } from '../../../blocks/all';
import { registerBlock, getBlockDefinition } from '../../../blocks/registry';
import { inferType, payloadVar, unitVar } from '../../../core/inference-types';
import { buildPatch } from '../../../graph';
import type { BlockId } from '../../../types';
import {
  queryAddSourceBlocks,
  queryConnectExistingSources,
} from '../authoring-queries';

registerAllBlocks();

function registerDeferredTestBlocks(): void {
  if (!getBlockDefinition('TestDeferredSource')) {
    registerBlock({
      type: 'TestDeferredSource',
      label: 'Test Deferred Source',
      category: 'scalar',
      description: 'Generic source for deferred authoring-query tests',
      form: 'primitive',
      capability: 'pure',
      inputs: {},
      outputs: {
        out: {
          label: 'Out',
          type: inferType(payloadVar('aq_deferred_payload'), unitVar('aq_deferred_unit')),
        },
      },
      lower: () => ({ outputsById: {}, effects: {} }) as any,
    });
  }

  if (!getBlockDefinition('TestDeferredSink')) {
    registerBlock({
      type: 'TestDeferredSink',
      label: 'Test Deferred Sink',
      category: 'math',
      description: 'Generic sink for deferred authoring-query tests',
      form: 'primitive',
      capability: 'pure',
      inputs: {
        in: {
          label: 'In',
          type: inferType(payloadVar('aq_deferred_payload'), unitVar('aq_deferred_sink_unit')),
        },
      },
      outputs: {},
      lower: () => ({ outputsById: {}, effects: {} }) as any,
    });
  }
}

registerDeferredTestBlocks();

describe('authoring queries', () => {
  it('returns one connectExistingSources result per candidate in input order', () => {
    let ellipseId!: BlockId;
    let constA!: BlockId;
    let constB!: BlockId;

    const patch = buildPatch((b) => {
      ellipseId = b.addBlock('Ellipse');
      constA = b.addBlock('Const');
      constB = b.addBlock('Const');
    });

    const result = queryConnectExistingSources(
      patch,
      {
        kind: 'connectExistingSources',
        target: { blockId: ellipseId, portId: 'rx' as any },
        candidates: [
          { candidateId: 'b', sourceBlockId: constB, sourcePortId: 'out' as any },
          { candidateId: 'a', sourceBlockId: constA, sourcePortId: 'out' as any },
        ],
      },
      { mutationMode: 'addWriter' },
    );

    expect(result.results.map((candidate) => candidate.candidateId)).toEqual(['b', 'a']);
  });

  it('classifies direct compatible source connections as valid', () => {
    let ellipseId!: BlockId;
    let constId!: BlockId;

    const patch = buildPatch((b) => {
      ellipseId = b.addBlock('Ellipse');
      constId = b.addBlock('Const');
    });

    const result = queryConnectExistingSources(
      patch,
      {
        kind: 'connectExistingSources',
        target: { blockId: ellipseId, portId: 'rx' as any },
        candidates: [
          { candidateId: 'const', sourceBlockId: constId, sourcePortId: 'out' as any },
        ],
      },
      { mutationMode: 'addWriter' },
    ).results[0];

    expect(result.status).toBe('valid');
  });

  it('accepts adapter-mediated connections and reports inserted adapter artifacts', () => {
    let layoutId!: BlockId;
    let constId!: BlockId;

    const patch = buildPatch((b) => {
      layoutId = b.addBlock('CircleLayoutUV');
      constId = b.addBlock('Const');
    });

    const result = queryConnectExistingSources(
      patch,
      {
        kind: 'connectExistingSources',
        target: { blockId: layoutId, portId: 'elements' as any },
        candidates: [
          { candidateId: 'const', sourceBlockId: constId, sourcePortId: 'out' as any },
        ],
      },
      { mutationMode: 'addWriter' },
    ).results[0];

    expect(result.status).toBe('valid');
    expect(result.insertedArtifacts.adapterBlocks.length).toBeGreaterThan(0);
  });

  it('keeps generic-compatible connections admissible under the real frontend pipeline', () => {
    let sinkId!: BlockId;
    let sourceId!: BlockId;

    const patch = buildPatch((b) => {
      sinkId = b.addBlock('TestDeferredSink');
      sourceId = b.addBlock('TestDeferredSource');
    });

    const result = queryConnectExistingSources(
      patch,
      {
        kind: 'connectExistingSources',
        target: { blockId: sinkId, portId: 'in' as any },
        candidates: [
          { candidateId: 'source', sourceBlockId: sourceId, sourcePortId: 'out' as any },
        ],
      },
      { mutationMode: 'replaceWriter' },
    ).results[0];

    expect(result.status).toBe('valid');
    expect(result.insertedArtifacts.adapterBlocks.length).toBeGreaterThan(0);
  });

  it('marks proven incompatible source connections invalid', () => {
    let ellipseId!: BlockId;
    let colorId!: BlockId;

    const patch = buildPatch((b) => {
      ellipseId = b.addBlock('Ellipse');
      colorId = b.addBlock('MakeColorOKLCH');
    });

    const result = queryConnectExistingSources(
      patch,
      {
        kind: 'connectExistingSources',
        target: { blockId: ellipseId, portId: 'rx' as any },
        candidates: [
          { candidateId: 'color', sourceBlockId: colorId, sourcePortId: 'color' as any },
        ],
      },
      { mutationMode: 'addWriter' },
    ).results[0];

    expect(result.status).toBe('invalid');
  });

  it('distinguishes addWriter from replaceWriter when existing writers remain', () => {
    let ellipseId!: BlockId;
    let constA!: BlockId;
    let constB!: BlockId;

    const patch = buildPatch((b) => {
      ellipseId = b.addBlock('Ellipse');
      constA = b.addBlock('Const');
      constB = b.addBlock('Const');
      b.wire(constA, 'out', ellipseId, 'rx');
    });

    const addWriter = queryConnectExistingSources(
      patch,
      {
        kind: 'connectExistingSources',
        target: { blockId: ellipseId, portId: 'rx' as any },
        candidates: [
          { candidateId: 'next', sourceBlockId: constB, sourcePortId: 'out' as any },
        ],
      },
      { mutationMode: 'addWriter' },
    ).results[0];

    const replaceWriter = queryConnectExistingSources(
      patch,
      {
        kind: 'connectExistingSources',
        target: { blockId: ellipseId, portId: 'rx' as any },
        candidates: [
          { candidateId: 'next', sourceBlockId: constB, sourcePortId: 'out' as any },
        ],
      },
      { mutationMode: 'replaceWriter' },
    ).results[0];

    expect(addWriter.binding?.writerCount).toBe(2);
    expect(replaceWriter.binding?.writerCount).toBe(1);
  });

  it('evaluates addSourceBlocks over outputs and reports the best output', () => {
    let ellipseId!: BlockId;

    const patch = buildPatch((b) => {
      ellipseId = b.addBlock('Ellipse');
    });

    const result = queryAddSourceBlocks(
      patch,
      {
        kind: 'addSourceBlocks',
        target: { blockId: ellipseId, portId: 'rx' as any },
        candidates: [{ candidateId: 'const', blockType: 'Const' }],
      },
      { mutationMode: 'replaceWriter' },
    ).results[0];

    expect(result.status).toBe('valid');
    expect(result.bestOutputPortId).toBe('out');
    expect(result.outputs).toHaveLength(1);
  });

  it('accepts addSourceBlocks candidates that need adapters', () => {
    let layoutId!: BlockId;

    const patch = buildPatch((b) => {
      layoutId = b.addBlock('CircleLayoutUV');
    });

    const result = queryAddSourceBlocks(
      patch,
      {
        kind: 'addSourceBlocks',
        target: { blockId: layoutId, portId: 'elements' as any },
        candidates: [{ candidateId: 'const', blockType: 'Const' }],
      },
      { mutationMode: 'replaceWriter' },
    ).results[0];

    expect(result.status).toBe('valid');
    expect(result.insertedArtifacts.adapterBlocks.length).toBeGreaterThan(0);
  });

  it('keeps generic addSourceBlocks candidates admissible under the real frontend pipeline', () => {
    let sinkId!: BlockId;

    const patch = buildPatch((b) => {
      sinkId = b.addBlock('TestDeferredSink');
    });

    const result = queryAddSourceBlocks(
      patch,
      {
        kind: 'addSourceBlocks',
        target: { blockId: sinkId, portId: 'in' as any },
        candidates: [{ candidateId: 'source', blockType: 'TestDeferredSource' }],
      },
      { mutationMode: 'replaceWriter' },
    ).results[0];

    expect(result.status).toBe('valid');
    expect(result.insertedArtifacts.adapterBlocks.length).toBeGreaterThan(0);
  });

  it('marks known block types with no outputs invalid', () => {
    let ellipseId!: BlockId;

    const patch = buildPatch((b) => {
      ellipseId = b.addBlock('Ellipse');
    });

    const result = queryAddSourceBlocks(
      patch,
      {
        kind: 'addSourceBlocks',
        target: { blockId: ellipseId, portId: 'rx' as any },
        candidates: [{ candidateId: 'comment', blockType: 'Comment' }],
      },
      { mutationMode: 'replaceWriter' },
    ).results[0];

    expect(result.status).toBe('invalid');
  });

  it('blocks unknown candidate block types', () => {
    let ellipseId!: BlockId;

    const patch = buildPatch((b) => {
      ellipseId = b.addBlock('Ellipse');
    });

    const result = queryAddSourceBlocks(
      patch,
      {
        kind: 'addSourceBlocks',
        target: { blockId: ellipseId, portId: 'rx' as any },
        candidates: [{ candidateId: 'missing', blockType: 'DoesNotExist' }],
      },
      { mutationMode: 'replaceWriter' },
    ).results[0];

    expect(result.status).toBe('blocked');
  });
});
