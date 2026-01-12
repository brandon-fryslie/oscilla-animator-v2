
7) Buses: publishing, combining, and subscription

7.1 Bus table

export interface BusTable {
  buses: BusIR[];
  busIdToIndex: Record<BusId, BusIndex>;
}

export interface BusIR {
  id: BusId;
  index: BusIndex;

  name: string;
  type: TypeDesc;

  combine: CombineSpec;
  silentValue: SilentValueSpec;     // the empty bus value (independent of combine)

  // Deterministic ordering: publishers sorted by sortKey, tie-broken by publisherId
  publishers: PublisherIR[];
  listeners: ListenerIR[];          // optional; compile may also inline listener reads as node inputs

  // bus value storage slot (single slot per bus)
  slot: ValueSlot;

  // Debug/meta
  meta?: BusMeta;
}

export type CombineSpec =
  | { mode: "last" }
  | { mode: "sum" }
  | { mode: "average" }
  | { mode: "min" }
  | { mode: "max" }
  | { mode: "layer"; params?: Record<string, unknown> }; // e.g. compositing for colors/renders

export type SilentValueSpec =
  | { kind: "const"; constId: string }
  | { kind: "typedZero"; type: TypeDesc }; // for domains where zero is well-defined

7.2 Publishers / listeners

export interface PublisherIR {
  id: string;
  enabled: boolean;
  sortKey: number;

  // Source of published value
  from: { nodeIndex: NodeIndex; outPort: PortIndex; slot: ValueSlot };

  // Optional transform chain applied BEFORE combining into bus
  transform?: TransformChainRef;

  // Debug/provenance
  label?: string;
}

export interface ListenerIR {
  id: string;
  enabled: boolean;

  // Listener is primarily metadata; actual reads should be compiled into node.inputs as {kind:"bus"}.
  to: { nodeIndex: NodeIndex; inPort: PortIndex };
  transform?: TransformChainRef;
}

Important: listeners should not be runtime “active things.” They’re used at compile time to resolve node inputs and for UX/debugging. Runtime only needs bus evaluation + node input reads.