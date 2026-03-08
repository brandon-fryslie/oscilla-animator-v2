/**
 * Unit tests for Action Executor
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { executeAction, type ActionExecutorDeps, type ActionResult } from '../actionExecutor';
import type {
  GoToTargetAction,
  InsertBlockAction,
  RemoveBlockAction,
  AddAdapterAction,
  CreateTimeRootAction,
  MuteDiagnosticAction,
  OpenDocsAction,
} from '../types';

describe('actionExecutor', () => {
  let mockDeps: ActionExecutorDeps;

  beforeEach(() => {
    mockDeps = {
      patchStore: {
        addBlock: vi.fn(() => 'block-123'),
        addEdge: vi.fn(() => 'edge-new'),
        removeBlock: vi.fn(),
        removeEdge: vi.fn(),
        patch: {
          blocks: new Map([
            [
              'block-123',
              {
                id: 'block-123',
                type: 'Gain',
                inputPorts: new Map([['in', { id: 'in', combineMode: 'last' }]]),
                outputPorts: new Map([['out', { id: 'out' }]]),
              },
            ],
            [
              'block-tr',
              {
                id: 'block-tr',
                type: 'InfiniteTimeRoot',
                inputPorts: new Map(),
                outputPorts: new Map([['t', { id: 't' }]]),
              },
            ],
          ]),
          edges: [
            {
              id: 'edge-1',
              from: { kind: 'port', blockId: 'block-a', slotId: 'out' },
              to: { kind: 'port', blockId: 'block-b', slotId: 'in' },
            },
          ],
        },
      },
      selectionStore: {
        selectBlock: vi.fn(),
        selectEdge: vi.fn(),
        selectPort: vi.fn(),
      },
      diagnosticsStore: {
        muteDiagnostic: vi.fn(() => true),
      },
    } as any;
  });

  describe('executeAction', () => {
    it('throws error if patchStore missing', () => {
      expect(() =>
        executeAction(
          {
            kind: 'goToTarget',
            label: 'Go to Block',
            target: { kind: 'block', blockId: 'block-123' },
          },
          { ...mockDeps, patchStore: null as any }
        )
      ).toThrow('Missing required dependencies');
    });

    it('throws error if selectionStore missing', () => {
      expect(() =>
        executeAction(
          {
            kind: 'goToTarget',
            label: 'Go to Block',
            target: { kind: 'block', blockId: 'block-123' },
          },
          { ...mockDeps, selectionStore: null as any }
        )
      ).toThrow('Missing required dependencies');
    });

    it('throws error if diagnosticsStore missing', () => {
      expect(() =>
        executeAction(
          {
            kind: 'goToTarget',
            label: 'Go to Block',
            target: { kind: 'block', blockId: 'block-123' },
          },
          { ...mockDeps, diagnosticsStore: null as any }
        )
      ).toThrow('Missing required dependencies');
    });
  });

  describe('goToTarget', () => {
    it('selects block target', () => {
      const action: GoToTargetAction = {
        kind: 'goToTarget',
        label: 'Go to Block',
        target: { kind: 'block', blockId: 'block-123' },
      };

      const result = executeAction(action, mockDeps);

      expect(result.success).toBe(true);
      expect(mockDeps.selectionStore.selectBlock).toHaveBeenCalledWith('block-123');
    });

    it('selects port target', () => {
      const action: GoToTargetAction = {
        kind: 'goToTarget',
        label: 'Go to Port',
        target: { kind: 'port', blockId: 'block-123', portId: 'in' },
      };

      const result = executeAction(action, mockDeps);

      expect(result.success).toBe(true);
      expect(mockDeps.selectionStore.selectPort).toHaveBeenCalledWith('block-123', 'in');
    });

    it('selects block for timeRoot target', () => {
      const action: GoToTargetAction = {
        kind: 'goToTarget',
        label: 'Go to TimeRoot',
        target: { kind: 'timeRoot', blockId: 'block-tr' },
      };

      const result = executeAction(action, mockDeps);

      expect(result.success).toBe(true);
      expect(mockDeps.selectionStore.selectBlock).toHaveBeenCalledWith('block-tr');
    });

    it('returns error for unsupported bus target', () => {
      const action: GoToTargetAction = {
        kind: 'goToTarget',
        label: 'Go to Bus',
        target: { kind: 'bus', busId: 'bus-123' },
      };

      const result = executeAction(action, mockDeps);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not yet implemented');
    });

    it('returns error for unsupported binding target', () => {
      const action: GoToTargetAction = {
        kind: 'goToTarget',
        label: 'Go to Binding',
        target: {
          kind: 'binding',
          bindingId: 'binding-123',
          busId: 'bus-123',
          blockId: 'block-123',
          direction: 'publish',
        },
      };

      const result = executeAction(action, mockDeps);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not yet implemented');
    });

    it('handles selection errors gracefully', () => {
      mockDeps.selectionStore.selectBlock = vi.fn(() => {
        throw new Error('Selection failed');
      });

      const action: GoToTargetAction = {
        kind: 'goToTarget',
        label: 'Go to Block',
        target: { kind: 'block', blockId: 'block-123' },
      };

      const result = executeAction(action, mockDeps);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Navigation failed');
      expect(result.error).toContain('Selection failed');
    });
  });

  describe('createTimeRoot', () => {
    it('creates InfiniteTimeRoot block', () => {
      const action: CreateTimeRootAction = {
        kind: 'createTimeRoot',
        label: 'Add InfiniteTimeRoot',
        timeRootKind: 'Infinite',
      };

      const result = executeAction(action, mockDeps);

      expect(result.success).toBe(true);
      expect(mockDeps.patchStore.addBlock).toHaveBeenCalledWith(
        'InfiniteTimeRoot',
        {},
        {
          role: { kind: 'timeRoot', meta: {} },
        }
      );
      expect(mockDeps.selectionStore.selectBlock).toHaveBeenCalledWith('block-123');
    });

    it('rejects unsupported timeRootKind', () => {
      const action = {
        kind: 'createTimeRoot' as const,
        label: 'Add ClockTimeRoot',
        timeRootKind: 'Clock' as any, // Invalid kind
      };

      const result = executeAction(action, mockDeps);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported timeRootKind');
    });

    it('handles addBlock errors', () => {
      mockDeps.patchStore.addBlock = vi.fn(() => {
        throw new Error('Block creation failed');
      });

      const action: CreateTimeRootAction = {
        kind: 'createTimeRoot',
        label: 'Add InfiniteTimeRoot',
        timeRootKind: 'Infinite',
      };

      const result = executeAction(action, mockDeps);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to create TimeRoot');
      expect(result.error).toContain('Block creation failed');
    });
  });

  describe('removeBlock', () => {
    it('removes existing block', () => {
      const action: RemoveBlockAction = {
        kind: 'removeBlock',
        label: 'Remove Block',
        blockId: 'block-123',
      };

      const result = executeAction(action, mockDeps);

      expect(result.success).toBe(true);
      expect(mockDeps.patchStore.removeBlock).toHaveBeenCalledWith('block-123');
    });

    it('fails for non-existent block', () => {
      const emptyPatchStore = {
        addBlock: vi.fn(() => 'block-123'),
        removeBlock: vi.fn(),
        patch: {
          blocks: new Map(),
          edges: [],
        },
      } as any;

      const action: RemoveBlockAction = {
        kind: 'removeBlock',
        label: 'Remove Block',
        blockId: 'block-999',
      };

      const result = executeAction(action, {
        ...mockDeps,
        patchStore: emptyPatchStore,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
      expect(emptyPatchStore.removeBlock).not.toHaveBeenCalled();
    });

    it('handles removeBlock errors', () => {
      mockDeps.patchStore.removeBlock = vi.fn(() => {
        throw new Error('Removal failed');
      });

      const action: RemoveBlockAction = {
        kind: 'removeBlock',
        label: 'Remove Block',
        blockId: 'block-123',
      };

      const result = executeAction(action, mockDeps);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to remove block');
      expect(result.error).toContain('Removal failed');
    });
  });

  describe('insertBlock', () => {
    it('creates block and selects it', () => {
      const action: InsertBlockAction = {
        kind: 'insertBlock',
        label: 'Insert Gain',
        blockType: 'Gain',
      };

      const result = executeAction(action, mockDeps);

      expect(result.success).toBe(true);
      expect(mockDeps.patchStore.addBlock).toHaveBeenCalledWith('Gain', {});
      expect(mockDeps.selectionStore.selectBlock).toHaveBeenCalledWith('block-123');
    });

    it('handles addBlock errors', () => {
      mockDeps.patchStore.addBlock = vi.fn(() => {
        throw new Error('Invalid block type');
      });

      const action: InsertBlockAction = {
        kind: 'insertBlock',
        label: 'Insert Invalid',
        blockType: 'InvalidType',
      };

      const result = executeAction(action, mockDeps);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to insert block');
      expect(result.error).toContain('Invalid block type');
    });
  });

  describe('addAdapter', () => {
    it('rewires edge through adapter block and selects it', () => {
      const action: AddAdapterAction = {
        kind: 'addAdapter',
        label: 'Insert Adapter',
        fromPort: {
          blockId: 'block-a',
          portId: 'out',
          portKind: 'output',
        },
        adapterType: 'Broadcast',
      };

      const result = executeAction(action, mockDeps);

      expect(result.success).toBe(true);
      expect(mockDeps.patchStore.addBlock).toHaveBeenCalledWith('Broadcast', {});
      expect(mockDeps.patchStore.removeEdge).toHaveBeenCalledWith('edge-1');
      expect(mockDeps.patchStore.addEdge).toHaveBeenCalledTimes(2);
      expect(mockDeps.patchStore.addEdge).toHaveBeenNthCalledWith(
        1,
        { kind: 'port', blockId: 'block-a', slotId: 'out' },
        { kind: 'port', blockId: 'block-123', slotId: 'one' }
      );
      expect(mockDeps.patchStore.addEdge).toHaveBeenNthCalledWith(
        2,
        { kind: 'port', blockId: 'block-123', slotId: 'field' },
        { kind: 'port', blockId: 'block-b', slotId: 'in' }
      );
      expect(mockDeps.selectionStore.selectBlock).toHaveBeenCalledWith('block-123');
    });

    it('handles addBlock errors', () => {
      mockDeps.patchStore.addBlock = vi.fn(() => {
        throw new Error('Adapter creation failed');
      });

      const action: AddAdapterAction = {
        kind: 'addAdapter',
        label: 'Insert Adapter',
        fromPort: {
          blockId: 'block-a',
          portId: 'out',
          portKind: 'output',
        },
        adapterType: 'Broadcast',
      };

      const result = executeAction(action, mockDeps);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to add adapter');
    });

    it('fails when fromPort fan-out is ambiguous', () => {
      (mockDeps.patchStore.patch as any).edges = [
        {
          id: 'edge-1',
          from: { kind: 'port', blockId: 'block-a', slotId: 'out' },
          to: { kind: 'port', blockId: 'block-b', slotId: 'in' },
        },
        {
          id: 'edge-2',
          from: { kind: 'port', blockId: 'block-a', slotId: 'out' },
          to: { kind: 'port', blockId: 'block-c', slotId: 'in' },
        },
      ];

      const action: AddAdapterAction = {
        kind: 'addAdapter',
        label: 'Insert Adapter',
        fromPort: {
          blockId: 'block-a',
          portId: 'out',
          portKind: 'output',
        },
        adapterType: 'Broadcast',
      };

      const result = executeAction(action, mockDeps);

      expect(result.success).toBe(false);
      expect(result.error).toContain('ambiguous');
      expect(mockDeps.patchStore.addBlock).not.toHaveBeenCalled();
    });

    it('fails when adapterType is not a registered adapter block', () => {
      const action: AddAdapterAction = {
        kind: 'addAdapter',
        label: 'Insert Adapter',
        fromPort: {
          blockId: 'block-a',
          portId: 'out',
          portKind: 'output',
        },
        adapterType: 'Add',
      };

      const result = executeAction(action, mockDeps);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not an adapter block');
      expect(mockDeps.patchStore.removeEdge).not.toHaveBeenCalled();
      expect(mockDeps.patchStore.addEdge).not.toHaveBeenCalled();
    });
  });

  describe('muteDiagnostic', () => {
    it('mutes active diagnostic successfully', () => {
      const action: MuteDiagnosticAction = {
        kind: 'muteDiagnostic',
        label: 'Mute Warning',
        diagnosticId: 'diag-xyz',
      };

      const result = executeAction(action, mockDeps);

      expect(result.success).toBe(true);
      expect(mockDeps.diagnosticsStore.muteDiagnostic).toHaveBeenCalledWith('diag-xyz');
    });

    it('returns error when diagnostic is unknown', () => {
      mockDeps.diagnosticsStore.muteDiagnostic = vi.fn(() => false);
      const action: MuteDiagnosticAction = {
        kind: 'muteDiagnostic',
        label: 'Mute Warning',
        diagnosticId: 'diag-missing',
      };

      const result = executeAction(action, mockDeps);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('openDocs', () => {
    it('opens URL in new window', () => {
      const mockOpen = vi.fn(() => null);
      global.window = { open: mockOpen } as any;

      const action: OpenDocsAction = {
        kind: 'openDocs',
        label: 'Learn More',
        docUrl: 'https://docs.example.com/fields',
      };

      const result = executeAction(action, mockDeps);

      expect(result.success).toBe(true);
      expect(mockOpen).toHaveBeenCalledWith(
        'https://docs.example.com/fields',
        '_blank',
        'noopener,noreferrer'
      );
    });

    it('fails gracefully in non-browser environment', () => {
      global.window = undefined as any;

      const action: OpenDocsAction = {
        kind: 'openDocs',
        label: 'Learn More',
        docUrl: 'https://docs.example.com/fields',
      };

      const result = executeAction(action, mockDeps);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not available');
    });

    it('handles window.open errors', () => {
      global.window = {
        open: vi.fn(() => {
          throw new Error('Popup blocked');
        }),
      } as any;

      const action: OpenDocsAction = {
        kind: 'openDocs',
        label: 'Learn More',
        docUrl: 'https://docs.example.com/fields',
      };

      const result = executeAction(action, mockDeps);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to open docs');
      expect(result.error).toContain('Popup blocked');
    });
  });

  describe('exhaustiveness check', () => {
    it('handles unknown action kind', () => {
      const action = {
        kind: 'unknownAction',
        label: 'Unknown',
      } as any;

      const result = executeAction(action, mockDeps);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown action kind');
    });
  });
});
