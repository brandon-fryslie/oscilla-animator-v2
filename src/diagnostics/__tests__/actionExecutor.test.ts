/**
 * Unit tests for Action Executor
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { executeAction, type ActionExecutorDeps } from '../actionExecutor';
import type {
  GoToTargetAction,
  InsertBlockAction,
  RemoveBlockAction,
  AddAdapterAction,
  CreateTimeRootAction,
  MuteDiagnosticAction,
  OpenDocsAction,
} from '../types';
import { blockId } from '../../types';
import { createTestBlockMap, resetBlockFactory } from '../../test-utils/block-factory';

type DepsGetter = () => ActionExecutorDeps;
type MutableDeps = ActionExecutorDeps & {
  patchStore: Record<string, any>;
  selectionStore: Record<string, any>;
  diagnosticsStore: Record<string, any>;
};

const CREATED_BLOCK_ID = blockId('block-created-123');

function createMockDeps(): ActionExecutorDeps {
  const fixtureBlockId = blockId('block-123');
  const fixtureTimeRootId = blockId('block-tr');
  const patch = {
    blocks: createTestBlockMap([
      {
        id: fixtureBlockId,
        type: 'Gain',
        inputPorts: new Map([['in', { id: 'in', combineMode: 'last' }]]),
        outputPorts: new Map([['out', { id: 'out' }]]),
      },
      {
        id: fixtureTimeRootId,
        type: 'InfiniteTimeRoot',
        inputPorts: new Map(),
        outputPorts: new Map([['t', { id: 't' }]]),
      },
    ]),
    edges: [
      {
        id: 'edge-1',
        from: { kind: 'port', blockId: 'block-a', slotId: 'out' },
        to: { kind: 'port', blockId: 'block-b', slotId: 'in' },
      },
    ],
  };

  const patchStore = {
    addBlock: vi.fn(() => CREATED_BLOCK_ID),
    addEdge: vi.fn(() => 'edge-new'),
    removeEdge: vi.fn(),
    patch,
    lastIssue: null,
  } as any;

  patchStore.removeBlock = vi.fn((id: string) => {
    const normalizedId = blockId(id);
    const block = patch.blocks.get(normalizedId);
    if (!block) {
      patchStore.lastIssue = { level: 'warn', message: `Attempted to remove missing block '${id}'` };
      return;
    }
    if (block.type === 'InfiniteTimeRoot') {
      patchStore.lastIssue = {
        level: 'warn',
        message: `Cannot remove protected block '${id}' of type InfiniteTimeRoot`,
      };
      return;
    }
    patch.blocks.delete(normalizedId);
    patch.edges = patch.edges.filter((edge) => edge.from.blockId !== id && edge.to.blockId !== id);
  });

  return {
    patchStore,
    selectionStore: {
      selectBlock: vi.fn(),
      selectEdge: vi.fn(),
      selectPort: vi.fn(),
    },
    diagnosticsStore: {
      muteDiagnostic: vi.fn(() => true),
    },
  } as any;
}

function mutableDeps(getDeps: DepsGetter): MutableDeps {
  return getDeps() as MutableDeps;
}

function goToTargetAction(target: GoToTargetAction['target'], label: string): GoToTargetAction {
  return {
    kind: 'goToTarget',
    label,
    target,
  };
}

function goToBlockAction(blockRef: string, label: string): GoToTargetAction {
  return goToTargetAction({ kind: 'block', blockId: blockRef }, label);
}

function goToPortAction(blockRef: string, portRef: string, label: string): GoToTargetAction {
  return goToTargetAction({ kind: 'port', blockId: blockRef, portId: portRef }, label);
}

function goToTimeRootAction(blockRef: string, label: string): GoToTargetAction {
  return goToTargetAction({ kind: 'timeRoot', blockId: blockRef }, label);
}

function createTimeRootAction(timeRootKind: CreateTimeRootAction['timeRootKind'], label: string): CreateTimeRootAction {
  return {
    kind: 'createTimeRoot',
    label,
    timeRootKind,
  };
}

function removeBlockAction(blockRef: string, label: string): RemoveBlockAction {
  return {
    kind: 'removeBlock',
    label,
    blockId: blockRef,
  };
}

function insertBlockAction(blockType: string, label: string): InsertBlockAction {
  return {
    kind: 'insertBlock',
    label,
    blockType,
  };
}

function addAdapterAction(adapterType: string): AddAdapterAction {
  return {
    kind: 'addAdapter',
    label: 'Insert Adapter',
    fromPort: {
      blockId: 'block-a',
      portId: 'out',
      portKind: 'output',
    },
    adapterType,
  };
}

function muteDiagnosticAction(diagnosticId: string): MuteDiagnosticAction {
  return {
    kind: 'muteDiagnostic',
    label: 'Mute Warning',
    diagnosticId,
  };
}

function openDocsAction(docUrl: string): OpenDocsAction {
  return {
    kind: 'openDocs',
    label: 'Learn More',
    docUrl,
  };
}

function registerDependencyValidationTests(getDeps: DepsGetter): void {
  describe('executeAction', () => {
    it('throws error if patchStore missing', () => {
      const action = goToBlockAction('block-123', 'Go to Block');
      expect(() => executeAction(action, { ...getDeps(), patchStore: null as any })).toThrow('Missing required dependencies');
    });

    it('throws error if selectionStore missing', () => {
      const action = goToBlockAction('block-123', 'Go to Block');
      expect(() => executeAction(action, { ...getDeps(), selectionStore: null as any })).toThrow('Missing required dependencies');
    });

    it('throws error if diagnosticsStore missing', () => {
      const action = goToBlockAction('block-123', 'Go to Block');
      expect(() => executeAction(action, { ...getDeps(), diagnosticsStore: null as any })).toThrow('Missing required dependencies');
    });
  });
}

function registerGoToTargetSuccessTests(getDeps: DepsGetter): void {
  it('selects block target', () => {
    const deps = getDeps();
    const result = executeAction(goToBlockAction('block-123', 'Go to Block'), deps);

    expect(result.success).toBe(true);
    expect(deps.selectionStore.selectBlock).toHaveBeenCalledWith('block-123');
  });

  it('selects port target', () => {
    const deps = getDeps();
    const result = executeAction(goToPortAction('block-123', 'in', 'Go to Port'), deps);

    expect(result.success).toBe(true);
    expect(deps.selectionStore.selectPort).toHaveBeenCalledWith('block-123', 'in');
  });

  it('selects block for timeRoot target', () => {
    const deps = getDeps();
    const result = executeAction(goToTimeRootAction('block-tr', 'Go to TimeRoot'), deps);

    expect(result.success).toBe(true);
    expect(deps.selectionStore.selectBlock).toHaveBeenCalledWith('block-tr');
  });
}

function registerGoToTargetFailureTests(getDeps: DepsGetter): void {
  it('fails for missing block target and does not invoke selection', () => {
    const deps = getDeps();
    const result = executeAction(goToBlockAction('block-missing', 'Go to Missing Block'), deps);

    expect(result).toEqual({
      success: false,
      error: 'Block block-missing not found',
    });
    expect(deps.selectionStore.selectBlock).not.toHaveBeenCalled();
    expect(deps.selectionStore.selectPort).not.toHaveBeenCalled();
  });

  it('fails for invalid port target and does not invoke selectPort', () => {
    const deps = getDeps();
    const result = executeAction(goToPortAction('block-123', 'missing-port', 'Go to Invalid Port'), deps);

    expect(result).toEqual({
      success: false,
      error: 'Port missing-port not found on block block-123',
    });
    expect(deps.selectionStore.selectPort).not.toHaveBeenCalled();
  });

  it('returns error for unsupported bus target', () => {
    const result = executeAction(goToTargetAction({ kind: 'bus', busId: 'bus-123' }, 'Go to Bus'), getDeps());

    expect(result.success).toBe(false);
    expect(result.error).toContain('not yet implemented');
  });

  it('returns error for unsupported binding target', () => {
    const result = executeAction(
      goToTargetAction(
        {
          kind: 'binding',
          bindingId: 'binding-123',
          busId: 'bus-123',
          blockId: 'block-123',
          direction: 'publish',
        },
        'Go to Binding'
      ),
      getDeps()
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('not yet implemented');
  });

  it('includes target kind when goToTarget receives an unknown target variant', () => {
    const deps = getDeps();
    const action = {
      kind: 'goToTarget' as const,
      label: 'Legacy target',
      target: { kind: 'legacy-target' },
    };

    const result = executeAction(action as unknown as GoToTargetAction, deps);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Unsupported target kind (kind: legacy-target)');
  });

  it('handles selection errors gracefully', () => {
    const deps = mutableDeps(getDeps);
    deps.selectionStore.selectBlock = vi.fn(() => {
      throw new Error('Selection failed');
    });

    const result = executeAction(
      goToBlockAction('block-123', 'Go to Block'),
      deps
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Navigation failed');
    expect(result.error).toContain('Selection failed');
  });
}

function registerGoToTargetTests(getDeps: DepsGetter): void {
  describe('goToTarget', () => {
    registerGoToTargetSuccessTests(getDeps);
    registerGoToTargetFailureTests(getDeps);
  });
}

function registerCreateTimeRootTests(getDeps: DepsGetter): void {
  describe('createTimeRoot', () => {
    it('creates InfiniteTimeRoot block', () => {
      const deps = getDeps();
      const action = createTimeRootAction('Infinite', 'Add InfiniteTimeRoot');

      const result = executeAction(action, deps);

      expect(result.success).toBe(true);
      expect(deps.patchStore.addBlock).toHaveBeenCalledWith(
        'InfiniteTimeRoot',
        {},
        {
          role: { kind: 'timeRoot', meta: {} },
        }
      );
      expect(deps.selectionStore.selectBlock).toHaveBeenCalledWith(CREATED_BLOCK_ID);
    });

    it('rejects unsupported timeRootKind', () => {
      const action = {
        kind: 'createTimeRoot' as const,
        label: 'Add ClockTimeRoot',
        timeRootKind: 'Clock' as any,
      };

      const result = executeAction(action, getDeps());

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported timeRootKind');
    });

    it('handles addBlock errors', () => {
      const deps = mutableDeps(getDeps);
      deps.patchStore.addBlock = vi.fn(() => {
        throw new Error('Block creation failed');
      });

      const action = createTimeRootAction('Infinite', 'Add InfiniteTimeRoot');

      const result = executeAction(action, deps);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to create TimeRoot');
      expect(result.error).toContain('Block creation failed');
    });
  });
}

function registerRemoveBlockTests(getDeps: DepsGetter): void {
  describe('removeBlock', () => {
    it('removes existing block', () => {
      const action = removeBlockAction('block-123', 'Remove Block');

      const result = executeAction(action, getDeps());

      expect(result.success).toBe(true);
      expect(getDeps().patchStore.removeBlock).toHaveBeenCalledWith('block-123');
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

      const action = removeBlockAction('block-999', 'Remove Block');

      const result = executeAction(action, {
        ...getDeps(),
        patchStore: emptyPatchStore,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
      expect(emptyPatchStore.removeBlock).not.toHaveBeenCalled();
    });

    it('handles removeBlock errors', () => {
      const deps = mutableDeps(getDeps);
      deps.patchStore.removeBlock = vi.fn(() => {
        throw new Error('Removal failed');
      });

      const action = removeBlockAction('block-123', 'Remove Block');

      const result = executeAction(action, deps);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to remove block');
      expect(result.error).toContain('Removal failed');
    });

    it('fails when PatchStore refuses to remove the block', () => {
      const deps = mutableDeps(getDeps);
      deps.patchStore.removeBlock = vi.fn();

      const action = removeBlockAction('block-123', 'Remove Protected Block');

      const result = executeAction(action, deps);

      expect(result).toEqual({
        success: false,
        error: 'Block block-123 could not be removed',
      });
      expect(deps.patchStore.removeBlock).toHaveBeenCalledWith('block-123');
    });

    it('fails when PatchStore refuses block removal', () => {
      const action = removeBlockAction('block-tr', 'Remove TimeRoot');

      const result = executeAction(action, getDeps());

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot remove protected block');
      expect(getDeps().patchStore.removeBlock).toHaveBeenCalledWith('block-tr');
    });
  });
}

function registerInsertBlockTests(getDeps: DepsGetter): void {
  describe('insertBlock', () => {
    it('creates block and selects it', () => {
      const action = insertBlockAction('Gain', 'Insert Gain');

      const result = executeAction(action, getDeps());

      expect(result.success).toBe(true);
      expect(getDeps().patchStore.addBlock).toHaveBeenCalledWith('Gain', {});
      expect(getDeps().selectionStore.selectBlock).toHaveBeenCalledWith(CREATED_BLOCK_ID);
    });

    it('handles addBlock errors', () => {
      const deps = mutableDeps(getDeps);
      deps.patchStore.addBlock = vi.fn(() => {
        throw new Error('Invalid block type');
      });

      const action = insertBlockAction('InvalidType', 'Insert Invalid');

      const result = executeAction(action, deps);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to insert block');
      expect(result.error).toContain('Invalid block type');
    });
  });
}

function registerAddAdapterSuccessTests(getDeps: DepsGetter): void {
  it('rewires edge through adapter block and selects it', () => {
    const deps = getDeps();
    const action = addAdapterAction('Broadcast');

    const result = executeAction(action, deps);

    expect(result.success).toBe(true);
    expect(deps.patchStore.addBlock).toHaveBeenCalledWith('Broadcast', {});
    expect(deps.patchStore.removeEdge).toHaveBeenCalledWith('edge-1');
    expect(deps.patchStore.addEdge).toHaveBeenCalledTimes(2);
    expect(deps.patchStore.addEdge).toHaveBeenNthCalledWith(
      1,
      { kind: 'port', blockId: 'block-a', slotId: 'out' },
      { kind: 'port', blockId: CREATED_BLOCK_ID, slotId: 'one' }
    );
    expect(deps.patchStore.addEdge).toHaveBeenNthCalledWith(
      2,
      { kind: 'port', blockId: CREATED_BLOCK_ID, slotId: 'field' },
      { kind: 'port', blockId: 'block-b', slotId: 'in' }
    );
    expect(deps.selectionStore.selectBlock).toHaveBeenCalledWith(CREATED_BLOCK_ID);
  });

  it('handles addBlock errors', () => {
    const deps = mutableDeps(getDeps);
    deps.patchStore.addBlock = vi.fn(() => {
      throw new Error('Adapter creation failed');
    });

    const action = addAdapterAction('Broadcast');

    const result = executeAction(action, deps);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to add adapter');
  });
}

function registerAddAdapterFailureTests(getDeps: DepsGetter): void {
  it('fails when fromPort fan-out is ambiguous', () => {
    const deps = mutableDeps(getDeps);
    (deps.patchStore.patch as any).edges = [
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

    const action = addAdapterAction('Broadcast');

    const result = executeAction(action, deps);

    expect(result.success).toBe(false);
    expect(result.error).toContain('ambiguous');
    expect(deps.patchStore.addBlock).not.toHaveBeenCalled();
  });

  it('fails when adapterType is not a registered adapter block', () => {
    const deps = getDeps();
    const action = addAdapterAction('Add');

    const result = executeAction(action, deps);

    expect(result.success).toBe(false);
    expect(result.error).toContain('not an adapter block');
    expect(deps.patchStore.removeEdge).not.toHaveBeenCalled();
    expect(deps.patchStore.addEdge).not.toHaveBeenCalled();
  });
}

function registerAddAdapterTests(getDeps: DepsGetter): void {
  describe('addAdapter', () => {
    registerAddAdapterSuccessTests(getDeps);
    registerAddAdapterFailureTests(getDeps);
  });
}

function registerMuteDiagnosticTests(getDeps: DepsGetter): void {
  describe('muteDiagnostic', () => {
    it('mutes active diagnostic successfully', () => {
      const action = muteDiagnosticAction('diag-xyz');

      const result = executeAction(action, getDeps());

      expect(result.success).toBe(true);
      expect(getDeps().diagnosticsStore.muteDiagnostic).toHaveBeenCalledWith('diag-xyz');
    });

    it('returns error when diagnostic is unknown', () => {
      const deps = mutableDeps(getDeps);
      deps.diagnosticsStore.muteDiagnostic = vi.fn(() => false);

      const action = muteDiagnosticAction('diag-missing');

      const result = executeAction(action, deps);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });
}

function registerOpenDocsTests(getDeps: DepsGetter): void {
  describe('openDocs', () => {
    const originalWindow = global.window;

    afterEach(() => {
      global.window = originalWindow as any;
    });

    it('opens URL in new window', () => {
      const mockOpen = vi.fn(() => null);
      global.window = { open: mockOpen } as any;

      const action = openDocsAction('https://docs.example.com/fields');

      const result = executeAction(action, getDeps());

      expect(result.success).toBe(true);
      expect(mockOpen).toHaveBeenCalledWith(
        'https://docs.example.com/fields',
        '_blank',
        'noopener,noreferrer'
      );
    });

    it('fails gracefully in non-browser environment', () => {
      global.window = undefined as any;

      const action = openDocsAction('https://docs.example.com/fields');

      const result = executeAction(action, getDeps());

      expect(result.success).toBe(false);
      expect(result.error).toContain('not available');
    });

    it('handles window.open errors', () => {
      global.window = {
        open: vi.fn(() => {
          throw new Error('Popup blocked');
        }),
      } as any;

      const action = openDocsAction('https://docs.example.com/fields');

      const result = executeAction(action, getDeps());

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to open docs');
      expect(result.error).toContain('Popup blocked');
    });
  });
}

function registerExhaustivenessTests(getDeps: DepsGetter): void {
  describe('exhaustiveness check', () => {
    it('handles unknown action kind', () => {
      const action = {
        kind: 'unknownAction',
        label: 'Unknown',
      } as any;

      const result = executeAction(action, getDeps());

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown action kind');
    });
  });
}

describe('actionExecutor', () => {
  let mockDeps: ActionExecutorDeps;
  const getDeps: DepsGetter = () => mockDeps;

  beforeEach(() => {
    // [LAW:one-source-of-truth] Block fixture shape is centralized in block-factory.
    resetBlockFactory();
    mockDeps = createMockDeps();
  });

  registerDependencyValidationTests(getDeps);
  registerGoToTargetTests(getDeps);
  registerCreateTimeRootTests(getDeps);
  registerRemoveBlockTests(getDeps);
  registerInsertBlockTests(getDeps);
  registerAddAdapterTests(getDeps);
  registerMuteDiagnosticTests(getDeps);
  registerOpenDocsTests(getDeps);
  registerExhaustivenessTests(getDeps);
});
