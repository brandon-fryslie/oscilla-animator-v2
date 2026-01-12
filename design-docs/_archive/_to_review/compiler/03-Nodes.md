6) Nodes: the block/operator/state/render primitives

6.1 Node table

export interface NodeTable {
  nodes: NodeIR[];
  nodeIdToIndex: Record<NodeId, NodeIndex>;
}

export interface NodeIR {
  id: NodeId;
  index: NodeIndex;

  // stable categorization for tooling
  capability: "time" | "identity" | "state" | "render" | "io" | "pure";

  // operation executed by the VM
  op: OpCode;

  // Input wiring is expressed as slots after adapter/lens resolution.
  inputs: InputPortIR[];
  outputs: OutputPortIR[];

  // Compile-time constants (typed)
  consts?: ConstPoolRef;

  // Stateful storage owned by node (if any)
  state?: StateBindingIR[];

  // Debug metadata hook
  meta?: NodeMeta;
}

export interface InputPortIR {
  name: string;
  type: TypeDesc;

  // Source of this input:
  // - direct from another node output slot
  // - from a bus value slot
  // - from a constant
  // - from a default source
  src: InputSourceIR;

  // Optional post-source transform chain (adapters then lenses)
  transform?: TransformChainRef;
}

export interface OutputPortIR {
  name: string;
  type: TypeDesc;
  slot: ValueSlot;      // where runtime stores this output
}

6.2 Input sources

export type InputSourceIR =
  | { kind: "slot"; slot: ValueSlot }                // another output
  | { kind: "bus"; busIndex: BusIndex }              // read bus value slot (resolved)
  | { kind: "const"; constId: string }               // typed constant
  | { kind: "defaultSource"; defaultId: DefaultSourceId }
  | { kind: "external"; externalId: string }         // MIDI/OSC/etc, if present
  | { kind: "rail"; railId: string };

Rails are read-only InputSources for nodes. They reference the frame-latched RailStore, not the dependency graph.
No rail may appear as a graph edge in scheduling.

Hard rule: by runtime execution time, every input has a fully resolved InputSourceIR. No “look it up by name”.
