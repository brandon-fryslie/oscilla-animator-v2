/**
 * CTRL-SURFACE-05: Integration coverage for multi-editor, multi-pane,
 * and smooth control updates.
 *
 * Proves the control architecture satisfies multi-editor, multi-consumer,
 * and dynamic-update requirements with no hidden singleton assumptions.
 */

import { describe, it, expect } from 'vitest';
import { registerAllBlocks } from '../../blocks/all';
registerAllBlocks();

import { PatchStore } from '../PatchStore';
import { FrontendResultStore } from '../FrontendResultStore';
import { LayoutStore } from '../LayoutStore';
import { PatchStoreAdapter } from '../../ui/graphEditor/PatchStoreAdapter';
import { buildPatch } from '../../graph';
import { compileFrontend } from '../../compiler/frontend';
import type { BlockId, PortId } from '../../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compile a PatchStore's patch through the frontend and push into a FrontendResultStore. */
function compileAndPublish(
  patchStore: PatchStore,
  frontendStore: FrontendResultStore,
  revision: number,
): void {
  const result = compileFrontend(patchStore.patch);
  frontendStore.updateFromFrontendResult(result, revision);
}

/** Extract all control descriptors visible through an adapter for a given block+port. */
function getControlsViaAdapter(
  adapter: PatchStoreAdapter,
  blockId: BlockId,
  portId: string,
) {
  const block = adapter.blocks.get(blockId);
  return block?.inputPorts.get(portId)?.controls ?? [];
}

// =============================================================================
// Multi-editor isolation: independent PatchStore instances
// =============================================================================

describe('Multi-editor isolation', () => {
  it('two independent PatchStore instances maintain separate control surfaces', () => {
    const storeA = new PatchStore();
    const frontendA = new FrontendResultStore();

    const storeB = new PatchStore();
    const frontendB = new FrontendResultStore();

    // Editor A: Ellipse with default rx
    const ellipseA = storeA.addBlock('Ellipse');
    compileAndPublish(storeA, frontendA, 1);

    // Editor B: Rotate2D with default angleDeg
    const rotateB = storeB.addBlock('Rotate2D');
    compileAndPublish(storeB, frontendB, 1);

    // A's snapshot knows about Ellipse, not Rotate2D
    const bindingA = frontendA.getInputBindingByIds(ellipseA, 'rx');
    expect(bindingA).toBeDefined();
    expect(bindingA?.kind).toBe('resolved');
    expect(frontendA.getInputBindingByIds(rotateB, 'angleDeg')).toBeUndefined();

    // B's snapshot knows about Rotate2D, not Ellipse
    const bindingB = frontendB.getInputBindingByIds(rotateB, 'angleDeg');
    expect(bindingB).toBeDefined();
    expect(bindingB?.kind).toBe('resolved');
    expect(frontendB.getInputBindingByIds(ellipseA, 'rx')).toBeUndefined();
  });

  it('mutations in one editor do not affect the other', () => {
    const storeA = new PatchStore();
    const frontendA = new FrontendResultStore();

    const storeB = new PatchStore();
    const frontendB = new FrontendResultStore();

    storeA.addBlock('Ellipse');
    compileAndPublish(storeA, frontendA, 1);

    const rotateB = storeB.addBlock('Rotate2D');
    compileAndPublish(storeB, frontendB, 1);

    // Mutate editor A — add another block
    storeA.addBlock('Rect');
    compileAndPublish(storeA, frontendA, 2);

    // Editor B is untouched — still at revision 1
    expect(frontendB.snapshot.patchRevision).toBe(1);
    const bindingB = frontendB.getInputBindingByIds(rotateB, 'angleDeg');
    expect(bindingB?.kind).toBe('resolved');
  });
});

// =============================================================================
// Multi-consumer: multiple FrontendResultStores from the same PatchStore
// =============================================================================

describe('Multi-consumer subscription', () => {
  it('multiple FrontendResultStores consume the same FrontendResult independently', () => {
    const patchStore = new PatchStore();
    const consumer1 = new FrontendResultStore();
    const consumer2 = new FrontendResultStore();

    const ellipseId = patchStore.addBlock('Ellipse');
    const result = compileFrontend(patchStore.patch);

    consumer1.updateFromFrontendResult(result, 1);
    consumer2.updateFromFrontendResult(result, 1);

    // Both consumers see identical bindings
    const binding1 = consumer1.getInputBindingByIds(ellipseId, 'rx');
    const binding2 = consumer2.getInputBindingByIds(ellipseId, 'rx');
    expect(binding1).toBeDefined();
    expect(binding2).toBeDefined();
    expect(binding1?.kind).toBe(binding2?.kind);
    expect(binding1?.sourceKind).toBe(binding2?.sourceKind);
    expect(binding1?.controls.length).toBe(binding2?.controls.length);
  });

  it('multiple PatchStoreAdapters from the same PatchStore see consistent state', () => {
    const patchStore = new PatchStore();
    const frontendStore = new FrontendResultStore();
    const layout1 = new LayoutStore();
    const layout2 = new LayoutStore();

    const adapter1 = new PatchStoreAdapter(patchStore, layout1, frontendStore);
    const adapter2 = new PatchStoreAdapter(patchStore, layout2, frontendStore);

    const ellipseId = patchStore.addBlock('Ellipse');
    compileAndPublish(patchStore, frontendStore, 1);

    // Both adapters see the same block with the same binding controls
    const controls1 = getControlsViaAdapter(adapter1, ellipseId, 'rx');
    const controls2 = getControlsViaAdapter(adapter2, ellipseId, 'rx');
    expect(controls1.length).toBeGreaterThan(0);
    expect(controls1.length).toBe(controls2.length);
    expect(controls1[0]?.id).toBe(controls2[0]?.id);
    expect(controls1[0]?.value).toBe(controls2[0]?.value);
  });
});

// =============================================================================
// Late subscriber hydration
// =============================================================================

describe('Late subscriber hydration', () => {
  it('a FrontendResultStore created after compilation hydrates from current snapshot', () => {
    const patchStore = new PatchStore();
    const earlyConsumer = new FrontendResultStore();

    const ellipseId = patchStore.addBlock('Ellipse');
    const result = compileFrontend(patchStore.patch);
    earlyConsumer.updateFromFrontendResult(result, 1);

    // Late consumer — created after compilation happened
    const lateConsumer = new FrontendResultStore();
    // Hydrate by feeding the same result (no event replay needed)
    lateConsumer.updateFromFrontendResult(result, 1);

    const earlyBinding = earlyConsumer.getInputBindingByIds(ellipseId, 'rx');
    const lateBinding = lateConsumer.getInputBindingByIds(ellipseId, 'rx');
    expect(lateBinding).toBeDefined();
    expect(lateBinding?.kind).toBe(earlyBinding?.kind);
    expect(lateBinding?.controls.length).toBe(earlyBinding?.controls.length);
    expect(lateBinding?.controls[0]?.value).toBe(earlyBinding?.controls[0]?.value);
  });

  it('late PatchStoreAdapter sees full state without replaying history', () => {
    const patchStore = new PatchStore();
    const frontendStore = new FrontendResultStore();

    const ellipseId = patchStore.addBlock('Ellipse');
    compileAndPublish(patchStore, frontendStore, 1);

    // Late adapter — constructed after all mutations and compilation
    const layout = new LayoutStore();
    const lateAdapter = new PatchStoreAdapter(patchStore, layout, frontendStore);

    const controls = getControlsViaAdapter(lateAdapter, ellipseId, 'rx');
    expect(controls.length).toBeGreaterThan(0);
    expect(controls[0]?.target.kind).toBe('bindingSourceParam');
  });
});

// =============================================================================
// Control availability changes with graph connections
// =============================================================================

describe('Control availability reacts to graph changes', () => {
  it('connecting an edge changes provenance from defaultSource to userEdge', () => {
    const patchStore = new PatchStore();
    const frontendStore = new FrontendResultStore();
    const layout = new LayoutStore();
    const adapter = new PatchStoreAdapter(patchStore, layout, frontendStore);

    const ellipseId = patchStore.addBlock('Ellipse');
    compileAndPublish(patchStore, frontendStore, 1);

    // Before connection: defaultSource provenance
    const bindingBefore = frontendStore.getInputBindingByIds(ellipseId, 'rx');
    expect(bindingBefore?.sourceKind).toBe('defaultSource');
    const controlsBefore = getControlsViaAdapter(adapter, ellipseId, 'rx');
    expect(controlsBefore[0]?.target.kind).toBe('bindingSourceParam');

    // Connect a Const block to rx
    const constId = patchStore.addBlock('Const', { value: 0.5 });
    patchStore.addEdge(
      { kind: 'port', blockId: constId, slotId: 'out' },
      { kind: 'port', blockId: ellipseId, slotId: 'rx' },
    );
    compileAndPublish(patchStore, frontendStore, 2);

    // After connection: userEdge provenance
    const bindingAfter = frontendStore.getInputBindingByIds(ellipseId, 'rx');
    expect(bindingAfter?.sourceKind).toBe('userEdge');
    const controlsAfter = getControlsViaAdapter(adapter, ellipseId, 'rx');
    // User-wired Const controls point at blockParam, not bindingSourceParam
    expect(controlsAfter[0]?.target.kind).toBe('blockParam');
  });

  it('disconnecting an edge restores defaultSource controls', () => {
    const patchStore = new PatchStore();
    const frontendStore = new FrontendResultStore();

    const ellipseId = patchStore.addBlock('Ellipse');
    const constId = patchStore.addBlock('Const', { value: 0.5 });
    const edgeId = patchStore.addEdge(
      { kind: 'port', blockId: constId, slotId: 'out' },
      { kind: 'port', blockId: ellipseId, slotId: 'rx' },
    );
    compileAndPublish(patchStore, frontendStore, 1);

    expect(frontendStore.getInputBindingByIds(ellipseId, 'rx')?.sourceKind).toBe('userEdge');

    // Remove the edge
    patchStore.removeEdge(edgeId);
    compileAndPublish(patchStore, frontendStore, 2);

    // Restores to defaultSource
    const binding = frontendStore.getInputBindingByIds(ellipseId, 'rx');
    expect(binding?.sourceKind).toBe('defaultSource');
    expect(binding?.controls[0]?.target.kind).toBe('bindingSourceParam');
  });
});

// =============================================================================
// Write-through: mutations from one consumer visible to all
// =============================================================================

describe('Write-through consistency', () => {
  it('control value written via PatchStore is visible in all consumers after recompile', () => {
    const patchStore = new PatchStore();
    const consumer1 = new FrontendResultStore();
    const consumer2 = new FrontendResultStore();

    const ellipseId = patchStore.addBlock('Ellipse');
    compileAndPublish(patchStore, consumer1, 1);
    compileAndPublish(patchStore, consumer2, 1);

    // Get the control target for rx's default source value
    const binding = consumer1.getInputBindingByIds(ellipseId, 'rx');
    expect(binding?.controls.length).toBeGreaterThan(0);
    const target = binding!.controls[0]!.target;

    // Write through the canonical mutation path
    patchStore.updateControlValue(target, 0.1);

    // Recompile and publish to both consumers
    compileAndPublish(patchStore, consumer1, 2);
    compileAndPublish(patchStore, consumer2, 2);

    // Both consumers see the updated value
    const updated1 = consumer1.getInputBindingByIds(ellipseId, 'rx');
    const updated2 = consumer2.getInputBindingByIds(ellipseId, 'rx');
    expect(updated1?.controls[0]?.value).toBe(0.1);
    expect(updated2?.controls[0]?.value).toBe(0.1);
  });

  it('updateControlValue on bindingSourceParam updates authoredControl in Patch', () => {
    const patchStore = new PatchStore();
    const frontendStore = new FrontendResultStore();

    const rotateId = patchStore.addBlock('Rotate2D');
    compileAndPublish(patchStore, frontendStore, 1);

    patchStore.updateControlValue({
      kind: 'bindingSourceParam',
      blockId: rotateId,
      portId: 'angleDeg' as PortId,
      sourceBlockType: 'Const',
      sourceOutputPortId: 'out' as PortId,
      paramId: 'value',
    }, 90);

    // The canonical source is PatchStore's authoredControl
    const block = patchStore.patch.blocks.get(rotateId)!;
    expect(block.inputPorts.get('angleDeg')?.authoredControl?.source?.params.value).toBe(90);

    // After recompile, the frontend snapshot reflects the new value
    compileAndPublish(patchStore, frontendStore, 2);
    const binding = frontendStore.getInputBindingByIds(rotateId, 'angleDeg');
    expect(binding?.controls[0]?.value).toBe(90);
  });
});

// =============================================================================
// Filtering and querying over shared snapshot
// =============================================================================

describe('Snapshot filtering and querying', () => {
  it('inputBindings map can be filtered by sourceKind across all ports', () => {
    const patchStore = new PatchStore();
    const frontendStore = new FrontendResultStore();

    const ellipseId = patchStore.addBlock('Ellipse');
    const constId = patchStore.addBlock('Const', { value: 0.5 });
    // Wire const to rx but leave ry on default
    patchStore.addEdge(
      { kind: 'port', blockId: constId, slotId: 'out' },
      { kind: 'port', blockId: ellipseId, slotId: 'rx' },
    );
    compileAndPublish(patchStore, frontendStore, 1);

    const snapshot = frontendStore.snapshot;
    const defaultSourcePorts: string[] = [];
    const userEdgePorts: string[] = [];
    for (const [addr, binding] of snapshot.inputBindings) {
      if (binding.sourceKind === 'defaultSource') defaultSourcePorts.push(addr);
      if (binding.sourceKind === 'userEdge') userEdgePorts.push(addr);
    }

    // rx is user-wired, ry (and others) are default-sourced
    expect(userEdgePorts.some((p) => p.includes('.rx'))).toBe(true);
    expect(defaultSourcePorts.some((p) => p.includes('.ry'))).toBe(true);
    // No overlap
    const overlap = userEdgePorts.filter((p) => defaultSourcePorts.includes(p));
    expect(overlap).toHaveLength(0);
  });

  it('controls with specific target kinds can be collected from the full snapshot', () => {
    const patchStore = new PatchStore();
    const frontendStore = new FrontendResultStore();

    patchStore.addBlock('Ellipse');
    patchStore.addBlock('Rotate2D');
    compileAndPublish(patchStore, frontendStore, 1);

    // Collect all bindingSourceParam controls from the snapshot
    const allBindingSourceControls: Array<{ addr: string; label: string; value: unknown }> = [];
    for (const [addr, binding] of frontendStore.snapshot.inputBindings) {
      for (const ctrl of binding.controls) {
        if (ctrl.target.kind === 'bindingSourceParam') {
          allBindingSourceControls.push({ addr, label: ctrl.label, value: ctrl.value });
        }
      }
    }

    // Both Ellipse and Rotate2D have default-sourced inputs with bindingSourceParam controls
    expect(allBindingSourceControls.length).toBeGreaterThanOrEqual(2);
  });
});

// =============================================================================
// No singleton assumption: regression check
// =============================================================================

describe('No singleton regression', () => {
  it('FrontendResultStore has no module-level shared state', () => {
    // Create two stores and verify they are fully independent
    const store1 = new FrontendResultStore();
    const store2 = new FrontendResultStore();

    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot');
      b.addBlock('Ellipse');
    });

    const result = compileFrontend(patch);
    store1.updateFromFrontendResult(result, 1);

    // store2 was never updated — must be in empty state
    expect(store2.snapshot.status).toBe('none');
    expect(store2.snapshot.inputBindings.size).toBe(0);

    // Clearing store1 does not affect store2
    store1.clear();
    store1.updateFromFrontendResult(result, 2);
    expect(store1.snapshot.patchRevision).toBe(2);
    expect(store2.snapshot.status).toBe('none');
  });

  it('PatchStore instances are fully independent', () => {
    const store1 = new PatchStore();
    const store2 = new PatchStore();

    store1.addBlock('Ellipse');
    store2.addBlock('Rotate2D');

    // Each store only contains its own block type
    const types1 = [...store1.patch.blocks.values()].map((b) => b.type);
    const types2 = [...store2.patch.blocks.values()].map((b) => b.type);
    expect(types1).toContain('Ellipse');
    expect(types1).not.toContain('Rotate2D');
    expect(types2).toContain('Rotate2D');
    expect(types2).not.toContain('Ellipse');
  });

  it('PatchStoreAdapter does not leak state between instances', () => {
    const patchStore1 = new PatchStore();
    const frontend1 = new FrontendResultStore();
    const layout1 = new LayoutStore();

    const patchStore2 = new PatchStore();
    const frontend2 = new FrontendResultStore();
    const layout2 = new LayoutStore();

    const adapter1 = new PatchStoreAdapter(patchStore1, layout1, frontend1);
    const adapter2 = new PatchStoreAdapter(patchStore2, layout2, frontend2);

    patchStore1.addBlock('Ellipse');
    compileAndPublish(patchStore1, frontend1, 1);

    patchStore2.addBlock('Rotate2D');
    compileAndPublish(patchStore2, frontend2, 1);

    // adapter1 sees only Ellipse
    const types1 = [...adapter1.blocks.values()].map((b) => b.type);
    expect(types1).toContain('Ellipse');
    expect(types1).not.toContain('Rotate2D');
    expect(adapter1.blocks.size).toBe(1);

    // adapter2 sees only Rotate2D
    const types2 = [...adapter2.blocks.values()].map((b) => b.type);
    expect(types2).toContain('Rotate2D');
    expect(types2).not.toContain('Ellipse');
    expect(adapter2.blocks.size).toBe(1);
  });
});

// =============================================================================
// High-frequency control updates (performance)
// =============================================================================

describe('High-frequency control updates', () => {
  it('rapid updateControlValue calls complete without accumulating latency', () => {
    const patchStore = new PatchStore();

    const rotateId = patchStore.addBlock('Rotate2D');
    const target = {
      kind: 'bindingSourceParam' as const,
      blockId: rotateId,
      portId: 'angleDeg' as PortId,
      sourceBlockType: 'Const',
      sourceOutputPortId: 'out' as PortId,
      paramId: 'value',
    };

    const iterations = 1000;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      patchStore.updateControlValue(target, i * 0.36);
    }
    const elapsed = performance.now() - start;

    // 1000 control writes should complete in well under 500ms
    expect(elapsed).toBeLessThan(500);

    // Final value is the last written value
    const block = patchStore.patch.blocks.get(rotateId)!;
    expect(block.inputPorts.get('angleDeg')?.authoredControl?.source?.params.value).toBeCloseTo(
      (iterations - 1) * 0.36,
    );
  });

  it('rapid compile + publish cycles do not degrade', () => {
    const patchStore = new PatchStore();
    const frontendStore = new FrontendResultStore();

    patchStore.addBlock('Ellipse');

    const cycles = 50;
    const start = performance.now();
    for (let i = 0; i < cycles; i++) {
      compileAndPublish(patchStore, frontendStore, i);
    }
    const elapsed = performance.now() - start;

    // 50 compile+publish cycles for a simple patch should complete under 5s
    expect(elapsed).toBeLessThan(5000);
    expect(frontendStore.snapshot.patchRevision).toBe(cycles - 1);
  });
});
