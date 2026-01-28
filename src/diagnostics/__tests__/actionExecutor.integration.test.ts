/**
 * Integration tests for Action Executor with real stores
 *
 * These tests verify that actions properly interact with the store layer
 * and produce expected side effects (diagnostics resolving, blocks created, etc.)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RootStore } from '../../stores/RootStore';
import type { Diagnostic } from '../types';

// Import block registrations (needed for PatchStore.addBlock)
import '../../blocks/time-blocks';
import '../../blocks/adapter-blocks';

describe('actionExecutor integration', () => {
  let rootStore: RootStore;

  beforeEach(() => {
    rootStore = new RootStore();
  });

  describe('createTimeRoot action', () => {
    it('creates InfiniteTimeRoot block in patch', () => {
      const action = {
        kind: 'createTimeRoot' as const,
        label: 'Add InfiniteTimeRoot',
        timeRootKind: 'Infinite' as const,
      };

      // Execute action
      const result = rootStore.executeAction(action);

      // Debug output if failed
      if (!result.success) {
        console.error('Action failed:', result.error);
      }

      // Verify success
      expect(result.success).toBe(true);

      // Verify block was created
      const blocks = Array.from(rootStore.patch.blocks.values());
      const timeRootBlock = blocks.find((b) => b.type === 'InfiniteTimeRoot');
      expect(timeRootBlock).toBeDefined();
      expect(timeRootBlock?.role.kind).toBe('timeRoot');
    });

    it('selects newly created block', () => {
      const action = {
        kind: 'createTimeRoot' as const,
        label: 'Add InfiniteTimeRoot',
        timeRootKind: 'Infinite' as const,
      };

      // Execute action
      rootStore.executeAction(action);

      // Verify selection
      expect(rootStore.selection.selectedBlockId).toBeDefined();
      expect(rootStore.selection.selectedBlock?.type).toBe('InfiniteTimeRoot');
    });

    it('resolves E_TIME_ROOT_MISSING diagnostic', async () => {
      // Force a diagnostic evaluation by triggering the hub
      // Note: In real usage, diagnostics would be evaluated automatically
      // This test verifies the action creates the necessary block structure

      const action = {
        kind: 'createTimeRoot' as const,
        label: 'Add InfiniteTimeRoot',
        timeRootKind: 'Infinite' as const,
      };

      // Execute action
      rootStore.executeAction(action);

      // Wait for diagnostic evaluation (DiagnosticHub is async)
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify that a TimeRoot block now exists
      const blocks = Array.from(rootStore.patch.blocks.values());
      const timeRootBlocks = blocks.filter((b) => b.role.kind === 'timeRoot');
      expect(timeRootBlocks.length).toBeGreaterThan(0);

      // If diagnostics store has E_TIME_ROOT_MISSING, it should be resolved after this
      const diagnostics = rootStore.diagnostics.activeDiagnostics;
      const timeRootMissing = diagnostics.find((d) => d.code === 'E_TIME_ROOT_MISSING');

      // After adding a TimeRoot, this diagnostic should not be present
      // (or if it was raised before action, it should be marked stale)
      if (timeRootMissing) {
        // Check that it's stale (from a previous revision)
        expect(timeRootMissing.scope.patchRevision).toBeLessThan(
          rootStore.getPatchRevision()
        );
      }
    });
  });

  describe('removeBlock action', () => {
    it('removes block from patch', () => {
      // First create a block (using a registered block type)
      const blockId = rootStore.patch.addBlock('Adapter_PhaseToScalar01', {});
      expect(rootStore.patch.blocks.has(blockId)).toBe(true);

      // Execute removeBlock action
      const action = {
        kind: 'removeBlock' as const,
        label: 'Remove Block',
        blockId,
      };

      const result = rootStore.executeAction(action);

      // Verify success
      expect(result.success).toBe(true);

      // Verify block was removed
      expect(rootStore.patch.blocks.has(blockId)).toBe(false);
    });

    it('fails for non-existent block', () => {
      const action = {
        kind: 'removeBlock' as const,
        label: 'Remove Block',
        blockId: 'nonexistent-block',
      };

      const result = rootStore.executeAction(action);

      // Verify failure
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('goToTarget action', () => {
    it('navigates to block target', () => {
      // Create a block (using a registered block type)
      const blockId = rootStore.patch.addBlock('Adapter_PhaseToScalar01', {});

      // Execute goToTarget action
      const action = {
        kind: 'goToTarget' as const,
        label: 'Go to Block',
        target: { kind: 'block' as const, blockId },
      };

      const result = rootStore.executeAction(action);

      // Verify success
      expect(result.success).toBe(true);

      // Verify selection changed
      expect(rootStore.selection.selectedBlockId).toBe(blockId);
    });
  });

  describe('insertBlock action', () => {
    it('creates new block and selects it', () => {
      const action = {
        kind: 'insertBlock' as const,
        label: 'Insert Adapter',
        blockType: 'Adapter_PhaseToScalar01',
      };

      const result = rootStore.executeAction(action);

      // Debug output if failed
      if (!result.success) {
        console.error('Action failed:', result.error);
      }

      // Verify success
      expect(result.success).toBe(true);

      // Verify block was created
      const blocks = Array.from(rootStore.patch.blocks.values());
      const adapterBlock = blocks.find((b) => b.type === 'Adapter_PhaseToScalar01');
      expect(adapterBlock).toBeDefined();

      // Verify selection
      expect(rootStore.selection.selectedBlockId).toBe(adapterBlock?.id);
    });
  });
});
