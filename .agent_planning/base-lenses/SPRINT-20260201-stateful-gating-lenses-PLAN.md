# Sprint: Stateful & Gating Lenses
Generated: 2026-02-01
Confidence: HIGH: 3, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION

## Sprint Goal
Implement Slew/Lag lens (stateful), Mask lens (gating), and Deadzone lens (value shaping with special behavior).

## Scope
**Deliverables:**
1. Slew (stateful smoothing lens)
2. Mask (gating/hold lens)
3. Deadzone (zero small magnitudes)

## Work Items

### P0: Slew block

One-pole low-pass filter as a lens. Similar to existing Lag block but designed for port-attached usage.

**Acceptance Criteria:**
- [ ] Block type `Slew` registered with `category: 'lens'`
- [ ] `capability: 'state'`, `isStateful: true`
- [ ] Inputs: `in` (FLOAT), `smoothing` (FLOAT, default 0.5, norm01, exposedAsPort: false), `initialValue` (FLOAT, default 0, exposedAsPort: false)
- [ ] Output: `out` (FLOAT)
- [ ] Lower: `allocStateSlot → stateRead(prev) → kernelZip([prev, input, smoothing], Lerp) → stepStateWrite(new)`
- [ ] Test: with smoothing=1.0, output tracks input exactly; with smoothing=0.0, output stays at initial value
- [ ] Preserves cardinality (works on signals and fields)

**Technical Notes:**
- Follows exact same pattern as `src/blocks/signal/lag.ts`
- Key difference from Lag block: designed for lens-on-port usage, not standalone
- Uses `stableStateId(ctx.instanceId, 'slew')` for state identity

### P1: Mask block

Gate/hold values based on a mask signal. When mask > 0, pass through; when mask ≤ 0, output zero (or hold last value).

**Acceptance Criteria:**
- [ ] Block type `Mask` registered with `category: 'lens'`
- [ ] `capability: 'pure'` (zero-policy variant is pure)
- [ ] Inputs: `in` (FLOAT), `mask` (FLOAT, exposedAsPort: true — this one IS wirable), `policy` config param: 'zero' | 'hold' (default: 'zero', exposedAsPort: false)
- [ ] Output: `out` (FLOAT)
- [ ] Lower (zero policy): `kernelZip([mask, input, zeroConst], Select)` — select(mask > 0, input, 0)
- [ ] Test: mask=1 → passthrough; mask=0 → zero

**Technical Notes:**
- `Select` opcode: `select(cond, ifTrue, ifFalse)` where `cond > 0 ? ifTrue : ifFalse`
- The 'hold' policy variant would need state (hold-last-value). Can defer to future if needed — 'zero' policy is pure and covers most cases.
- `mask` input is `exposedAsPort: true` so it can be wired to another signal

### P2: Deadzone block

Zero out small magnitudes, preserve sign for larger values.

**Acceptance Criteria:**
- [ ] Block type `Deadzone` registered with `category: 'lens'`
- [ ] `capability: 'pure'`
- [ ] Inputs: `in` (FLOAT), `threshold` (FLOAT, default 0.01, exposedAsPort: false)
- [ ] Output: `out` (FLOAT)
- [ ] Lower: `abs(x) > threshold ? x : 0` using Select + Abs + comparison
- [ ] Test: threshold=0.1 → input 0.05 gives 0, input 0.2 gives 0.2, input -0.05 gives 0, input -0.2 gives -0.2

**Technical Notes:**
- Implementation: `abs_val = abs(x); cond = abs_val - threshold; result = select(cond, x, 0)`
- `Select` checks `cond > 0`, so `abs(x) - threshold > 0` means `|x| > threshold`

## File Structure

```
src/blocks/lens/
├── slew.ts            # Slew (stateful)
├── mask.ts            # Mask (gating)
├── deadzone.ts        # Deadzone
└── __tests__/
    └── stateful-lenses.test.ts
```

## Dependencies
- Sprint 1 (pure scalar lenses) — infrastructure update required first
- Existing state slot infrastructure (allocStateSlot, stateRead, stepStateWrite)
- Existing Select opcode

## Risks
- **Slew lens vs Lag block duplication**: These serve different purposes — Lag is a standalone block in the graph, Slew is a port-attached lens. The implementations are similar but usage contexts differ. Not a violation of "one type per behavior" because the usage pattern (standalone vs lens attachment) is genuinely different.
- **Mask with wirable input**: The `mask` input with `exposedAsPort: true` means it needs a second connection. The lens expansion infrastructure handles this — the lens block is expanded to a real block, so it can have multiple inputs wired.
