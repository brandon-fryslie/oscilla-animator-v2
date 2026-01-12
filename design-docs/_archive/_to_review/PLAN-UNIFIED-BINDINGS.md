# Plan: Unified Bindings (Wires + Bus Routing) Without Special Cases

**Audience:** A junior engineer with no prior context and no internet access.  
**Goal:** Implement immediately, safely, and incrementally.  

This plan unifies “block→block wires” and “block↔bus bindings” under one shared abstraction so we can reuse:
- inspectors (ConnectionInspector/Inspector port panel)
- lens + adapter UI and editing logic
- validation and compatibility checks
- connection metadata (enabled, adapterChain, lensStack, sortKey)
- future UI hints (e.g., numeric ranges) in one place

It does this **without** adding optional UI/metadata props to generic abstractions like `TypeDesc`, `Slot`, or `Bus`.

---

## 0) Glossary (read this first)

- **Port**: a connection point on a block instance (represented by `PortRef` in `src/editor/types.ts`).
- **Wire**: a block output → block input connection (`Connection` in `src/editor/types.ts`, stored in `PatchStore.connections`).
- **Publisher**: a block output → bus connection (`Publisher` in `src/editor/types.ts`, stored in `BusStore.publishers`).
- **Listener**: a bus → block input connection (`Listener` in `src/editor/types.ts`, stored in `BusStore.listeners`).
- **Binding** (new): the unified concept for any edge that carries values between endpoints.
- **Endpoint** (new): either a Port or a Bus.
- **Adapter chain**: discrete type conversions (`adapterChain?: AdapterStep[]`).
- **Lens stack**: parameterized transforms (array of `LensInstance`) applied per-binding.

---

## 1) Constraints (non‑negotiable)

### 1.1 Avoid “random special cases everywhere”
- All branching by “wire vs publisher vs listener” must live in **one module** (the new Binding Facade).
- UI components should consume a single normalized binding shape and not re‑implement scans against `patchStore.connections` / `busStore.publishers` / `busStore.listeners`.

### 1.2 No metadata on generic abstractions
- Do **not** add `uiHint`, `range`, `wrap`, `phase`, etc. to `TypeDesc`, `Slot`, `Bus`, or `Connection`.
- If we need numeric UI semantics, we add a dedicated registry module (see §9).

### 1.3 No renaming sweeps
- Do **not** rename `SlotType`, `PortRef`, `Connection`, `Publisher`, `Listener`, etc.
- This plan adds *new* types and functions without renaming existing ones.

### 1.4 Preserve the existing input writer invariant
The code already enforces:
- **An input port can only have one writer** (either a wire *or* a bus listener), and connecting one should disconnect the other.

Evidence in current code:
- `src/editor/stores/PatchStore.ts` → `disconnectInputPort()` is called from `connect()`.
- `src/editor/stores/BusStore.ts` → `addListener()` calls `root.patchStore.disconnectInputPort()`.

---

## 2) Current state evaluation (what exists today)

### 2.1 Data model today (already “almost unified”)
The editor already has three edge types with near‑identical metadata:

**Wire**
- Type: `Connection` (`src/editor/types.ts`)
- Store: `PatchStore.connections` (`src/editor/stores/PatchStore.ts`)
- Metadata: `enabled?`, `adapterChain?`, `lensStack?`

**Publisher**
- Type: `Publisher` (`src/editor/types.ts`)
- Store: `BusStore.publishers` (`src/editor/stores/BusStore.ts`)
- Metadata: `enabled`, `adapterChain?`, `lensStack?`, `sortKey`

**Listener**
- Type: `Listener` (`src/editor/types.ts`)
- Store: `BusStore.listeners` (`src/editor/stores/BusStore.ts`)
- Metadata: `enabled`, `adapterChain?`, `lensStack?`

### 2.2 There is already a unified semantic graph type (we should leverage it)
`src/editor/semantic/types.ts` defines:
- `GraphEdge = WireEdge | PublisherEdge | ListenerEdge`
- and `SemanticGraph` (`src/editor/semantic/graph.ts`) indexes wires, publishers, and listeners together.

This is a strong signal that the architecture wants a unified edge model.

### 2.3 Where duplication exists today (the pain)

UI scans and special-cases are repeated in many places:
- `src/editor/PatchBay.tsx`: computes `ConnectionInfo` by separately checking wires vs publishers/listeners.
- `src/editor/Inspector.tsx`: separately queries wire connections vs bus connections for a selected port.
- `src/editor/BusInspector.tsx`: has its own publisher/listener rendering and its own lens editing path.
- `src/editor/BusPicker.tsx` and `src/editor/PublishMenu.tsx`: duplicate bus compatibility logic and “already connected” checks.
- `src/editor/ConnectionInspector.tsx`: partially unified (already handles wire/publisher/listener), but still manually resolves each kind.

We want all these consumers to share:
- one resolver (“given a binding ref, show endpoints/type/lens/adapter”)
- one mutation API (“enable/disable/update lens stack / update adapter chain / delete”)
- one compatibility policy (“what can connect to what and how to suggest adapters”)

---

## 3) Target architecture (what we are building)

### 3.1 Define “Binding” once, in one module
Create a new module (folder) that becomes the **only** place that:
- branches on `wire|publisher|listener`
- normalizes shape (no optional metadata in consumer-facing types)
- implements “get bindings for port/bus”, “resolve binding”, and “mutate binding”

Recommended location:
- `src/editor/bindings/` (new folder)

### 3.2 “Binding Facade” responsibilities

**Read side**
- Convert store state → normalized binding objects.
- Resolve endpoints → block label, slot label/type, bus name/type.
- Provide stable `BindingRef` identity: `{ kind, id }`.
- Provide helpers for the UI:
  - “what is connected here?”
  - “show list of bindings on this bus”
  - “is this port already publishing/subscribed?”

**Write side**
- One unified API to:
  - connect wire
  - add publisher
  - add listener (and enforce single-writer inputs)
  - disconnect any binding kind
  - update enabled/adapters/lenses for any binding kind

**Validation/compatibility**
- Centralize “can these endpoints connect?” and “if not, can we suggest adapters?”
- Use the semantic kernel (`src/editor/semantic`) and adapter logic (`src/editor/adapters/autoAdapter.ts`) rather than UI-specific heuristics.

---

## 4) The minimal new types (do not touch existing types)

Add these in `src/editor/bindings/types.ts`.

```ts
import type { PortRef, TypeDesc, AdapterStep, LensInstance, Connection, Publisher, Listener, Bus, Block, Slot } from '../types';

export type BindingKind = 'wire' | 'publisher' | 'listener';

export type BindingRef =
  | { kind: 'wire'; id: string }
  | { kind: 'publisher'; id: string }
  | { kind: 'listener'; id: string };

export type EndpointRef =
  | { kind: 'port'; port: PortRef }
  | { kind: 'bus'; busId: string };

// Consumer-facing binding shapes: NO OPTIONALS.
export type NormalizedBinding =
  | {
      kind: 'wire';
      id: string;
      from: { kind: 'port'; port: PortRef };
      to: { kind: 'port'; port: PortRef };
      enabled: boolean;
      adapterChain: AdapterStep[];
      lensStack: LensInstance[];
    }
  | {
      kind: 'publisher';
      id: string;
      from: { kind: 'port'; port: PortRef };
      to: { kind: 'bus'; busId: string };
      enabled: boolean;
      sortKey: number;
      adapterChain: AdapterStep[];
      lensStack: LensInstance[];
    }
  | {
      kind: 'listener';
      id: string;
      from: { kind: 'bus'; busId: string };
      to: { kind: 'port'; port: PortRef };
      enabled: boolean;
      adapterChain: AdapterStep[];
      lensStack: LensInstance[];
    };

export type ResolvedPortEndpoint = Readonly<{
  kind: 'port';
  port: PortRef;
  block: Block;
  slot: Slot;
  typeDesc: TypeDesc;
}>;

export type ResolvedBusEndpoint = Readonly<{
  kind: 'bus';
  busId: string;
  bus: Bus;
  typeDesc: TypeDesc;
}>;

export type ResolvedEndpoint = ResolvedPortEndpoint | ResolvedBusEndpoint;

export type ResolvedBinding =
  | { binding: NormalizedBinding; from: ResolvedEndpoint; to: ResolvedEndpoint }
  | { error: string; ref: BindingRef };
```

Notes:
- The *normalized* binding has **no optional fields**. If a store object has `lensStack?: undefined`, normalize to `[]`.
- For wire `enabled?: boolean` (optional today), normalize missing to `true`.

---

## 5) Binding Facade: read APIs (what UI should call)

Add these in `src/editor/bindings/facade.ts` (or split into `read.ts` + `write.ts`).

### 5.1 Resolve one binding
```ts
resolveBinding(root: RootStore, ref: BindingRef): ResolvedBinding
```
Implementation outline:
- `switch (ref.kind)`:
  - wire: find in `root.patchStore.connections`
  - publisher: find in `root.busStore.publishers`
  - listener: find in `root.busStore.listeners`
- Convert to `NormalizedBinding` (fill defaults)
- Resolve endpoints:
  - port: find block in `root.patchStore.blocks`, then slot in inputs/outputs
  - bus: find in `root.busStore.buses`
- Derive `TypeDesc`:
  - for port: from `SLOT_TYPE_TO_TYPE_DESC[slot.type]`
  - for bus: `bus.type`

### 5.2 Query bindings for a port (input or output)
```ts
getIncomingBindingForInputPort(root, blockId, slotId): NormalizedBinding | null
getOutgoingBindingsForOutputPort(root, blockId, slotId): NormalizedBinding[]
```
Rules:
- For an input, return at most one (wire OR listener), because of the invariant.
- For an output, it can have multiple wires and multiple publishers.

### 5.3 Query bindings for a bus
```ts
getPublishersForBus(root, busId): NormalizedBinding[] // publisher only
getListenersForBus(root, busId): NormalizedBinding[]  // listener only
getBindingsForBus(root, busId): NormalizedBinding[]   // both lists concatenated, optionally sorted
```

### 5.4 Shared helpers to remove duplication
These replace ad-hoc scans throughout the UI:
- `isPortPublishingToBus(root, portRef, busId): boolean`
- `isPortSubscribedToBus(root, portRef, busId): boolean`
- `getBusDisplayName(root, busId): string` (bus.name fallback to busId)
- `getBlockDisplayName(root, blockId): string` (block.label fallback)

---

## 6) Binding Facade: write APIs (what mutations should use)

Add these in `src/editor/bindings/ops.ts`.

### 6.1 Single unified “disconnect”
```ts
disconnectBinding(root, ref: BindingRef): void
```
Implementation:
- `wire` → `root.patchStore.disconnect(id)`
- `publisher` → `root.busStore.removePublisher(id)`
- `listener` → `root.busStore.removeListener(id)`

### 6.2 Unified “set enabled”
```ts
setBindingEnabled(root, ref: BindingRef, enabled: boolean): void
```
Implementation:
- `wire` → `root.patchStore.updateConnection(id, { enabled })`
- `publisher` → `root.busStore.updatePublisher(id, { enabled })`
- `listener` → `root.busStore.updateListener(id, { enabled })`

### 6.3 Unified lens stack update
```ts
setBindingLensStack(root, ref: BindingRef, lensStack: LensInstance[]): void
```
Implementation:
- wire → patchStore.updateConnection
- publisher → busStore.updatePublisher
- listener → busStore.updateListener

### 6.4 Unified adapter chain update
```ts
setBindingAdapterChain(root, ref: BindingRef, adapterChain: AdapterStep[]): void
```
Implementation:
- wire → patchStore.updateConnection
- publisher → busStore.updatePublisher
- listener → busStore.updateListener (note: ListenerUpdate currently omits adapterChain; update it to include adapterChain)

**Important:** `BusStore.updateListener()` currently only allows `enabled | lensStack`.  
To unify this, expand it to accept `adapterChain` too (it already exists on `Listener` type).

### 6.5 Unified connect operations (optional in Phase 1)
If you want maximum reuse, add:
- `connectWire(root, fromPortRef, toPortRef)`
- `publishToBus(root, fromPortRef, busId)`
- `subscribeFromBus(root, busId, toPortRef)`

These are thin wrappers around:
- `root.patchStore.connect()`
- `root.busStore.addPublisher()`
- `root.busStore.addListener()` (which already enforces single-writer input)

---

## 7) Refactor plan: migrate UI to the facade (in small, safe steps)

This is the core of “stop re-writing the same code slightly differently”.

### Step 7.1 Add the facade + keep it unused
Deliverables:
- `src/editor/bindings/types.ts`
- `src/editor/bindings/facade.ts`
- `src/editor/bindings/ops.ts`

Sanity checks (manual):
- Build succeeds.
- You can import and call facade functions from a scratch file without runtime crash.

### Step 7.2 Refactor `ConnectionInspector.tsx` to resolve via facade
Current file: `src/editor/ConnectionInspector.tsx`

Goal:
- Replace local `ResolvedConnection` resolution logic with `resolveBinding()`.
- Keep the UI components largely intact at first (don’t redesign; just change data source).

Why first:
- It already understands wire/publisher/listener; migration risk is low.
- It immediately removes duplication for endpoint resolution and metadata normalization.

### Step 7.3 Refactor `Inspector.tsx` port panel to use facade queries
Current file: `src/editor/Inspector.tsx`

Replace:
- `getConnectionsForPort(...)` + `busConnections` useMemo

With:
- `getIncomingBindingForInputPort` / `getOutgoingBindingsForOutputPort`
- `isPortPublishingToBus` / `isPortSubscribedToBus` where needed

Goal:
- The port panel renders “bindings” without knowing whether they are wires or bus edges.
- Clicking a row selects the connection via `uiStore.selectConnection(kind,id)` (already supported).

### Step 7.4 Refactor `PatchBay.tsx` port connection decorations
Current file: `src/editor/PatchBay.tsx`

Replace:
- The `getConnectionInfo()` function that separately checks `connections`, `publishers`, `listeners`.

With:
- A single facade call:
  - for input ports: `getIncomingBindingForInputPort(...)`
  - for output ports: `getOutgoingBindingsForOutputPort(...)` (count, plus optional “first destination” label for tooltips)

Output UI behavior to preserve:
- “connected vs disconnected” glyph and colorization
- tooltip showing what it’s connected to

### Step 7.5 Refactor `BusInspector.tsx` to list bindings via facade
Current file: `src/editor/BusInspector.tsx`

Replace:
- Direct mapping of `Publisher[]` and `Listener[]`

With:
- `getPublishersForBus()` / `getListenersForBus()`
- Use a shared “BindingListItem” component that works for both publishers and listeners.

Outcome:
- 1 implementation of the “show binding row + enable toggle + jump to block” pattern.

### Step 7.6 Refactor `BusPicker.tsx` and `PublishMenu.tsx` (optional today)
Current files:
- `src/editor/BusPicker.tsx`
- `src/editor/PublishMenu.tsx`

These can be left as-is for “today” if time is tight, but the payoff is real:
- Both duplicate “compatible buses”, “already connected”, “create bus”, “connect” logic.

Plan:
- Replace their internal “already publishing/subscribed” checks with facade helpers.
- Replace add/remove calls with `bindings/ops.ts` wrappers.

---

## 8) Validation + compatibility: unify policy (so UI and compiler agree)

### 8.1 Stop inventing compatibility in UI
Use existing canonical utilities:
- `src/editor/semantic/index.ts` for assignability rules
- `src/editor/adapters/autoAdapter.ts` for adapter chains (convertible paths)

### 8.2 Add missing preflight validation for bus edges (recommended)
`Validator.canAddConnection(...)` exists, but there’s no `canAddPublisher` / `canAddListener`.

Add:
- `Validator.canAddPublisher(patchDoc, fromPortRef, busId)`
- `Validator.canAddListener(patchDoc, busId, toPortRef)`

At minimum these should check:
- endpoints exist
- type compatibility (direct or convertible)
- single-writer invariant for listeners (input has no other listener/wire) — or return a “will replace” warning

Use mode:
- warn-only preflight like `PatchStore.connect()` currently does (don’t block UI; compiler is ultimate authority).

---

## 9) UI hints / numeric semantics (keep it separate, centralized)

This is the direct answer to “avoid proliferation of special-case numeric logic”.

Reference problem statement:
- `plans/PROBLEM-STATEMENT-NUMERIC-RANGE-METADATA.md`

Implement a dedicated registry module:
- `src/editor/numeric/spec.ts` (or `src/editor/hints/numeric.ts`)

Rules:
- Do not put range/wrap metadata on `TypeDesc`.
- Do not rely on `TypeDesc.semantics` string parsing in UI.

Recommended keying strategy:
- By **SlotType** for ports (e.g. `Signal<phase>`, `Signal<Unit>`)
- By **reserved bus name** for canonical buses (e.g. `phaseA`, `progress`)

The Binding Facade can expose:
- `getNumericSpecForEndpoint(resolvedEndpoint): NumericSpec | null`

Then update UI consumers:
- `src/editor/BusViz.tsx` (stop switching on `domain === 'phase'` etc; use numeric spec)
- `src/editor/BusInspector.tsx` default value editor (use numeric spec)
- Default source editors can also reuse it later

---

## 10) Manual verification checklist (Chrome DevTools MCP, not tests)

Commands (run via `just`):
- `just dev`

In the UI, verify:

### 10.1 Wires still work
- Add two blocks, connect output → input, confirm a wire appears.
- Click the wire in UI (or via inspector list) and confirm `ConnectionInspector` opens.
- Toggle enabled and confirm it visually changes (and compiler/runtime responds if implemented).

### 10.2 Bus bindings still work
- Publish an output to an existing bus (via PublishMenu).
- Subscribe an input to a bus (via BusPicker).
- Confirm input writer invariant:
  - subscribe input to a bus, then wire something into that input → listener should be removed
  - wire into input, then subscribe to a bus → wire should be removed

### 10.3 Inspector consistency
- Select a port; Inspector shows bindings using the new unified rows.
- Click a row; selection jumps to the correct connection kind (wire/publisher/listener).

### 10.4 PatchBay decorations consistent
- Ports show correct “connected” state.
- No mismatch between a port’s displayed state and the Inspector list.

### 10.5 BusInspector consistency
- Select a bus; publishers and listeners are listed.
- Toggle enabled works.
- Jump-to-block works.

---

## 11) Acceptance criteria (definition of done)

### Required
- A new Binding Facade exists and is the only place that branches on wire/publisher/listener.
- `ConnectionInspector.tsx`, `Inspector.tsx`, and `PatchBay.tsx` no longer do manual tri-scans of connections/publishers/listeners.
- Input writer invariant is preserved everywhere.
- No new UI/semantic metadata is added to `TypeDesc`, `Slot`, or `Bus`.

### Nice-to-have (if time permits today)
- `BusInspector.tsx`, `BusPicker.tsx`, `PublishMenu.tsx` also migrated.
- Validator gains preflight methods for publisher/listener.
- Numeric UI semantics registry implemented and adopted by BusViz + BusInspector.

---

## 12) Suggested implementation order (single day execution)

1. Add binding types + facade read APIs (no UI changes yet).
2. Add binding ops (disconnect, enabled, lens, adapters).
3. Migrate `ConnectionInspector.tsx` to facade resolver.
4. Migrate `Inspector.tsx` port panel.
5. Migrate `PatchBay.tsx` decorations/tooltips.
6. (Optional) Migrate `BusInspector.tsx`.
7. (Optional) Add `Validator.canAddPublisher/canAddListener`.
8. (Optional) Add numeric registry and migrate BusViz/BusInspector default editor.
9. Manual verification via UI/DevTools.

