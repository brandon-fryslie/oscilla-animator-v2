Good — this is enough to lock the single required rule and remove the fallback behavior that’s currently letting the runtime “guess”.

Canonical rule: where offsets are computed

Offsets are computed in the compiler’s slot allocator and emitted in program.slotMeta.
RuntimeState must not infer offsets from schedule, ever.
If program.slotMeta is empty/undefined and the schedule has any slot ops, throw.

That’s the spec. Now the practical “plug this in” changes.

⸻

What to change in this file (RuntimeState.ts)

1) Delete “inferSlotMetaFromSchedule” completely

That function is a footgun: it silently makes bad programs “work”, and it can never be correct once you have:
	•	mixed storage (f32/f64/i32/u32/object)
	•	packed bundles
	•	reserved slots
	•	hot-swap stability expectations

So: remove it.

2) Make extractSlotMeta strict

Replace the whole implementation with:

function extractSlotMeta(program: CompiledProgramIR): SlotMeta[] {
  const meta = program.slotMeta ?? [];
  if (meta.length === 0 && scheduleHasSlotOperations(program)) {
    throw new Error(
      `RuntimeState: program.slotMeta is required (schedule has slot ops) but is empty.`
    );
  }
  return [...meta];
}

Also: remove the “merge inferred” code entirely. No merging. One truth.

3) Remove typed-array constPool fallback from RuntimeState

Per the canonical IR contract we just locked:
	•	constants are JSON-only
	•	there is no f64/f32/i32/constIndex in constants

So this block must become:

const constPool = program.constants ?? { json: [] };
initializeState(state, stateLayout, constPool);

And you must update initializeState’s signature to accept { json: unknown[] } only.

4) Fix the object/numeric slot confusion in schedule inference logic

Once you delete inference, this problem disappears — but it’s worth stating plainly:
your current inference marks materializeColor outputs as object slots, yet your plan says they’re Float32Array buffers (objects) — fine — but it also marks domainSlot/colorExprSlot as objects, which is almost certainly wrong (domainSlot is typically numeric or a small object “domain handle”; colorExprSlot is a handle id). Inference can’t know. This is exactly why inference must die.

5) FrameCache capacities must come from program tables

Hardcoding 1024/512 will eventually bite you and also breaks determinism under hot-swap.

Replace:

const sigCapacity = 1024;
const fieldCapacity = 512;

with:

const sigCapacity = program.signalExprs.nodes.length;
const fieldCapacity = program.fieldExprs.nodes.length;

(or whatever the actual table field name is — but it must be derived, not guessed).

⸻

What “offset” actually means (so the compiler emits the right thing)

Your createValueStore(slotMeta) is doing the real storage allocation. The compiler must emit offsets that are consistent with the store layout rules.

Canonical definition of offset:
	•	For typed numeric stores (f64, f32, i32, u32):
offset is the element index into that typed array (not bytes).
	•	For object:
offset is the index into the object array.

Offsets are per-storage, not global.
So slot 7 could have:
	•	storage: "f64", offset: 12
	•	slot 8 could have:
	•	storage: "object", offset: 0

This is what lets you pack tightly, reorder slots, and still keep stable slot IDs.

⸻

Compiler-side algorithm (the one you asked for)

In your compiler “slot allocator” (or finalization pass), do:
	1.	Gather all slots that will exist in the program (usually builder already has them).
	2.	For each slot, determine:
	•	storage (f64/f32/i32/u32/object)
	•	type (TypeDesc)
	•	debugName (optional)
	3.	Compute offsets by stable ordering:

Stable ordering requirement
To keep hot-swap/debug stable: within each storage, sort by slot ascending when assigning offsets.

Pseudo:

const f64Slots = slots.filter(s => s.storage==="f64").sort(bySlot);
let f64Off=0; for (s of f64Slots) emit(s, offset=f64Off++);

const f32Slots = ...
const i32Slots = ...
const u32Slots = ...
const objSlots = ...

That’s it. No heuristics.

Then createValueStore(slotMeta) can allocate:
	•	new Float64Array(f64Off)
	•	new Float32Array(f32Off)
	•	etc
	•	new Array(objOff)

And use meta.offset for indexing.”

⸻

One more required cleanup: stop importing SlotMeta from compiler/ir/stores

Right now this file uses:

import type { SlotMeta } from "../../compiler/ir/stores";

But your canonical IR contract defines SlotMetaEntry (with offset) in program.ts.

So: make SlotMeta be the same type as SlotMetaEntry, and import it from the same canonical module as the IR. There must not be two.

⸻

Net result

After these changes:
	•	RuntimeState becomes “dumb”: it just trusts compiler layout, allocates stores, and runs.
	•	Any program that forgets to emit slotMeta fails immediately (good).
	•	Offsets become deterministic and portable to Rust/WASM later (identical meaning).
