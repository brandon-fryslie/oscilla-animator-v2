/**
 * Fluent builder for CompositeBlockDef.
 *
 * Turns 100+ lines of Map/array boilerplate into ~15 lines:
 *
 *   composite('SmoothNoise', 'Smooth Noise')
 *     .desc('Noise filtered through Lag')
 *     .capability('state')
 *     .block('noise', 'Noise')
 *     .block('lag', 'Lag', { smoothing: 0.9 })
 *     .connect('noise.out', 'lag.target')
 *     .in('x', 'noise.x')
 *     .in('smoothing', 'lag.smoothing')
 *     .out('out', 'lag.out')
 *     .build()
 */

import type { CompositeBlockDef, InternalBlockId, ExposedInputPort, ExposedOutputPort, InternalEdge } from '../composite-types';
import { internalBlockId } from '../composite-types';
import { getAnyBlockDefinition, type Capability, type InputDef, type OutputDef } from '../registry';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse "blockId.portId" into [InternalBlockId, portId] */
function parseRef(ref: string): [InternalBlockId, string] {
  const dot = ref.indexOf('.');
  if (dot === -1) throw new Error(`Invalid port reference "${ref}" — expected "blockId.portId"`);
  return [internalBlockId(ref.slice(0, dot)), ref.slice(dot + 1)];
}

/** Title-case a camelCase id: "smoothNoise" → "Smooth Noise" */
function titleCase(id: string): string {
  return id
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

class CompositeBuilder {
  private readonly _type: string;
  private readonly _label: string;
  private _category = 'composite';
  private _capability: Capability = 'pure';
  private _description?: string;
  private _readonly = true;

  private readonly _blocks = new Map<InternalBlockId, { type: string; displayName?: string; params?: Record<string, unknown> }>();
  private readonly _edges: InternalEdge[] = [];
  private readonly _inputs: ExposedInputPort[] = [];
  private readonly _outputs: ExposedOutputPort[] = [];

  constructor(type: string, label?: string) {
    this._type = type;
    this._label = label ?? titleCase(type);
  }

  desc(description: string): this {
    this._description = description;
    return this;
  }

  category(cat: string): this {
    this._category = cat;
    return this;
  }

  capability(cap: Capability): this {
    this._capability = cap;
    return this;
  }

  /** Mark as user-editable (library composites are readonly by default). */
  editable(): this {
    this._readonly = false;
    return this;
  }

  /** Add an internal block. Params are optional. */
  block(id: string, type: string, params?: Record<string, unknown>): this {
    const bid = internalBlockId(id);
    if (this._blocks.has(bid)) throw new Error(`Duplicate internal block id "${id}"`);
    this._blocks.set(bid, { type, params: params ?? undefined });
    return this;
  }

  /** Connect an internal output to an internal input: "a.out" → "b.in" */
  connect(from: string, to: string): this {
    const [fromBlock, fromPort] = parseRef(from);
    const [toBlock, toPort] = parseRef(to);
    this._edges.push({ fromBlock, fromPort, toBlock, toPort });
    return this;
  }

  /** Expose an internal input port. Label defaults to title-cased externalId. */
  in(externalId: string, ref: string, label?: string): this {
    const [blockId, portId] = parseRef(ref);
    this._inputs.push({
      externalId,
      internalBlockId: blockId,
      internalPortId: portId,
      externalLabel: label ?? titleCase(externalId),
    });
    return this;
  }

  /** Expose an internal output port. Label defaults to title-cased externalId. */
  out(externalId: string, ref: string, label?: string): this {
    const [blockId, portId] = parseRef(ref);
    this._outputs.push({
      externalId,
      internalBlockId: blockId,
      internalPortId: portId,
      externalLabel: label ?? titleCase(externalId),
    });
    return this;
  }

  build(): CompositeBlockDef {
    if (this._blocks.size === 0) throw new Error(`Composite "${this._type}" has no internal blocks`);
    if (this._outputs.length === 0) throw new Error(`Composite "${this._type}" has no exposed outputs`);

    const internalBlocks = new Map(this._blocks) as ReadonlyMap<InternalBlockId, { type: string; displayName?: string; params?: Record<string, unknown> }>;
    const exposedInputs = [...this._inputs];
    const exposedOutputs = [...this._outputs];

    // Compute inputs from exposed input ports
    const inputs: Record<string, InputDef> = {};
    for (const exposed of exposedInputs) {
      const internalBlock = internalBlocks.get(exposed.internalBlockId);
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
      const internalBlock = internalBlocks.get(exposed.internalBlockId);
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
      type: this._type,
      form: 'composite',
      label: this._label,
      category: this._category,
      capability: this._capability,
      description: this._description,
      readonly: this._readonly,
      internalBlocks,
      internalEdges: [...this._edges],
      exposedInputs,
      exposedOutputs,
      inputs,
      outputs,
    };
  }
}

/** Create a composite block definition. */
export function composite(type: string, label?: string): CompositeBuilder {
  return new CompositeBuilder(type, label);
}
