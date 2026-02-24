# Test Lane Matrix: compiledir-hybrid-foundation

## Lane A (Blocking)
- `src/__tests__/forbidden-patterns.test.ts` | Existing architectural guardrails.
- `src/compiler/__tests__/no-legacy-types.test.ts` | Existing compiler legacy-eradication gate.
- `src/__tests__/compiledir-foundation-gates.test.ts` | New no-growth gates for W11/W5/W6/W2/W7/W12.

## Lane B (Temporary Non-Blocking)
- `src/runtime/__tests__/ExprAddressTable.test.ts` | Encodes `slotMeta`/`assertF64Stride` assumptions targeted by W2/W7.
- `src/runtime/__tests__/executeFrameStepped.test.ts` | Touches slot/meta addressing details targeted by W2.
- `src/runtime/__tests__/arena-scalar-write-through.test.ts` | Likely coupled to current addressing/storage labels during W2/W7.
- `src/runtime/__tests__/StepDebugSession.test.ts` | Likely coupled to current slot/debug metadata shape during W2.

## Lane C (Triage)
- `src/runtime/__tests__/arena-field-materialization.test.ts` | May fail under evaluator/addressing changes (W2/W6/W7).
- `src/runtime/__tests__/arena-continuity-write-through.test.ts` | May fail under addressing + continuity changes (W2/W12).
- `src/runtime/__tests__/temporal-comparison.test.ts` | May fail during evaluator/state surface cleanup (W6).

## Burn-Down Rule
- Lane B count must strictly decrease every packet.
- Any new Lane B additions require packet split and explicit rationale in `PACKETS.md`.
