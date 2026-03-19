import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { registerAllBlocks } from '../../../blocks/all';
import type { Patch } from '../../../graph/Patch';
import type { BlockId } from '../../../types';
import { SharedExpressionEditor } from '../SharedExpressionEditor';

registerAllBlocks();

const diagnosticsLog = vi.fn();

vi.mock('../../../stores', () => ({
  useStores: () => ({
    patch: {
      updateBlockParams: vi.fn(),
      addCollectEdge: vi.fn(),
    },
    diagnostics: {
      activeDiagnostics: [],
      log: diagnosticsLog,
    },
    expressionEditor: {
      openForBlock: vi.fn(),
    },
  }),
}));

vi.mock('../../dockview', () => ({
  DockviewContext: React.createContext({ api: null }),
  openExpressionEditorPanel: vi.fn(),
}));

function createMalformedPatch(blockId: BlockId): Patch {
  return {
    blocks: new Map([
      [blockId, {
        id: blockId,
        type: 'Expression',
        params: { expression: 'clock.phaseA' },
        displayName: 'Broken Expression',
        domainId: null,
        role: { kind: 'user', meta: {} },
        inputPorts: new Map([
          ['refs', { id: 'refs', combineMode: 'last' as const }],
        ]),
        outputPorts: {} as never,
      }],
    ]),
    edges: [],
  };
}

describe('SharedExpressionEditor', () => {
  it('renders fallback UI and logs diagnostics when registry construction fails', async () => {
    const malformedPatch = createMalformedPatch('bad-expression' as BlockId);
    diagnosticsLog.mockClear();

    expect(() => {
      render(
        <SharedExpressionEditor
          blockId={'bad-expression' as BlockId}
          value="clock.phaseA"
          patch={malformedPatch}
        />,
      );
    }).not.toThrow();

    expect(
      screen.getByText(/Expression editor fallback mode is active until the patch shape is repaired/i),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue('clock.phaseA')).toBeInTheDocument();

    await waitFor(() => {
      expect(diagnosticsLog).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'error',
          message: expect.stringContaining('Expression editor fallback'),
        }),
      );
    });
  });
});
