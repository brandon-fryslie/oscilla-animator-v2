import { describe, expect, it } from 'vitest';
import { registerAllBlocks } from '../../../blocks/all';
import { buildPatch } from '../../../graph';
import type { BlockId } from '../../../types';
import {
  queryAddSourceBlocks,
  queryConnectTargetsForSource,
} from '../authoring-queries';

registerAllBlocks();

describe('authoring query performance budgets', () => {
  it('prefilters addSourceBlocks before exact evaluation', () => {
    let ellipseId!: BlockId;

    const patch = buildPatch((b) => {
      ellipseId = b.addBlock('Ellipse');
      b.addBlock('Const');
      b.addBlock('MakeColorOKLCH');
      b.addBlock('SplitColorOKLCH');
      b.addBlock('AttractorLayout');
    });

    const result = queryAddSourceBlocks(
      patch,
      {
        kind: 'addSourceBlocks',
        target: { blockId: ellipseId, portId: 'rx' as any },
        candidates: [
          { candidateId: 'const', blockType: 'Const' },
          { candidateId: 'color', blockType: 'MakeColorOKLCH' },
          { candidateId: 'split', blockType: 'SplitColorOKLCH' },
          { candidateId: 'layout', blockType: 'AttractorLayout' },
        ],
      },
      { mutationMode: 'replaceWriter' },
    );

    expect(result.metrics.candidateCount).toBe(4);
    expect(result.metrics.prefilteredCount).toBeLessThan(result.metrics.candidateCount);
    expect(result.metrics.exactEvaluationCount).toBeLessThan(result.metrics.candidateCount);
  });

  it('prefilters source-to-target batches before exact evaluation', () => {
    let colorSourceId!: BlockId;
    let colorSinkId!: BlockId;
    let ellipseId!: BlockId;
    let splitColorId!: BlockId;

    const patch = buildPatch((b) => {
      colorSourceId = b.addBlock('MakeColorOKLCH');
      colorSinkId = b.addBlock('SplitColorOKLCH');
      ellipseId = b.addBlock('Ellipse');
      splitColorId = b.addBlock('SplitColorOKLCH');
    });

    const result = queryConnectTargetsForSource(
      patch,
      {
        kind: 'connectTargetsForSource',
        source: { blockId: colorSourceId, portId: 'color' as any },
        candidates: [
          { candidateId: 'bad', targetBlockId: ellipseId, targetPortId: 'rx' as any },
          { candidateId: 'good-a', targetBlockId: colorSinkId, targetPortId: 'color' as any },
          { candidateId: 'good-b', targetBlockId: splitColorId, targetPortId: 'color' as any },
        ],
      },
      { mutationMode: 'addWriter' },
    );

    expect(result.metrics.candidateCount).toBe(3);
    expect(result.metrics.prefilteredCount).toBe(2);
    expect(result.metrics.exactEvaluationCount).toBe(2);
  });
});
