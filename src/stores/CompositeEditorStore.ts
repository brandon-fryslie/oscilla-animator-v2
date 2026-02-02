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
  getAnyBlockDefinition,
  validateCompositeDefinition,
} from '../blocks/registry';
import type { Capability, InputDef, OutputDef } from '../blocks/registry';
import { compositeStorage } from '../blocks/composites/persistence';
import { compositeDefToJSON } from '../blocks/composites/loader';
import {
  serializeCompositeToHCL,
  deserializeCompositeFromHCL,
  type PatchDslError,
} from '../patch-dsl';

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
      fromHCL: action,
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
      const blockDef = getAnyBlockDefinition(block.type);
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
      const blockDef = getAnyBlockDefinition(block.type);
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
      console.warn(`Composite "${compositeType}" not found in registry`);
      return;
    }

    this.reset();

    // Set fork mode if readonly
    if (def.readonly) {
      this.isFork = true;
      const autoName = CompositeEditorStore.generateUniqueName(def.type);
      this.metadata = {
        name: autoName,
        label: `${def.label} (Copy)`,
        category: def.category,
        description: def.description,
      };
    } else {
      this.compositeId = def.type;
      this.metadata = {
        name: def.type,
        label: def.label,
        category: def.category,
        description: def.description,
      };
    }

    // Load internal blocks
    for (const [blockId, blockDef] of def.internalBlocks) {
      this.internalBlocks.set(blockId, {
        id: blockId,
        type: blockDef.type,
        position: { x: 0, y: 0 },  // Position not stored in def
        params: blockDef.params,
        displayName: blockDef.displayName,
      });
    }

    // Load internal edges
    this.internalEdges = [...def.internalEdges];

    // Load exposed ports
    this.exposedInputs = [...def.exposedInputs];
    this.exposedOutputs = [...def.exposedOutputs];

    this.isOpen = true;
    this.isDirty = false;
  }

  /**
   * Close the editor without saving.
   */
  close(): void {
    if (this.isDirty) {
      // In a real app, would show confirmation dialog
      console.warn('Closing editor with unsaved changes');
    }
    this.isOpen = false;
  }

  /**
   * Add a new internal block.
   */
  addBlock(type: string, position: { x: number; y: number }): InternalBlockId {
    // Generate unique internal block ID
    const blockDef = getAnyBlockDefinition(type);
    const baseName = blockDef?.label || type;
    let counter = 1;
    let id = internalBlockId(baseName);

    while (this.internalBlocks.has(id)) {
      counter++;
      id = internalBlockId(`${baseName}${counter}`);
    }

    this.internalBlocks.set(id, {
      id,
      type,
      position,
      displayName: id as string,
    });

    this.isDirty = true;
    return id;
  }

  /**
   * Remove an internal block.
   * Also removes any edges connected to it and unexposes any ports.
   */
  removeBlock(blockId: InternalBlockId): void {
    // Remove block
    this.internalBlocks.delete(blockId);

    // Remove connected edges
    this.internalEdges = this.internalEdges.filter(
      edge => edge.fromBlock !== blockId && edge.toBlock !== blockId
    );

    // Unexpose ports
    this.exposedInputs = this.exposedInputs.filter(exp => exp.internalBlockId !== blockId);
    this.exposedOutputs = this.exposedOutputs.filter(exp => exp.internalBlockId !== blockId);

    this.isDirty = true;
  }

  /**
   * Update internal block position.
   */
  updateBlockPosition(blockId: InternalBlockId, position: { x: number; y: number }): void {
    const block = this.internalBlocks.get(blockId);
    if (!block) return;

    this.internalBlocks.set(blockId, { ...block, position });
    this.isDirty = true;
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
  removeEdge(edge: InternalEdge): void {
    this.internalEdges = this.internalEdges.filter(
      e =>
        !(
          e.fromBlock === edge.fromBlock &&
          e.fromPort === edge.fromPort &&
          e.toBlock === edge.toBlock &&
          e.toPort === edge.toPort
        )
    );
    this.isDirty = true;
  }

  /**
   * Expose an input port.
   */
  exposeInputPort(
    externalId: string,
    internalBlockId: InternalBlockId,
    internalPortId: string,
    externalLabel?: string
  ): void {
    // Check if already exposed
    const exists = this.exposedInputs.some(
      exp => exp.internalBlockId === internalBlockId && exp.internalPortId === internalPortId
    );

    if (!exists) {
      this.exposedInputs.push({
        externalId,
        externalLabel,
        internalBlockId,
        internalPortId,
      });
      this.isDirty = true;
    }
  }

  /**
   * Expose an output port.
   */
  exposeOutputPort(
    externalId: string,
    internalBlockId: InternalBlockId,
    internalPortId: string,
    externalLabel?: string
  ): void {
    // Check if already exposed
    const exists = this.exposedOutputs.some(
      exp => exp.internalBlockId === internalBlockId && exp.internalPortId === internalPortId
    );

    if (!exists) {
      this.exposedOutputs.push({
        externalId,
        externalLabel,
        internalBlockId,
        internalPortId,
      });
      this.isDirty = true;
    }
  }

  /**
   * Unexpose an input port.
   */
  unexposeInputPort(internalBlockId: InternalBlockId, internalPortId: string): void {
    this.exposedInputs = this.exposedInputs.filter(
      exp => !(exp.internalBlockId === internalBlockId && exp.internalPortId === internalPortId)
    );
    this.isDirty = true;
  }

  /**
   * Unexpose an output port.
   */
  unexposeOutputPort(internalBlockId: InternalBlockId, internalPortId: string): void {
    this.exposedOutputs = this.exposedOutputs.filter(
      exp => !(exp.internalBlockId === internalBlockId && exp.internalPortId === internalPortId)
    );
    this.isDirty = true;
  }

  /**
   * Update an exposed input port's external ID.
   */
  updateExposedInputId(
    internalBlockId: InternalBlockId,
    internalPortId: string,
    newExternalId: string
  ): void {
    const index = this.exposedInputs.findIndex(
      exp => exp.internalBlockId === internalBlockId && exp.internalPortId === internalPortId
    );
    if (index >= 0) {
      this.exposedInputs[index] = {
        ...this.exposedInputs[index],
        externalId: newExternalId,
      };
      this.isDirty = true;
    }
  }

  /**
   * Update an exposed output port's external ID.
   */
  updateExposedOutputId(
    internalBlockId: InternalBlockId,
    internalPortId: string,
    newExternalId: string
  ): void {
    const index = this.exposedOutputs.findIndex(
      exp => exp.internalBlockId === internalBlockId && exp.internalPortId === internalPortId
    );
    if (index >= 0) {
      this.exposedOutputs[index] = {
        ...this.exposedOutputs[index],
        externalId: newExternalId,
      };
      this.isDirty = true;
    }
  }

  /**
   * Update composite metadata.
   */
  updateMetadata(metadata: Partial<CompositeMetadata>): void {
    this.metadata = { ...this.metadata, ...metadata };
    this.isDirty = true;
  }

  /**
   * Save the current composite.
   * Registers with block registry and persists to localStorage.
   * Returns the saved CompositeBlockDef, or null if validation fails.
   */
  save(): CompositeBlockDef | null {
    if (!this.canSave) {
      console.warn('Cannot save composite with validation errors:', this.validationErrors);
      return null;
    }

    const def = this.buildCompositeDef();
    if (!def) {
      console.error('Failed to build composite definition');
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

  /**
   * Serialize current state to HCL text.
   *
   * @returns HCL text representation of the composite, or null if validation fails
   */
  toHCL(): string | null {
    const def = this.buildCompositeDef();
    if (!def) {
      return null;
    }
    return serializeCompositeToHCL(def);
  }

  /**
   * Load composite from HCL text into editor state.
   * On error, editor state is unchanged.
   *
   * @param hcl - HCL text to deserialize
   * @returns Errors array (empty if successful)
   */
  fromHCL(hcl: string): { errors: PatchDslError[] } {
    const result = deserializeCompositeFromHCL(hcl);

    if (result.errors.length > 0 || !result.def) {
      return { errors: result.errors };
    }

    // Load def into store state
    this.reset();

    this.metadata = {
      name: result.def.type,
      label: result.def.label,
      category: result.def.category,
      description: result.def.description,
    };

    // Load internal blocks (assign default positions since they're not in HCL)
    let x = 100;
    let y = 100;
    for (const [blockId, blockDef] of result.def.internalBlocks) {
      this.internalBlocks.set(blockId, {
        id: blockId,
        type: blockDef.type,
        position: { x, y },
        params: blockDef.params,
        displayName: blockDef.displayName,
      });
      x += 200;
      if (x > 800) {
        x = 100;
        y += 150;
      }
    }

    // Load internal edges
    this.internalEdges = [...result.def.internalEdges];

    // Load exposed ports
    this.exposedInputs = [...result.def.exposedInputs];
    this.exposedOutputs = [...result.def.exposedOutputs];

    this.isDirty = true;
    return { errors: [] };
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
      const blockDef = getAnyBlockDefinition(block.type);
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

    const exposedInputs = [...this.exposedInputs];
    const exposedOutputs = [...this.exposedOutputs];

    // Compute inputs from exposed input ports by looking up internal block definitions
    const inputs: Record<string, InputDef> = {};
    for (const exposed of exposedInputs) {
      const internalBlock = internalBlocksMap.get(exposed.internalBlockId);
      if (!internalBlock) continue;
      const internalBlockDef = getAnyBlockDefinition(internalBlock.type);
      if (!internalBlockDef) continue;
      const internalInputDef = internalBlockDef.inputs[exposed.internalPortId];
      if (!internalInputDef) continue;
      inputs[exposed.externalId] = {
        label: exposed.externalLabel ?? internalInputDef.label ?? exposed.externalId,
        type: exposed.type
          ? { payload: exposed.type.payload, unit: exposed.type.unit, extent: exposed.type.extent }
          : internalInputDef.type,
        defaultSource: exposed.defaultSource ?? internalInputDef.defaultSource,
        uiHint: exposed.uiHint ?? internalInputDef.uiHint,
      };
    }

    // Compute outputs from exposed output ports
    const outputs: Record<string, OutputDef> = {};
    for (const exposed of exposedOutputs) {
      const internalBlock = internalBlocksMap.get(exposed.internalBlockId);
      if (!internalBlock) continue;
      const internalBlockDef = getAnyBlockDefinition(internalBlock.type);
      if (!internalBlockDef) continue;
      const internalOutputDef = internalBlockDef.outputs[exposed.internalPortId];
      if (!internalOutputDef) continue;
      outputs[exposed.externalId] = {
        label: exposed.externalLabel ?? internalOutputDef.label ?? exposed.externalId,
        type: internalOutputDef.type,
      };
    }

    return {
      type: this.metadata.name,
      form: 'composite',
      label: this.metadata.label || this.metadata.name,
      category: this.metadata.category || 'user',
      capability,
      internalBlocks: internalBlocksMap,
      internalEdges: [...this.internalEdges],
      exposedInputs,
      exposedOutputs,
      inputs,
      outputs,
    };
  }
}
