# P0-1: SoA Mandate - Memory Layout Refactor - TO-REVIEW Items

## Item 1: AoS Packing Option Still Exists
**Spec says**: "Default packing preference is SoA" (section 2.2.4). "Canonical packing is SoA (`packing: 'soa'`) for slot descriptors" (section 1.2.1).
**Implementation**: `src/runtime/ArenaValueStore.ts:8` defines `ArenaPacking = 'aos' | 'soa'`. The `ArenaSlotDescriptor` at line 33 has `packing?: ArenaPacking` as optional. `src/compiler/ir/storage-class.ts:93` defaults to `'soa'` but callers can request `'aos'` via `packingPreference` parameter.
**Gap**: While SoA is the default, AoS packing remains available as a caller option. The spec says SoA is "canonical" but doesn't strictly prohibit AoS as an option. The `ArenaSlotDescriptor.componentOffsets` field at line 26-29 is documented as "Back-compat component-channel offsets... Used by legacy SoA-style test descriptors." The presence of AoS as a selectable packing mode and legacy componentOffsets warrants review for whether these are needed or should be pruned.
**Classification**: TO-REVIEW
