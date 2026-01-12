# Unified Bindings Implementation Checklist (Quick Reference)

Use this as a “do the work in order” sheet while implementing `plans/PLAN-UNIFIED-BINDINGS.md`.

---

## A) Add new shared abstraction

- [ ] Create `src/editor/bindings/types.ts` with:
  - `BindingRef`, `BindingKind`, `EndpointRef`
  - `NormalizedBinding` (no optional fields)
  - `ResolvedEndpoint`, `ResolvedBinding`
- [ ] Create `src/editor/bindings/facade.ts` with:
  - `resolveBinding(root, ref)`
  - `getIncomingBindingForInputPort(root, blockId, slotId)`
  - `getOutgoingBindingsForOutputPort(root, blockId, slotId)`
  - `getPublishersForBus(root, busId)`
  - `getListenersForBus(root, busId)`
  - `isPortPublishingToBus(root, portRef, busId)`
  - `isPortSubscribedToBus(root, portRef, busId)`
- [ ] Create `src/editor/bindings/ops.ts` with:
  - `disconnectBinding(root, ref)`
  - `setBindingEnabled(root, ref, enabled)`
  - `setBindingLensStack(root, ref, lensStack)`
  - `setBindingAdapterChain(root, ref, adapterChain)`
- [ ] Expand `BusStore.updateListener()` to support `adapterChain` updates.

---

## B) Migrate UI consumers (highest ROI first)

- [ ] `src/editor/ConnectionInspector.tsx`: replace local resolution with `resolveBinding()`.
- [ ] `src/editor/Inspector.tsx`: port panel uses facade queries (no direct scans of publishers/listeners).
- [ ] `src/editor/PatchBay.tsx`: port decorations/tooltips use facade queries.

Optional:
- [ ] `src/editor/BusInspector.tsx`: publishers/listeners list via facade.
- [ ] `src/editor/BusPicker.tsx`: “already subscribed” and “compatible buses” via facade helpers.
- [ ] `src/editor/PublishMenu.tsx`: “already publishing” via facade helpers.

---

## C) Optional: unify preflight validation

- [ ] Add `Validator.canAddPublisher()` and `Validator.canAddListener()` to `src/editor/semantic/validator.ts`.
- [ ] Binding ops call these methods (warn-only, do not block).

---

## D) Optional: numeric UI semantics registry (no special cases)

- [ ] Create `src/editor/numeric/spec.ts` with a single registry keyed by:
  - SlotType (e.g. `Signal<phase>`, `Signal<Unit>`)
  - reserved bus names (e.g. `phaseA`, `progress`)
- [ ] `src/editor/BusViz.tsx`: uses numeric spec (not `domain === 'phase'` checks).
- [ ] `src/editor/BusInspector.tsx` default value editor: uses numeric spec.

---

## E) Manual verification (no tests)

Run:
- [ ] `just dev`

Verify in UI:
- [ ] Wire connect/disconnect works
- [ ] Publish to bus works
- [ ] Subscribe to bus works
- [ ] Input invariant holds (wire replaces listener and vice versa)
- [ ] Inspector shows the same bindings as PatchBay decorations
- [ ] ConnectionInspector opens for wire/publisher/listener and edits lens stack

