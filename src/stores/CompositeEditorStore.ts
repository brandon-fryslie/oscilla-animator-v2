/**
 * CompositeEditorStore
 *
 * MobX store managing the state of the composite block editor.
 * Handles the internal graph being edited, port exposure, and save/cancel workflow.
 */

import { makeObservable, observable, action, computed } from 'mobx';
import type {
  CompositeBlockDef,
  InternalBlockId,
  InternalBlockDef,
  InternalEdge,
  ExposedInputPort,
  ExposedOutputPort,
} from '../blocks/composite-types';
import { internalBlockId } from '../blocks/composite-types';
import {
  registerComposite,
  unregisterComposite,
  getCompositeDefinition,
  getBlockDefinition,
  validateCompositeDefinition,
} from '../blocks/registry';
import type { Capability } from '../blocks/registry';
import { compositeStorage } from '../blocks/composites/persistence';
import { compositeDefToJSON } from '../blocks/composites/loader';

// =============================================================================
// Types
// =============================================================================

export interface CompositeMetadata {
  readonly name: string;
  readonly label: string;
  readonly category: string;
  readonly description?: string;
}

export interface InternalBlockState {
  readonly id: InternalBlockId;
  readonly type: string;
  readonly position: { x: number; y: number };
  readonly params?: Record<string, unknown>;
  readonly displayName?: string;
}

export interface ValidationError {
  readonly code: string;
  readonly message: string;
  readonly location?: { internalBlockId?: string; portId?: string };
}

// =============================================================================
// Store
// =============================================================================

export class CompositeEditorStore {
  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  /** ID of existing composite being edited, or null for new composite */
  compositeId: string | null = null;

  /** Internal blocks in the composite being edited */
  internalBlocks: Map<InternalBlockId, InternalBlockState> = new Map();

  /** Internal edges connecting blocks */
  internalEdges: InternalEdge[] = [];

  /** Exposed input ports */
  exposedInputs: ExposedInputPort[] = [];

  /** Exposed output ports */
  exposedOutputs: ExposedOutputPort[] = [];

  /** Composite metadata */
  metadata: CompositeMetadata = {
    name: '',
    label: '',
    category: 'user',
    description: '',
  };

  /** Whether the editor is open */
  isOpen: boolean = false;

  /** Tracks if there are unsaved changes */
  isDirty: boolean = false;

  /** Whether editing a fork of a readonly composite (save creates new) */
  isFork: boolean = false;

  /** Counter for auto-generating unique composite names */
  private static _nameCounter: number = 1;

  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------

  constructor() {
    makeObservable(this, {
      // Observable state
      compositeId: observable,
      internalBlocks: observable,
      internalEdges: observable,
      exposedInputs: observable,
      exposedOutputs: observable,
      metadata: observable,
      isOpen: observable,
      isDirty: observable,
      isFork: observable,

      // Computed
      validationErrors: computed,
      canSave: computed,
      allInternalInputPorts: computed,
      allInternalOutputPorts: computed,

      // Actions
      openNew: action,
      openExisting: action,
      close: action,
      addBlock: action,
      removeBlock: action,
      updateBlockPosition: action,
      addEdge: action,
      removeEdge: action,
      exposeInputPort: action,
      exposeOutputPort: action,
      unexposeInputPort: action,
      unexposeOutputPort: action,
      updateExposedInputId: action,
      updateExposedOutputId: action,
      updateMetadata: action,
      save: action,
      reset: action,
    });
  }

  // -------------------------------------------------------------------------
  // Static Helpers
  // -------------------------------------------------------------------------

  /**
   * Generate a unique composite name.
   * Format: MyComposite1, MyComposite2, etc.
   */
  static generateUniqueName(baseName: string = 'MyComposite'): string {
    const name = `${baseName}${CompositeEditorStore._nameCounter}`;
    CompositeEditorStore._nameCounter++;
    return name;
  }

  // -------------------------------------------------------------------------
  // Computed
  // -------------------------------------------------------------------------

  /**
   * Validation errors for the current composite state.
   */
  get validationErrors(): ValidationError[] {
    const errors: ValidationError[] = [];

    // Check for empty name
    if (!this.metadata.name || this.metadata.name.trim() === '') {
      errors.push({
        code: 'EMPTY_NAME',
        message: 'Composite name is required',
      });
    }

    // Check for valid identifier
    if (this.metadata.name && !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(this.metadata.name)) {
      errors.push({
        code: 'INVALID_NAME',
        message: 'Name must be a valid identifier (start with letter, alphanumeric + underscore)',
      });
    }

    // Check for at least one block
    if (this.internalBlocks.size === 0) {
      errors.push({
        code: 'NO_BLOCKS',
        message: 'Composite must have at least one internal block',
      });
    }

    // Check for at least one exposed port
    if (this.exposedInputs.length === 0 && this.exposedOutputs.length === 0) {
      errors.push({
        code: 'NO_EXPOSED_PORTS',
        message: 'Composite must expose at least one input or output port',
      });
    }

    // Validate against registry if we have enough data
    if (this.metadata.name && this.internalBlocks.size > 0) {
      const def = this.buildCompositeDef();
      if (def) {
        const registryErrors = validateCompositeDefinition(def);
        for (const err of registryErrors) {
          errors.push({
            code: err.code,
            message: err.message,
            location: err.location,
          });
        }
      }
    }

    return errors;
  }

  /**
   * Whether the composite can be saved (no validation errors).
   */
  get canSave(): boolean {
    return this.validationErrors.length === 0;
  }

  /**
   * All input ports from all internal blocks.
   */
  get allInternalInputPorts(): Array<{
    blockId: InternalBlockId;
    blockType: string;
    portId: string;
    portLabel: string;
    isExposed: boolean;
    externalId?: string;
  }> {
    const ports: Array<{
      blockId: InternalBlockId;
      blockType: string;
      portId: string;
      portLabel: string;
      isExposed: boolean;
      externalId?: string;
    }> = [];

    for (const [blockId, block] of this.internalBlocks) {
      const blockDef = getBlockDefinition(block.type);
      if (!blockDef) continue;

      for (const [portId, inputDef] of Object.entries(blockDef.inputs)) {
        // Skip non-exposed config ports
        if (inputDef.exposedAsPort === false) continue;

        const exposed = this.exposedInputs.find(
          exp => exp.internalBlockId === blockId && exp.internalPortId === portId
        );

        ports.push({
          blockId,
          blockType: block.type,
          portId,
          portLabel: inputDef.label || portId,
          isExposed: !!exposed,
          externalId: exposed?.externalId,
        });
      }
    }

    return ports;
  }

  /**
   * All output ports from all internal blocks.
   */
  get allInternalOutputPorts(): Array<{
    blockId: InternalBlockId;
    blockType: string;
    portId: string;
    portLabel: string;
    isExposed: boolean;
    externalId?: string;
  }> {
    const ports: Array<{
      blockId: InternalBlockId;
      blockType: string;
      portId: string;
      portLabel: string;
      isExposed: boolean;
      externalId?: string;
    }> = [];

    for (const [blockId, block] of this.internalBlocks) {
      const blockDef = getBlockDefinition(block.type);
      if (!blockDef) continue;

      for (const [portId, outputDef] of Object.entries(blockDef.outputs)) {
        const exposed = this.exposedOutputs.find(
          exp => exp.internalBlockId === blockId && exp.internalPortId === portId
        );

        ports.push({
          blockId,
          blockType: block.type,
          portId,
          portLabel: outputDef.label || portId,
          isExposed: !!exposed,
          externalId: exposed?.externalId,
        });
      }
    }

    return ports;
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  /**
   * Open the editor to create a new composite.
   * Auto-generates a unique name.
   */
  openNew(): void {
    this.reset();
    const autoName = CompositeEditorStore.generateUniqueName();
    this.metadata = {
      name: autoName,
      label: autoName,
      category: 'user',
      description: '',
    };
    this.isOpen = true;
  }

  /**
   * Open the editor to edit an existing composite.
   * If the composite is readonly (library), opens in fork mode where
   * saving creates a new composite with an auto-generated name.
   */
  openExisting(compositeType: string): void {
    const def = getCompositeDefinition(compositeType);
    if (!def) {
      console.error(`Composite not found: ${compositeType}`);
      return;
    }

    this.reset();

    // Check if this is a readonly (library) composite
    const isReadonly = def.readonly === true;
    this.isFork = isReadonly;

    if (isReadonly) {
      // Fork mode: generate new name, don't link to original
      const baseName = def.type.replace(/^My/, ''); // Remove "My" prefix if present
      const forkName = CompositeEditorStore.generateUniqueName(`My${baseName}`);
      this.compositeId = null; // Not editing original
      this.metadata = {
        name: forkName,
        label: `${def.label} (Copy)`,
        category: 'user', // User composites go to 'user' category
        description: `Fork of ${def.type}`,
      };
    } else {
      // Edit mode: editing existing user composite
      this.compositeId = compositeType;
      this.metadata = {
        name: def.type,
        label: def.label,
        category: def.category,
        description: '',
      };
    }

    // Load internal blocks with auto-layout
    let layoutX = 100;
    let layoutY = 100;
    for (const [id, blockDef] of def.internalBlocks) {
      this.internalBlocks.set(id, {
        id,
        type: blockDef.type,
        position: { x: layoutX, y: layoutY },
        params: blockDef.params,
        displayName: blockDef.displayName,
      });
      layoutY += 120; // Stack blocks vertically for initial layout
      if (layoutY > 400) {
        layoutY = 100;
        layoutX += 200;
      }
    }

    // Load internal edges
    this.internalEdges = [...def.internalEdges];

    // Load exposed ports
    this.exposedInputs = [...def.exposedInputs];
    this.exposedOutputs = [...def.exposedOutputs];

    this.isOpen = true;
    this.isDirty = isReadonly; // Fork is immediately dirty (needs save)
  }

  /**
   * Close the editor.
   */
  close(): void {
    this.isOpen = false;
  }

  /**
   * Add a new internal block.
   */
  addBlock(type: string, position: { x: number; y: number }): InternalBlockId {
    const id = internalBlockId(`block_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
    this.internalBlocks.set(id, {
      id,
      type,
      position,
    });
    this.isDirty = true;
    return id;
  }

  /**
   * Remove an internal block and all its edges.
   */
  removeBlock(id: InternalBlockId): void {
    this.internalBlocks.delete(id);
    // Remove edges connected to this block
    this.internalEdges = this.internalEdges.filter(
      e => e.fromBlock !== id && e.toBlock !== id
    );
    // Remove exposed ports for this block
    this.exposedInputs = this.exposedInputs.filter(
      p => p.internalBlockId !== id
    );
    this.exposedOutputs = this.exposedOutputs.filter(
      p => p.internalBlockId !== id
    );
    this.isDirty = true;
  }

  /**
   * Update block position.
   */
  updateBlockPosition(id: InternalBlockId, position: { x: number; y: number }): void {
    const block = this.internalBlocks.get(id);
    if (block) {
      this.internalBlocks.set(id, { ...block, position });
    }
  }

  /**
   * Add an internal edge.
   */
  addEdge(edge: InternalEdge): void {
    // Check if edge already exists
    const exists = this.internalEdges.some(
      e =>
        e.fromBlock === edge.fromBlock &&
        e.fromPort === edge.fromPort &&
        e.toBlock === edge.toBlock &&
        e.toPort === edge.toPort
    );
    if (!exists) {
      this.internalEdges.push(edge);
      this.isDirty = true;
    }
  }

  /**
   * Remove an internal edge.
   */
  removeEdge(fromBlock: InternalBlockId, fromPort: string, toBlock: InternalBlockId, toPort: string): void {
    this.internalEdges = this.internalEdges.filter(
      e =>
        !(
          e.fromBlock === fromBlock &&
          e.fromPort === fromPort &&
          e.toBlock === toBlock &&
          e.toPort === toPort
        )
    );
    this.isDirty = true;
  }

  /**
   * Expose an internal input port.
   */
  exposeInputPort(
    internalBlockId: InternalBlockId,
    internalPortId: string,
    externalId: string
  ): void {
    // Check if already exposed
    const existing = this.exposedInputs.find(
      p => p.internalBlockId === internalBlockId && p.internalPortId === internalPortId
    );
    if (existing) {
      return;
    }
    this.exposedInputs.push({ externalId, internalBlockId, internalPortId });
    this.isDirty = true;
  }

  /**
   * Expose an internal output port.
   */
  exposeOutputPort(
    internalBlockId: InternalBlockId,
    internalPortId: string,
    externalId: string
  ): void {
    // Check if already exposed
    const existing = this.exposedOutputs.find(
      p => p.internalBlockId === internalBlockId && p.internalPortId === internalPortId
    );
    if (existing) {
      return;
    }
    this.exposedOutputs.push({ externalId, internalBlockId, internalPortId });
    this.isDirty = true;
  }

  /**
   * Unexpose an input port.
   */
  unexposeInputPort(internalBlockId: InternalBlockId, internalPortId: string): void {
    this.exposedInputs = this.exposedInputs.filter(
      p => !(p.internalBlockId === internalBlockId && p.internalPortId === internalPortId)
    );
    this.isDirty = true;
  }

  /**
   * Unexpose an output port.
   */
  unexposeOutputPort(internalBlockId: InternalBlockId, internalPortId: string): void {
    this.exposedOutputs = this.exposedOutputs.filter(
      p => !(p.internalBlockId === internalBlockId && p.internalPortId === internalPortId)
    );
    this.isDirty = true;
  }

  /**
   * Update the external ID of an exposed input port.
   */
  updateExposedInputId(
    internalBlockId: InternalBlockId,
    internalPortId: string,
    newExternalId: string
  ): void {
    const port = this.exposedInputs.find(
      p => p.internalBlockId === internalBlockId && p.internalPortId === internalPortId
    );
    if (port) {
      const index = this.exposedInputs.indexOf(port);
      this.exposedInputs[index] = { ...port, externalId: newExternalId };
      this.isDirty = true;
    }
  }

  /**
   * Update the external ID of an exposed output port.
   */
  updateExposedOutputId(
    internalBlockId: InternalBlockId,
    internalPortId: string,
    newExternalId: string
  ): void {
    const port = this.exposedOutputs.find(
      p => p.internalBlockId === internalBlockId && p.internalPortId === internalPortId
    );
    if (port) {
      const index = this.exposedOutputs.indexOf(port);
      this.exposedOutputs[index] = { ...port, externalId: newExternalId };
      this.isDirty = true;
    }
  }

  /**
   * Update composite metadata.
   */
  updateMetadata(meta: Partial<CompositeMetadata>): void {
    this.metadata = { ...this.metadata, ...meta };
    this.isDirty = true;
  }

  /**
   * Save the composite to the registry and persist to localStorage.
   * Returns the saved definition or null if validation failed.
   */
  save(): CompositeBlockDef | null {
    if (!this.canSave) {
      return null;
    }

    const def = this.buildCompositeDef();
    if (!def) {
      return null;
    }

    // If editing existing and name changed, unregister old first
    if (this.compositeId && this.compositeId !== this.metadata.name) {
      try {
        unregisterComposite(this.compositeId);
        compositeStorage.remove(this.compositeId);
      } catch {
        // Ignore if not registered
      }
    }

    try {
      // Register with registry (will validate and throw if invalid)
      registerComposite(def);

      // Persist to localStorage
      const json = compositeDefToJSON(def);
      if (!compositeStorage.add(json)) {
        console.warn('Failed to persist composite to localStorage (quota exceeded?)');
        // Continue anyway - composite is registered in memory
      }

      this.isDirty = false;
      this.compositeId = def.type;
      return def;
    } catch (err) {
      console.error('Failed to register composite:', err);
      return null;
    }
  }

  /**
   * Reset the editor to initial state.
   */
  reset(): void {
    this.compositeId = null;
    this.internalBlocks.clear();
    this.internalEdges = [];
    this.exposedInputs = [];
    this.exposedOutputs = [];
    this.metadata = {
      name: '',
      label: '',
      category: 'user',
      description: '',
    };
    this.isDirty = false;
    this.isFork = false;
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  /**
   * Build a CompositeBlockDef from current state.
   */
  private buildCompositeDef(): CompositeBlockDef | null {
    if (!this.metadata.name) {
      return null;
    }

    // Build internal blocks map
    const internalBlocksMap = new Map<InternalBlockId, InternalBlockDef>();
    for (const [id, block] of this.internalBlocks) {
      internalBlocksMap.set(id, {
        type: block.type,
        params: block.params,
        displayName: block.displayName,
      });
    }

    // Determine capability based on internal blocks
    // Priority: state > render > io > pure
    let capability: Capability = 'pure';
    for (const block of this.internalBlocks.values()) {
      const blockDef = getBlockDefinition(block.type);
      if (blockDef?.capability === 'state') {
        capability = 'state';
        break;
      }
      if (blockDef?.capability === 'render' && capability === 'pure') {
        capability = 'render';
      }
      if (blockDef?.capability === 'io' && capability === 'pure') {
        capability = 'io';
      }
    }

    return {
      type: this.metadata.name,
      form: 'composite',
      label: this.metadata.label || this.metadata.name,
      category: this.metadata.category || 'user',
      capability,
      internalBlocks: internalBlocksMap,
      internalEdges: [...this.internalEdges],
      exposedInputs: [...this.exposedInputs],
      exposedOutputs: [...this.exposedOutputs],
      inputs: {},
      outputs: {},
    };
  }
}
