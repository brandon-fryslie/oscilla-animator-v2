# Context: P0-1 - SoA Mandate - Memory Layout Refactor

## Target State
- All runtime numeric values in contiguous Float32Array arena
- SoA packing is canonical; no AoS legacy paths
- Compiler emits deterministic arena artifacts (`slotMeta`, `runtimeSlots`, `runtimeAddressTable`, `arenaLayout`, `arenaPayloadFloats`, `arenaTotalFloats`)
- Runtime uses compiler-emitted address metadata exclusively
- No legacy f64/object storage labels in slot ABI
- Guardrail tests prevent regression

## Current State
Most requirements are fully implemented (DONE):
- Float32Array arena: `src/runtime/ArenaValueStore.ts:47-49` -- `createArena()` allocates Float32Array
- Compiler emits all 6 required artifacts: `src/compiler/ir/program.ts:105-258` -- `slotMeta`, `runtimeSlots`, `runtimeAddressTable`, `arenaLayout`, `arenaPayloadFloats`, `arenaTotalFloats` all present on `CompiledProgramIR`
- SoA-first descriptors: `src/compiler/ir/storage-class.ts:80-107` -- `deriveArenaDescriptor()` defaults packing to `'soa'`
- Descriptor-driven addressing: `src/runtime/ArenaValueStore.ts:57-83` -- `resolveArenaAddress()`, `arenaIndex()`, `arenaRead()`, `arenaWrite()` all use descriptors
- No f64/object storage: `src/compiler/ir/program.ts:467` -- `SlotMetaEntry.storage` is `'f32' | 'i32' | 'u32'` only
- Runtime uses compiler-emitted metadata: `src/runtime/ExprAddressTable.ts:21-28` -- `getExprAddressTable()` throws if `runtimeAddressTable` is missing
- Deterministic compilation: Slot ordering is deterministic by slot ID
- Arena zones with alignment: `src/compiler/ir/storage-class.ts:199-363` -- `deriveArenaZonePlan()` with 64-float header and scalar-to-field alignment
- Shape/data separation: Arena stores numerics only; ShapeBank stores topology in Uint32Array (`src/runtime/RuntimeState.ts:108-127`)
- Verification tests exist: `src/compiler/__tests__/arena-layout.test.ts`, `src/runtime/__tests__/ArenaValueStore.test.ts`, `src/runtime/__tests__/RuntimeState-banks.test.ts`, `src/runtime/__tests__/ExprAddressTable.test.ts`, `src/compiler/__tests__/no-legacy-types.test.ts`, `src/__tests__/architecture-guardrails.test.ts`

One item for review:
- AoS packing option: `src/runtime/ArenaValueStore.ts:8` still allows `'aos'` and `componentOffsets` back-compat field exists

## Files Involved
- `src/runtime/ArenaValueStore.ts` - ArenaPacking type union includes 'aos'; componentOffsets field
- `src/compiler/ir/storage-class.ts:85` - `packingPreference` parameter allows AoS

## Suggested Approach
- Audit whether any callers actually pass `packingPreference: 'aos'`
- If no callers use AoS, remove it and make SoA the only option
- Remove `componentOffsets` field if no tests depend on it

## Risks
- Some test fixtures may use AoS for comparison convenience
- Removing AoS option is low risk if no production code uses it
