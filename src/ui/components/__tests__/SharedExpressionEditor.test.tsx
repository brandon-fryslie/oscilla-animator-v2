import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { registerAllBlocks } from '../../../blocks/all';
import type { Patch } from '../../../graph/Patch';
import type { BlockId } from '../../../types';
import { compilePartialPatch } from '../../../compiler';
import { SharedExpressionEditor } from '../SharedExpressionEditor';

registerAllBlocks();

const diagnosticsLog = vi.fn();
const updateBlockParams = vi.fn();

vi.mock('../../../compiler', () => ({
  compilePartialPatch: vi.fn(),
}));

const compilePartialPatchMock = vi.mocked(compilePartialPatch);

vi.mock('../../../stores', () => ({
  useStores: () => ({
    patch: {
      updateBlockParams,
      addCollectEdge: vi.fn(),
    },
    diagnostics: {
      activeDiagnostics: [],
      log: diagnosticsLog,
    },
    frontend: {
      snapshot: { patchRevision: 0, resolvedPortTypes: new Map() },
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

function createValidPatch(blockId: BlockId): Patch {
  return {
    blocks: new Map([
      [blockId, {
        id: blockId,
        type: 'Expression',
        params: { expression: 'clock.phaseA' },
        displayName: 'Recovered Expression',
        domainId: null,
        role: { kind: 'user', meta: {} },
        inputPorts: new Map([
          ['refs', { id: 'refs', combineMode: 'last' as const }],
        ]),
        outputPorts: new Map([
          ['output', { id: 'output' }],
        ]),
      }],
    ]),
    edges: [],
  };
}

function renderWithProviders(element: React.ReactElement) {
  return render(
    <MantineProvider>
      {element}
    </MantineProvider>,
  );
}

describe('SharedExpressionEditor', () => {
  it('shows local syntax diagnostics and can auto-compile on keypress', async () => {
    const blockId = 'expr' as BlockId;
    const patch = createValidPatch(blockId);
    updateBlockParams.mockClear();
    compilePartialPatchMock.mockReturnValue({
      fragment: patch,
      frontendResult: { errors: [], backendReady: true } as never,
      backendResult: { kind: 'error', errors: [] } as never,
      diagnostics: [{
        id: 'diag-1',
        code: 'E_EXPR_SYNTAX',
        severity: 'error',
        domain: 'compile',
        primaryTarget: { kind: 'block', blockId },
        title: 'Expression Syntax',
        message: 'Expected expression',
        scope: { patchRevision: 0, compileId: 'expression-editor:expr' },
        metadata: { firstSeenAt: 0, lastSeenAt: 0, occurrenceCount: 1 },
        sourceSpan: {
          kind: 'blockParam',
          blockId,
          paramId: 'expression',
          range: { start: 0, end: 1 },
        },
      }],
    });

    const { container } = renderWithProviders(
      <SharedExpressionEditor
        blockId={blockId}
        value="1 +"
        patch={patch}
      />,
    );

    expect(screen.getAllByText(/Expected expression/i).length).toBeGreaterThan(0);
    const autoCompileToggle = screen.getByRole('switch', { name: /Auto-compile on keypress/i });
    expect(autoCompileToggle).toBeInTheDocument();

    fireEvent.click(autoCompileToggle);

    const editor = container.querySelector('.token-expr-editor');
    expect(editor).not.toBeNull();
    if (!editor) {
      return;
    }

    editor.textContent = '1 + 2';
    fireEvent.input(editor);

    await waitFor(() => {
      expect(updateBlockParams).toHaveBeenCalledWith(blockId, { expression: '1 + 2' });
    });
  });

  it('renders fallback UI and logs diagnostics when registry construction fails', async () => {
    const malformedPatch = createMalformedPatch('bad-expression' as BlockId);
    diagnosticsLog.mockClear();
    updateBlockParams.mockClear();
    compilePartialPatchMock.mockReturnValue({
      fragment: malformedPatch,
      frontendResult: { errors: [], backendReady: true } as never,
      backendResult: { kind: 'ok', warnings: [], program: {} } as never,
      diagnostics: [],
    });

    expect(() => {
      renderWithProviders(
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

    expect(screen.getByDisplayValue('clock.phaseA')).toHaveAttribute('maxLength', '4000');
  });

  it('logs the same registry failure again after a successful recovery', async () => {
    const blockId = 'bad-expression' as BlockId;
    const malformedPatch = createMalformedPatch(blockId);
    const validPatch = createValidPatch(blockId);
    diagnosticsLog.mockClear();
    updateBlockParams.mockClear();
    compilePartialPatchMock.mockReturnValue({
      fragment: malformedPatch,
      frontendResult: { errors: [], backendReady: true } as never,
      backendResult: { kind: 'ok', warnings: [], program: {} } as never,
      diagnostics: [],
    });

    const { rerender } = renderWithProviders(
      <SharedExpressionEditor
        blockId={blockId}
        value="clock.phaseA"
        patch={malformedPatch}
      />,
    );

    await waitFor(() => {
      expect(diagnosticsLog).toHaveBeenCalledTimes(1);
    });

    rerender(
      <MantineProvider>
        <SharedExpressionEditor
          blockId={blockId}
          value="clock.phaseA"
          patch={validPatch}
        />
      </MantineProvider>,
    );

    rerender(
      <MantineProvider>
        <SharedExpressionEditor
          blockId={blockId}
          value="clock.phaseA"
          patch={malformedPatch}
        />
      </MantineProvider>,
    );

    await waitFor(() => {
      expect(diagnosticsLog).toHaveBeenCalledTimes(2);
    });
  });
});
