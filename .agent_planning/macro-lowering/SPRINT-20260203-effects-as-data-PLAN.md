# Sprint: effects-as-data - LowerEffects + Symbolic State Keys + Binding Pass
Generated: 2026-02-03
Confidence: HIGH: 4, MEDIUM: 2, LOW: 0
Status: PARTIALLY READY

## Sprint Goal
Migrate stateful block lowering from imperative side effects to declarative effects-as-data. Introduce symbolic state keys in IR (StableStateId replaces StateSlotId in expressions), define the LowerEffects return type, and build a post-lowering binding pass that resolves symbolic keys to physical slots.

## Scope
**Deliverables:**
1. LowerEffects type + updated LowerResult (two-result model)
2. Symbolic state keys in IR (StateReadExpr/StateWriteStep reference StableStateId, not StateSlotId)
3. Post-lowering binding pass (resolves StableStateId → StateSlotId, allocates output slots, registers steps)
4. Migrate all 6 stateful blocks to effects-as-data pattern
5. Migrate existing pure blocks (Add, HueRainbow, DefaultSource) to effects-as-data pattern

## Work Items

### WI-1 [HIGH]: Define LowerEffects type and update LowerResult

**Acceptance Criteria:**
- [ ] `LowerEffects` type defined with: `stateDecls`, `stepRequests`, `slotRequests`
- [ ] `StateDecl`: `{ key: StableStateId, initialValue: number, stride?: number, instanceId?: InstanceId, laneCount?: number }`
- [ ] `StepRequest`: discriminated union covering `stateWrite`, `fieldStateWrite`, `materialize`, `continuityMapBuild`, `continuityApply`
- [ ] `SlotRequest`: `{ portId: string, type: CanonicalType }`
- [ ] `LowerResult` updated: `outputsById` values use `ValueExprId` (not `ValueRefExpr` with optional slot) + `effects?: LowerEffects`
- [ ] Old `LowerResult` backward-compatible: blocks without `effects` still work (orchestrator detects and handles legacy path)
- [ ] Types live in `src/compiler/ir/lowerTypes.ts` (alongside existing ValueRefExpr)

**Technical Notes:**
- The two-result model: `exprOutputs: Record<string, ValueExprId>` + `effects?: LowerEffects`
- For backward compatibility during migration, keep `outputsById` as the field name but change the value type
- `StepRequest.stateWrite` references `StableStateId` (symbolic), not `StateSlotId` (physical)
- Pure blocks return `effects: { slotRequests: [...] }` — no state, no steps
- Stateful blocks return all three: stateDecls + stepRequests + slotRequests

### WI-2 [HIGH]: Make StateReadExpr use StableStateId (symbolic key)

**Acceptance Criteria:**
- [ ] `ValueExprStateRead` in `value-expr.ts` changed: field is `stateKey: StableStateId` (not `stateSlot: StateSlotId`)
- [ ] `IRBuilder.stateRead(key: StableStateId, type)` signature updated (takes StableStateId, not StateSlotId)
- [ ] IRBuilderImpl.stateRead() creates a `ValueExprStateRead` with `stateKey` field
- [ ] All callers of `stateRead()` updated to pass `StableStateId` instead of `StateSlotId`
- [ ] No expression rewriting needed — the IR natively holds symbolic keys

**Technical Notes:**
- `StableStateId` already exists as a branded string type (`"blockId:stateKind"`)
- Currently: `allocStateSlot(stableId) → slotId` then `stateRead(slotId, type) → exprId`
- After: `stateRead(stableId, type) → exprId` directly (no allocation during lowering)
- The binding pass (WI-4) maps `StableStateId → StateSlotId` for runtime dispatch

### WI-3 [HIGH]: Migrate all 6 stateful blocks to effects-as-data

**Acceptance Criteria:**
- [ ] Slew block returns `LowerEffects` with stateDecls + stepRequests + slotRequests
- [ ] Lag block returns `LowerEffects`
- [ ] Phasor block returns `LowerEffects`
- [ ] UnitDelay block returns `LowerEffects` (including lowerOutputsOnly phase)
- [ ] SampleHold block returns `LowerEffects`
- [ ] Accumulator block returns `LowerEffects`
- [ ] No block calls `allocStateSlot()`, `stepStateWrite()`, or `allocSlot()` directly
- [ ] All blocks use `stateRead(stableStateId, type)` (symbolic key, not slot)
- [ ] All existing tests pass unchanged

**Technical Notes:**
- Common pattern for all 6 blocks:
  ```
  Before: allocStateSlot(id) → stateRead(slot) → compute → stepStateWrite(slot, val) → allocSlot()
  After:  stateRead(id) → compute → return { exprOutputs, effects: { stateDecls: [{key: id, ...}], stepRequests: [{kind:'stateWrite', key: id, value: val}], slotRequests: [{portId:'out', type}] } }
  ```
- UnitDelay's `lowerOutputsOnly` also needs migration — it currently allocates state+output slots in phase 1
- UnitDelay phase 2 references `existingOutputs.stateSlot` — this becomes `existingOutputs.stateKey` (StableStateId)

### WI-4 [MEDIUM]: Build post-lowering binding pass

**Acceptance Criteria:**
- [ ] New pass function: `resolveEffects(blockResults: Map<BlockIndex, LowerResult>, builder: IRBuilder)`
- [ ] Pass collects all `StateDecl` from all blocks' effects → calls `allocStateSlot()` on builder → builds `StableStateId → StateSlotId` mapping
- [ ] Pass collects all `SlotRequest` → calls `allocTypedSlot()` → builds `portId → ValueSlot` mapping
- [ ] Pass collects all `StepRequest` → resolves symbolic `StableStateId` references to physical `StateSlotId` → calls `stepStateWrite()` etc.
- [ ] Pass handles slot registration (registerSlotType, registerSigSlot, registerFieldSlot) based on output type
- [ ] Pass handles instance context propagation
- [ ] Integrated into `lower-blocks.ts` orchestrator: called after all blocks have been lowered
- [ ] Existing inline slot-allocation code in orchestrator replaced by binding pass invocation

#### Unknowns to Resolve
- Exact integration point in lower-blocks.ts (the orchestrator currently interleaves lowering and slot registration per-block; binding pass needs all blocks lowered first, then processes effects in dependency order)
- How to handle SCC two-phase lowering: UnitDelay's lowerOutputsOnly needs state allocated before phase 2 of other blocks can reference outputs. Does the binding pass run per-SCC or globally?
- How the binding pass provides the `StableStateId → StateSlotId` mapping to the runtime (currently allocStateSlot auto-registers state mappings in IRBuilderImpl)

#### Exit Criteria
- All 6 stateful blocks compile through the binding pass
- Slot allocation code removed from orchestrator's per-block loop

### WI-5 [HIGH]: Migrate pure blocks to effects-as-data

**Acceptance Criteria:**
- [ ] Add block returns `{ exprOutputs: { out: exprId }, effects: { slotRequests: [{ portId: 'out', type }] } }`
- [ ] HueRainbow block returns effects-as-data (slotRequests only, no state)
- [ ] DefaultSource block returns effects-as-data
- [ ] Existing inline slot-allocation for pure blocks in orchestrator removed (handled by binding pass)
- [ ] All tests pass

**Technical Notes:**
- Simpler than stateful migration: just move `allocSlot()` to `slotRequests` in effects
- The current `slot: undefined` pattern in ValueRefExpr goes away — pure blocks return `ValueExprId` in exprOutputs, not `ValueRefExpr`

### WI-6 [MEDIUM]: Remove legacy imperative path from orchestrator

**Acceptance Criteria:**
- [ ] Orchestrator no longer calls `allocSlot()`/`allocTypedSlot()` on behalf of any block
- [ ] Orchestrator no longer calls `registerSlotType()`/`registerSigSlot()`/`registerFieldSlot()` per-block (binding pass does this)
- [ ] Orchestrator no longer checks `ref.slot === undefined` for pure block detection
- [ ] `ValueRefExpr.slot` is no longer optional (binding pass guarantees all slots are allocated)
- [ ] Dead code removed from orchestrator's per-block processing loop
- [ ] SCC two-phase path also uses binding pass

#### Unknowns to Resolve
- Can we remove the legacy path entirely in this sprint, or do some blocks (render blocks, instance-creating blocks like Array) need more work first?
- The SCC two-phase orchestration interleaves lowering and slot allocation in a specific order for cycle-breaking — need to verify the binding pass preserves this ordering

#### Exit Criteria
- No `allocSlot()` or `registerXxxSlot()` calls remain in lower-blocks.ts
- All tests pass, npm run typecheck clean

## Dependencies & Implementation Order

**Required order:**
1. **WI-1** (LowerEffects type) — prerequisite for everything
2. **WI-2** (Symbolic state keys in IR) — prerequisite for stateful block migration
3. **WI-3** (Migrate stateful blocks) — proves the pattern on the hardest cases
4. **WI-4** (Binding pass) — processes the effects from WI-3
5. **WI-5** (Migrate pure blocks) — easier, uses same binding pass
6. **WI-6** (Remove legacy path) — cleanup after all blocks migrated

**Note:** WI-3 and WI-4 are tightly coupled — blocks need the type from WI-1, but the binding pass needs to exist for the blocks to actually compile. Implement WI-3 and WI-4 together, with WI-4 as the "make it compile" step after WI-3 changes the block signatures.

## Risks

- **SCC two-phase interaction**: UnitDelay's lowerOutputsOnly needs state resolved before other blocks in the SCC can reference its outputs. The binding pass may need to run in two phases for SCCs: resolve state decls first, then resolve everything else. Mitigation: study the existing SCC orchestration carefully before implementing WI-4.
- **IRBuilder.stateRead() signature change**: Changing from `StateSlotId` to `StableStateId` is a breaking API change. All 6 callers need updating simultaneously. Mitigation: do WI-2 and WI-3 in one commit.
- **Runtime StateSlotId references**: The runtime (ScheduleExecutor, StateMigration) uses `StateSlotId` for state access. The binding pass must produce the same runtime structures (state mappings, state slots) that `allocStateSlot()` currently produces. Mitigation: verify binding pass output matches IRBuilderImpl.allocStateSlot() behavior.
- **Backward compatibility during migration**: If we can't migrate all blocks in one sprint, we need the orchestrator to handle both old-style (imperative) and new-style (effects) blocks. Mitigation: WI-1 makes effects optional on LowerResult; orchestrator detects and handles both paths until WI-6 removes the legacy path.
