# Implementation Context: Sprint 3 - Editor Integration

**Generated**: 2026-01-27
**Status**: READY FOR IMPLEMENTATION
**Plan**: SPRINT3-EDITOR-INTEGRATION-PLAN.md

This document contains all technical details needed to implement Sprint 3. An agent with ONLY this file should be able to implement the plan.

---

## 1. PatchStore Lens Methods

### File: `/Users/bmf/code/oscilla-animator-v2/src/stores/PatchStore.ts`

#### Location for new methods
Insert after `addVarargConnection` method (line ~636) and before `addEdge` method (line ~639).

#### Required imports (add at top of file)
```typescript
import type { LensAttachment } from '../graph/Patch';
import { generateLensId } from '../core/canonical-name';
```

#### MobX decorator update (in constructor, line ~120-122)
Add to the `makeObservable` call:
```typescript
makeObservable<PatchStore, '_data' | '_dataVersion'>(this, {
  // ... existing decorators
  addLens: action,
  removeLens: action,
  updateLensParams: action,
});
```

#### Method implementations

```typescript
/**
 * Add a lens to an input port.
 *
 * Creates a LensAttachment and appends it to the port's lenses array.
 * Triggers recompilation via GraphCommitted event.
 *
 * @param blockId - Block containing the input port
 * @param portId - Input port ID
 * @param lensType - Block type for the lens (e.g., 'Adapter_DegreesToRadians')
 * @param sourceAddress - Canonical address of the source output
 * @param params - Optional parameters for parameterized lenses
 * @returns Generated lens ID
 */
addLens(
  blockId: BlockId,
  portId: string,
  lensType: string,
  sourceAddress: string,
  params?: Record<string, unknown>
): string {
  const block = this._data.blocks.get(blockId);
  if (!block) {
    throw new Error(`Block ${blockId} not found`);
  }

  // Validate port exists (either in inputPorts or registry)
  let port = block.inputPorts.get(portId);
  if (!port) {
    const blockDef = requireBlockDef(block.type);
    const inputDef = blockDef.inputs[portId];
    if (!inputDef) {
      throw new Error(`Port ${portId} not found on block ${blockId}`);
    }
    if (inputDef.exposedAsPort === false) {
      throw new Error(`Cannot add lens to config-only input ${portId}`);
    }
    // Create port entry if it doesn't exist
    port = { id: portId, combineMode: 'last' };
  }

  // Validate lens type is registered
  requireBlockDef(lensType);

  // Generate deterministic lens ID
  const lensId = generateLensId(sourceAddress);

  // Check for duplicate
  const existingLenses = port.lenses ?? [];
  if (existingLenses.some(l => l.sourceAddress === sourceAddress)) {
    throw new Error(`Lens already exists for source ${sourceAddress} on port ${portId}`);
  }

  // Create lens attachment
  const lens: LensAttachment = {
    id: lensId,
    lensType,
    sourceAddress,
    params,
    sortKey: existingLenses.length,
  };

  // Update port with new lens
  const updatedPort = {
    ...port,
    lenses: [...existingLenses, lens],
  };

  // Update block with new port
  const updatedInputPorts = new Map(block.inputPorts);
  updatedInputPorts.set(portId, updatedPort);

  this._data.blocks.set(blockId, {
    ...block,
    inputPorts: updatedInputPorts,
  });

  this.invalidateSnapshot();

  // Emit events for recompilation
  if (this.eventHub && this.getPatchRevision) {
    this.eventHub.emit({
      type: 'BlockUpdated',
      patchId: this.patchId,
      patchRevision: this.getPatchRevision(),
      blockId,
      changeType: 'lens',
      property: portId,
    });

    this.eventHub.emit({
      type: 'GraphCommitted',
      patchId: this.patchId,
      patchRevision: this.getPatchRevision() + 1,
      reason: 'userEdit',
      diffSummary: {
        blocksAdded: 0,
        blocksRemoved: 0,
        edgesChanged: 0,
      },
    });
  }

  return lensId;
}

/**
 * Remove a lens from an input port.
 *
 * @param blockId - Block containing the input port
 * @param portId - Input port ID
 * @param lensId - Lens ID to remove
 */
removeLens(blockId: BlockId, portId: string, lensId: string): void {
  const block = this._data.blocks.get(blockId);
  if (!block) {
    throw new Error(`Block ${blockId} not found`);
  }

  const port = block.inputPorts.get(portId);
  const existingLenses = port?.lenses ?? [];
  const newLenses = existingLenses.filter(l => l.id !== lensId);

  if (newLenses.length === existingLenses.length) {
    throw new Error(`Lens ${lensId} not found on port ${portId}`);
  }

  // Update port - clear lenses if empty
  const updatedPort = {
    ...port!,
    lenses: newLenses.length > 0 ? newLenses : undefined,
  };

  // Update block
  const updatedInputPorts = new Map(block.inputPorts);
  updatedInputPorts.set(portId, updatedPort);

  this._data.blocks.set(blockId, {
    ...block,
    inputPorts: updatedInputPorts,
  });

  this.invalidateSnapshot();

  // Emit events
  if (this.eventHub && this.getPatchRevision) {
    this.eventHub.emit({
      type: 'BlockUpdated',
      patchId: this.patchId,
      patchRevision: this.getPatchRevision(),
      blockId,
      changeType: 'lens',
      property: portId,
    });

    this.eventHub.emit({
      type: 'GraphCommitted',
      patchId: this.patchId,
      patchRevision: this.getPatchRevision() + 1,
      reason: 'userEdit',
      diffSummary: {
        blocksAdded: 0,
        blocksRemoved: 0,
        edgesChanged: 0,
      },
    });
  }
}

/**
 * Get all lenses attached to an input port.
 *
 * @param blockId - Block containing the input port
 * @param portId - Input port ID
 * @returns Array of lens attachments (empty if none)
 */
getLensesForPort(blockId: BlockId, portId: string): readonly LensAttachment[] {
  const block = this._data.blocks.get(blockId);
  if (!block) return [];
  const port = block.inputPorts.get(portId);
  return port?.lenses ? [...port.lenses] : [];
}

/**
 * Update parameters for an existing lens.
 *
 * @param blockId - Block containing the input port
 * @param portId - Input port ID
 * @param lensId - Lens ID to update
 * @param params - New parameters (shallow merged with existing)
 */
updateLensParams(
  blockId: BlockId,
  portId: string,
  lensId: string,
  params: Record<string, unknown>
): void {
  const block = this._data.blocks.get(blockId);
  if (!block) {
    throw new Error(`Block ${blockId} not found`);
  }

  const port = block.inputPorts.get(portId);
  const existingLenses = port?.lenses ?? [];
  const lensIndex = existingLenses.findIndex(l => l.id === lensId);

  if (lensIndex === -1) {
    throw new Error(`Lens ${lensId} not found on port ${portId}`);
  }

  // Update the lens with merged params
  const newLenses = existingLenses.map((l, i) =>
    i === lensIndex ? { ...l, params: { ...l.params, ...params } } : l
  );

  // Update port
  const updatedPort = {
    ...port!,
    lenses: newLenses,
  };

  // Update block
  const updatedInputPorts = new Map(block.inputPorts);
  updatedInputPorts.set(portId, updatedPort);

  this._data.blocks.set(blockId, {
    ...block,
    inputPorts: updatedInputPorts,
  });

  this.invalidateSnapshot();

  // Emit events
  if (this.eventHub && this.getPatchRevision) {
    this.eventHub.emit({
      type: 'GraphCommitted',
      patchId: this.patchId,
      patchRevision: this.getPatchRevision() + 1,
      reason: 'userEdit',
      diffSummary: {
        blocksAdded: 0,
        blocksRemoved: 0,
        edgesChanged: 0,
      },
    });
  }
}
```

---

## 2. Lens Utilities File

### File: `/Users/bmf/code/oscilla-animator-v2/src/ui/reactFlowEditor/lensUtils.ts` (NEW)

```typescript
/**
 * Lens Utilities for Editor UI
 *
 * Provides helper functions for lens management in the editor.
 */

import type { SignalType } from '../../core/canonical-types';
import { getBlockTypesByCategory } from '../../blocks/registry';

/**
 * Information about an available lens type for UI display.
 */
export interface LensTypeInfo {
  /** Block type identifier */
  blockType: string;
  /** Human-readable label */
  label: string;
  /** Description of what the lens does */
  description: string;
  /** Input type the lens accepts */
  inputType: SignalType;
  /** Output type the lens produces */
  outputType: SignalType;
}

/**
 * Get all available lens types for UI selection.
 * Filters adapter blocks from the registry.
 *
 * @returns Array of lens type info, sorted by label
 */
export function getAvailableLensTypes(): LensTypeInfo[] {
  const adapterBlocks = getBlockTypesByCategory('adapter');

  return adapterBlocks
    .map(def => ({
      blockType: def.type,
      label: def.label,
      description: def.description ?? '',
      inputType: def.inputs['in']?.type,
      outputType: def.outputs['out']?.type,
    }))
    .filter(info => info.inputType && info.outputType) // Only include valid lenses
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Get a human-readable label for a lens type.
 *
 * @param lensType - Block type identifier
 * @returns Human-readable label
 */
export function getLensLabel(lensType: string): string {
  const lenses = getAvailableLensTypes();
  const lens = lenses.find(l => l.blockType === lensType);
  return lens?.label ?? lensType.replace('Adapter_', '').replace(/([A-Z])/g, ' $1').trim();
}

/**
 * Check if a lens can be applied between two types.
 *
 * @param sourceType - Output type from source port
 * @param lensInputType - Input type the lens accepts
 * @param lensOutputType - Output type the lens produces
 * @param targetType - Input type of target port
 * @returns true if lens is compatible
 */
export function canApplyLens(
  sourceType: SignalType,
  lensInputType: SignalType,
  lensOutputType: SignalType,
  targetType: SignalType
): boolean {
  // Simple compatibility: exact type matches
  // Source must match lens input, lens output must match target
  const sourceMatches = typesMatch(sourceType, lensInputType);
  const outputMatches = typesMatch(lensOutputType, targetType);
  return sourceMatches && outputMatches;
}

/**
 * Check if two signal types match.
 * Handles payload and unit comparison.
 */
function typesMatch(a: SignalType, b: SignalType): boolean {
  // Payload must match
  if (a.payload.kind !== b.payload.kind) return false;

  // Unit comparison (if both have units)
  if (a.unit && b.unit) {
    return a.unit.kind === b.unit.kind;
  }

  // If either has no unit, consider compatible (scalar)
  return true;
}

/**
 * Find compatible lenses for a connection.
 *
 * @param sourceType - Output type from source port
 * @param targetType - Input type of target port
 * @returns Array of compatible lens types
 */
export function findCompatibleLenses(
  sourceType: SignalType,
  targetType: SignalType
): LensTypeInfo[] {
  const allLenses = getAvailableLensTypes();
  return allLenses.filter(lens =>
    canApplyLens(sourceType, lens.inputType, lens.outputType, targetType)
  );
}
```

---

## 3. PortData Extension

### File: `/Users/bmf/code/oscilla-animator-v2/src/ui/reactFlowEditor/nodes.ts`

#### Line ~35-50: Extend PortData interface
```typescript
export interface PortData {
  id: string;
  label: string;
  defaultSource?: DefaultSource;
  payloadType: PayloadType;
  typeTooltip: string;
  typeColor: string;
  isConnected: boolean;
  connection?: PortConnectionInfo;
  uiHint?: UIControlHint;
  /** Number of lenses attached to this port (inputs only) */
  lensCount?: number;
  /** Lens details for popover display */
  lenses?: readonly import('../../graph/Patch').LensAttachment[];
}
```

#### Line ~100-126: Update createPortData function
Add lenses parameter and populate fields:
```typescript
function createPortData(
  id: string,
  label: string,
  type: SignalType | undefined,
  isConnected: boolean,
  defaultSource?: DefaultSource,
  connection?: PortConnectionInfo,
  uiHint?: UIControlHint,
  lenses?: readonly import('../../graph/Patch').LensAttachment[]
): PortData {
  const effectiveType: SignalType = type || signalType(FLOAT);

  return {
    id,
    label,
    defaultSource,
    payloadType: effectiveType.payload,
    typeTooltip: formatTypeForTooltip(effectiveType),
    typeColor: getTypeColor(effectiveType.payload),
    isConnected,
    connection,
    uiHint,
    lensCount: lenses?.length ?? 0,
    lenses,
  };
}
```

#### Line ~198: Update createNodeFromBlock input ports mapping
```typescript
inputs: Object.entries(blockDef.inputs).map(([inputId, input]) => {
  // Skip non-port inputs
  if (input.exposedAsPort === false) return null;

  // Get lenses for this port
  const portData = block.inputPorts.get(inputId);
  const lenses = portData?.lenses;

  return createPortData(
    inputId,
    input.label || inputId,
    input.type,
    inputConnections.has(inputId),
    getEffectiveDefaultSource(block, inputId, input),
    inputConnections.get(inputId),
    input.uiHint,
    lenses
  );
}).filter((p): p is PortData => p !== null),
```

---

## 4. OscillaNode Lens Indicator

### File: `/Users/bmf/code/oscilla-animator-v2/src/ui/reactFlowEditor/OscillaNode.tsx`

#### Line ~232-234 (after Default Source Indicator): Add lens indicator
```tsx
{/* Lens Indicator (for ports with attached lenses) */}
{input.lensCount && input.lensCount > 0 && (
  <div
    style={{
      position: 'absolute',
      left: '-3px',
      top: `calc(${topPercent}% + 12px)`,
      minWidth: input.lensCount > 1 ? '14px' : '8px',
      height: '8px',
      borderRadius: '4px',
      background: '#f59e0b',
      pointerEvents: 'none',
      fontSize: '8px',
      color: '#000',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 'bold',
    }}
    title={`${input.lensCount} lens${input.lensCount > 1 ? 'es' : ''} attached`}
  >
    {input.lensCount > 1 ? input.lensCount : ''}
  </div>
)}
```

---

## 5. PortInfoPopover Lenses Section

### File: `/Users/bmf/code/oscilla-animator-v2/src/ui/reactFlowEditor/PortInfoPopover.tsx`

#### Add import at top
```typescript
import { getLensLabel } from './lensUtils';
```

#### Line ~278-292 (after Default Source section): Add lenses section
```tsx
{/* Lenses (for inputs with attached lenses) */}
{isInput && port.lenses && port.lenses.length > 0 && (
  <Box>
    <Text size="xs" c="dimmed">
      Lenses
    </Text>
    <Stack gap={4} mt={4}>
      {port.lenses.map((lens) => (
        <Group key={lens.id} gap="xs">
          <Badge size="xs" color="orange" variant="light">
            {getLensLabel(lens.lensType)}
          </Badge>
          <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace' }}>
            {lens.sourceAddress.split('.').slice(-2).join('.')}
          </Text>
        </Group>
      ))}
    </Stack>
  </Box>
)}
```

---

## 6. PortContextMenu Lens Items

### File: `/Users/bmf/code/oscilla-animator-v2/src/ui/reactFlowEditor/menus/PortContextMenu.tsx`

#### Add imports at top
```typescript
import {
  Transform as LensIcon,
  RemoveCircle as RemoveLensIcon,
} from '@mui/icons-material';
import { getAvailableLensTypes, getLensLabel, findCompatibleLenses } from '../lensUtils';
import { getPortTypeFromBlockType } from '../typeValidation';
```

#### Line ~294-350 (after Add Block section, before Disconnect): Add lens menu items
```tsx
// ==========================================================================
// Section: Add Lens (input ports only)
// ==========================================================================
if (isInput) {
  // Find incoming edge to get source info
  const incomingEdge = patch.edges.find(
    (edge) => edge.to.blockId === blockId && edge.to.slotId === portId
  );

  if (incomingEdge) {
    const sourceBlock = patch.blocks.get(incomingEdge.from.blockId as BlockId);
    if (sourceBlock) {
      const sourceType = getPortTypeFromBlockType(
        sourceBlock.type,
        incomingEdge.from.slotId,
        'output'
      );
      const targetType = getPortTypeFromBlockType(block.type, portId, 'input');

      if (sourceType && targetType) {
        const compatibleLenses = findCompatibleLenses(sourceType, targetType);

        if (compatibleLenses.length > 0) {
          const sourceAddress = `v1:blocks.${sourceBlock.displayName}.outputs.${incomingEdge.from.slotId}`;

          for (const lens of compatibleLenses.slice(0, 5)) { // Limit to 5
            menuItems.push({
              label: `Add Lens: ${lens.label}`,
              icon: <LensIcon fontSize="small" />,
              action: () => {
                patch.addLens(blockId, portId, lens.blockType, sourceAddress);
              },
            });
          }

          if (menuItems.length > 0) {
            menuItems[menuItems.length - 1].dividerAfter = true;
          }
        }
      }
    }
  }
}

// ==========================================================================
// Section: Remove Lens (input ports only)
// ==========================================================================
if (isInput) {
  const existingLenses = patch.getLensesForPort(blockId, portId);

  if (existingLenses.length > 0) {
    if (existingLenses.length === 1) {
      menuItems.push({
        label: `Remove Lens (${getLensLabel(existingLenses[0].lensType)})`,
        icon: <RemoveLensIcon fontSize="small" />,
        action: () => {
          patch.removeLens(blockId, portId, existingLenses[0].id);
        },
        dividerAfter: true,
      });
    } else {
      for (const lens of existingLenses) {
        menuItems.push({
          label: `Remove: ${getLensLabel(lens.lensType)}`,
          icon: <RemoveLensIcon fontSize="small" />,
          action: () => {
            patch.removeLens(blockId, portId, lens.id);
          },
        });
      }
      menuItems[menuItems.length - 1].dividerAfter = true;
    }
  }
}
```

---

## 7. EdgeContextMenu Lens Items

### File: `/Users/bmf/code/oscilla-animator-v2/src/ui/reactFlowEditor/menus/EdgeContextMenu.tsx`

#### Add imports at top
```typescript
import { Transform as LensIcon } from '@mui/icons-material';
import { findCompatibleLenses, getLensLabel } from '../lensUtils';
import { getPortTypeFromBlockType } from '../typeValidation';
```

#### Line ~61 (after "Go to Target", before Delete): Add lens menu item
```tsx
// Add Lens option
const sourceType = sourceBlock
  ? getPortTypeFromBlockType(sourceBlock.type, edge.from.slotId, 'output')
  : null;
const targetType = targetBlock
  ? getPortTypeFromBlockType(targetBlock.type, edge.to.slotId, 'input')
  : null;

if (sourceType && targetType) {
  const compatibleLenses = findCompatibleLenses(sourceType, targetType);

  if (compatibleLenses.length > 0) {
    const sourceAddress = `v1:blocks.${sourceBlock!.displayName}.outputs.${edge.from.slotId}`;

    return [
      // ... existing Go to Source/Target items
      ...compatibleLenses.slice(0, 3).map(lens => ({
        label: `Add Lens: ${lens.label}`,
        icon: <LensIcon fontSize="small" />,
        action: () => {
          patch.addLens(
            edge.to.blockId as BlockId,
            edge.to.slotId,
            lens.blockType,
            sourceAddress
          );
        },
      })),
      { /* divider marker */ dividerAfter: true },
      // ... Delete Connection item
    ];
  }
}
```

---

## 8. PatchBuilder Extension

### File: `/Users/bmf/code/oscilla-animator-v2/src/graph/Patch.ts`

#### Add import at top (if not already present)
```typescript
import { generateLensId } from '../core/canonical-name';
```

#### Line ~507 (after addVarargConnection method): Add addLens method
```typescript
/**
 * Add a lens to an input port.
 *
 * @param blockId - Block ID
 * @param portId - Input port ID
 * @param lensType - Lens block type
 * @param sourceAddress - Canonical address of the source output
 * @param params - Optional lens parameters
 */
addLens(
  blockId: BlockId,
  portId: string,
  lensType: string,
  sourceAddress: string,
  params?: Record<string, unknown>
): this {
  const block = this.blocks.get(blockId);
  if (!block) {
    throw new Error(`Block ${blockId} not found`);
  }

  const port = block.inputPorts.get(portId);
  const lensId = generateLensId(sourceAddress);
  const existingLenses = port?.lenses ?? [];

  const lens: LensAttachment = {
    id: lensId,
    lensType,
    sourceAddress,
    params,
    sortKey: existingLenses.length,
  };

  const updatedPort: InputPort = {
    ...port ?? { id: portId, combineMode: 'last' },
    lenses: [...existingLenses, lens],
  };

  const updatedInputPorts = new Map(block.inputPorts);
  updatedInputPorts.set(portId, updatedPort);

  this.blocks.set(blockId, { ...block, inputPorts: updatedInputPorts });
  return this;
}
```

---

## 9. Store Exports

### File: `/Users/bmf/code/oscilla-animator-v2/src/stores/index.ts`

#### Add export
```typescript
export type { LensAttachment } from '../graph/Patch';
```

---

## 10. Test File

### File: `/Users/bmf/code/oscilla-animator-v2/src/stores/__tests__/PatchStore-lens.test.ts` (NEW)

```typescript
/**
 * Tests for PatchStore lens methods.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PatchStore } from '../PatchStore';
import type { BlockId } from '../../types';

// Import block registrations
import '../../blocks';

describe('PatchStore Lens Methods', () => {
  let store: PatchStore;

  beforeEach(() => {
    store = new PatchStore();
  });

  describe('addLens', () => {
    it('adds lens to port with no existing lenses', () => {
      const blockId = store.addBlock('Sin', {});
      const lensId = store.addLens(
        blockId,
        'phase',
        'Adapter_ScalarToPhase01',
        'v1:blocks.phasor_1.outputs.phase'
      );

      expect(lensId).toMatch(/^lens_/);
      const lenses = store.getLensesForPort(blockId, 'phase');
      expect(lenses).toHaveLength(1);
      expect(lenses[0].lensType).toBe('Adapter_ScalarToPhase01');
    });

    it('adds lens to port with existing lenses', () => {
      const blockId = store.addBlock('Sin', {});
      store.addLens(blockId, 'phase', 'Adapter_ScalarToPhase01', 'v1:blocks.a.outputs.x');
      store.addLens(blockId, 'phase', 'Adapter_DegreesToRadians', 'v1:blocks.b.outputs.y');

      const lenses = store.getLensesForPort(blockId, 'phase');
      expect(lenses).toHaveLength(2);
      expect(lenses[0].sortKey).toBe(0);
      expect(lenses[1].sortKey).toBe(1);
    });

    it('throws if lens already exists for source', () => {
      const blockId = store.addBlock('Sin', {});
      const sourceAddr = 'v1:blocks.phasor_1.outputs.phase';
      store.addLens(blockId, 'phase', 'Adapter_ScalarToPhase01', sourceAddr);

      expect(() => {
        store.addLens(blockId, 'phase', 'Adapter_ScalarToPhase01', sourceAddr);
      }).toThrow(/already exists/);
    });

    it('throws if block not found', () => {
      expect(() => {
        store.addLens('nonexistent' as BlockId, 'phase', 'Adapter_ScalarToPhase01', 'addr');
      }).toThrow(/not found/);
    });

    it('throws if lens type not registered', () => {
      const blockId = store.addBlock('Sin', {});
      expect(() => {
        store.addLens(blockId, 'phase', 'NonexistentLens', 'addr');
      }).toThrow();
    });
  });

  describe('removeLens', () => {
    it('removes lens from port', () => {
      const blockId = store.addBlock('Sin', {});
      const lensId = store.addLens(
        blockId, 'phase', 'Adapter_ScalarToPhase01', 'v1:blocks.a.outputs.x'
      );

      store.removeLens(blockId, 'phase', lensId);
      expect(store.getLensesForPort(blockId, 'phase')).toHaveLength(0);
    });

    it('throws if lens not found', () => {
      const blockId = store.addBlock('Sin', {});
      expect(() => {
        store.removeLens(blockId, 'phase', 'nonexistent');
      }).toThrow(/not found/);
    });
  });

  describe('getLensesForPort', () => {
    it('returns empty array for port with no lenses', () => {
      const blockId = store.addBlock('Sin', {});
      expect(store.getLensesForPort(blockId, 'phase')).toEqual([]);
    });

    it('returns defensive copy', () => {
      const blockId = store.addBlock('Sin', {});
      store.addLens(blockId, 'phase', 'Adapter_ScalarToPhase01', 'v1:blocks.a.outputs.x');

      const lenses1 = store.getLensesForPort(blockId, 'phase');
      const lenses2 = store.getLensesForPort(blockId, 'phase');
      expect(lenses1).not.toBe(lenses2);
    });
  });

  describe('updateLensParams', () => {
    it('updates lens params', () => {
      const blockId = store.addBlock('Sin', {});
      const lensId = store.addLens(
        blockId, 'phase', 'Adapter_ScalarToPhase01', 'v1:blocks.a.outputs.x',
        { scale: 1.0 }
      );

      store.updateLensParams(blockId, 'phase', lensId, { scale: 2.0 });

      const lenses = store.getLensesForPort(blockId, 'phase');
      expect(lenses[0].params?.scale).toBe(2.0);
    });

    it('merges with existing params', () => {
      const blockId = store.addBlock('Sin', {});
      const lensId = store.addLens(
        blockId, 'phase', 'Adapter_ScalarToPhase01', 'v1:blocks.a.outputs.x',
        { scale: 1.0, offset: 0 }
      );

      store.updateLensParams(blockId, 'phase', lensId, { scale: 2.0 });

      const lenses = store.getLensesForPort(blockId, 'phase');
      expect(lenses[0].params).toEqual({ scale: 2.0, offset: 0 });
    });
  });
});
```

---

## Adjacent Code Patterns to Follow

### Event Emission Pattern
See `updateInputPort` at line ~480 in PatchStore.ts:
```typescript
if (this.eventHub && this.getPatchRevision) {
  this.eventHub.emit({
    type: 'BlockUpdated',
    // ...
  });
  this.eventHub.emit({
    type: 'GraphCommitted',
    // ...
  });
}
```

### Context Menu Item Pattern
See `PortContextMenu.tsx` line ~242-264 for how to add menu items with actions.

### Port Data Population Pattern
See `createNodeFromBlock` at line ~137 in nodes.ts for how port data is assembled.

### Visual Indicator Pattern
See the Default Source Indicator at line ~218-232 in OscillaNode.tsx for positioning style.
