# Sprint: block-surface - Block Surface

Generated: 2026-01-25
Confidence: HIGH: 4, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION
Source: EVALUATION-20260125.md

## Sprint Goal

Implement the block layer for external input access: ExternalInput, ExternalGate, and ExternalVec2 blocks with proper lowering to sigExternal.

## Scope

**Deliverables:**
- ExternalInput block (channel config -> float output)
- ExternalGate block (channel + threshold -> bool output)
- ExternalVec2 block (channelBase -> vec2 output)
- Register all blocks in block registry

## Work Items

### P0: ExternalInput block

**Confidence:** HIGH
**Spec Reference:** design-docs/external-input/02-External-Input-Spec.md Section 6.1
**Status Reference:** EVALUATION-20260125.md - "No blocks exist for external input access"

**Acceptance Criteria:**
- [ ] Block type 'ExternalInput' registered in src/blocks/io-blocks.ts
- [ ] Category: 'io', Capability: 'io'
- [ ] Cardinality: preserve (works with both signal and field)
- [ ] Input: channel (string, config-only, not exposed as port)
- [ ] Output: value (float)
- [ ] lower() emits ctx.b.sigExternal(channel, signalType('float'))
- [ ] Block appears in block palette under 'io' category

**Technical Notes:**
- Channel is config-only (exposedAsPort: false)
- Default channel value: 'mouse.x' for immediate usability
- No smoothing in block - smoothing is write-side per spec

---

### P1: ExternalGate block

**Confidence:** HIGH
**Spec Reference:** design-docs/external-input/02-External-Input-Spec.md Section 6.2
**Status Reference:** EVALUATION-20260125.md - "No blocks exist for external input access"

**Acceptance Criteria:**
- [ ] Block type 'ExternalGate' registered
- [ ] Category: 'io', Capability: 'io'
- [ ] Cardinality: preserve
- [ ] Inputs:
  - channel (string, config-only)
  - threshold (float, config-only, default 0.5)
- [ ] Output: gate (bool-ish float 0/1)
- [ ] lower() emits sigExternal then sigZip with OpCode.Gt
- [ ] Properly thresholds: value >= threshold -> 1, else -> 0

**Technical Notes:**
- Use OpCode.Gt for comparison (a > b returns 1 if true, 0 if false)
- Actually use Gt or implement step function
- Useful for converting continuous signals to triggers

---

### P2: ExternalVec2 block

**Confidence:** HIGH
**Spec Reference:** design-docs/external-input/02-External-Input-Spec.md Section 6.3
**Status Reference:** EVALUATION-20260125.md - "No blocks exist for external input access"

**Acceptance Criteria:**
- [ ] Block type 'ExternalVec2' registered
- [ ] Category: 'io', Capability: 'io'
- [ ] Cardinality: preserve
- [ ] Input: channelBase (string, config-only, default 'mouse')
- [ ] Output: position (vec2)
- [ ] lower() reads channelBase + '.x' and channelBase + '.y' via sigExternal
- [ ] Combines x/y into vec2 using MakeVec2 pattern or pack kernel

**Technical Notes:**
- This is a convenience block to avoid manual x/y wiring
- Default 'mouse' makes it immediately usable
- Uses naming convention: channelBase.x and channelBase.y

---

### P3: Register blocks in registry

**Confidence:** HIGH
**Status Reference:** EVALUATION-20260125.md - "No blocks exist for external input access"

**Acceptance Criteria:**
- [ ] io-blocks.ts created or extended
- [ ] All three blocks registered via registerBlock()
- [ ] Block registry exports the new blocks
- [ ] Blocks appear in getAllBlockTypes() result
- [ ] Blocks appear in getBlockTypesByCategory('io') result

**Technical Notes:**
- Follow existing pattern from time-blocks.ts
- Import and call at module level to register on load
- Ensure io-blocks.ts is imported in block entry point

---

## Dependencies

- Requires Sprint 1 (channel-infra) to be complete
- P0, P1, P2 can be done in parallel
- P3 is just registration, trivial after blocks are defined

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| MakeVec2 pattern unclear | Low | Low | Check geometry-blocks.ts for existing vec2 packing |
| Threshold comparison incorrect | Low | Low | Unit test the gate block explicitly |
| Block doesn't appear in UI | Low | Low | Verify import chain in blocks index |
