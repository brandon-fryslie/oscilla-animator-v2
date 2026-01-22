---
command: /canonicalize-architecture ./design-docs design-docs/_new/0-CardinalityGeneric-Block-Types-Impact.md design-docs/_new/0-PayloadGeneriic-Block-Type-Spec.md
files: design-docs/_new/0-CardinalityGeneric-Block-Types-Impact.md design-docs/_new/0-PayloadGeneriic-Block-Type-Spec.md
indexed: true
source_files:
  - design-docs/_new/0-CardinalityGeneric-Block-Types-Impact.md
  - design-docs/_new/0-PayloadGeneriic-Block-Type-Spec.md
topics:
  - block-system
  - compilation
  - runtime
  - type-system
---

# Questions: Cardinality-Generic State & Payload-Generic Blocks

---

## Q1: State Keying — `(blockId, laneIndex)` vs Range-Based StateId

**Tag**: CONTRADICTION-T2
**Severity**: HIGH
**Source**: 0-CardinalityGeneric-Block-Types-Impact.md vs 05-runtime.md / 02-block-system.md

**The Problem**:

The canonical spec (Topic 05) currently says:

> State is keyed by `(blockId, laneIndex)` tuple.

```typescript
interface StateKey {
  blockId: BlockId;      // Stable UUID
  laneIndex: number;     // 0 for scalar, 0..N-1 for field
}
```

But D19 (2026-01-22) already introduced `StateId` as "stable identifier for a block's conceptual state that survives recompilation." And the new source document argues that:

1. **StateId should identify the state array, not individual lanes** — Lane index is positional and can be remapped by continuity
2. **Field-cardinality state needs range-based mapping** with `slotStart`, `laneCount`, `stride`, and `instanceId`
3. **Hot-swap migration for fields should use continuity's lane mapping** (not naive index copy)

The canonical spec already has StateId in the GLOSSARY but Topic 05 still shows the older `(blockId, laneIndex)` keying pattern.

**Existing Resolution Context**: D19 added StateId to GLOSSARY with definition: "Derived from stable anchors (blockId + primitive identity + state key + instance context)." This aligns with the new source but Topic 05 code examples haven't been updated.

**Options**:

A. **Update Topic 05 to use range-based StateMappings**
   - Replace `StateKey { blockId, laneIndex }` with the range-based model
   - Scalar state: `StateMappingScalar { stateId, slotIndex, stride, initial }`
   - Field state: `StateMappingField { stateId, instanceId, slotStart, laneCount, stride, initial }`
   - Hot-swap uses continuity mapping for stable-identity fields
   - Non-stable identity uses explicit fallback policy (reset or index-copy)

B. **Keep existing `(blockId, laneIndex)` as simplified model**
   - Note range-based mapping as future implementation detail
   - Defer stride/instanceId to implementation

**Recommendation**: Option A — This is consistent with D19 and the cardinality-generic integration. The old StateKey is stale.

---

## Q2: Payload-Generic Block — New Block Classification Property

**Tag**: NEW-TOPIC (within existing topic)
**Severity**: HIGH
**Source**: 0-PayloadGeneriic-Block-Type-Spec.md vs 02-block-system.md

**The Problem**:

Source 2 proposes "Payload-Generic Block" as a formal block classification property — orthogonal to cardinality-generic. The canonical spec does not yet have this concept.

The relationship to existing spec:
- **Cardinality-generic** (already in canonical): Block works for both Signal and Field
- **Payload-generic** (proposed): Block works for multiple PayloadTypes (float, vec2, vec3, color, etc.)
- **Both orthogonal**: A block can be both, one, or neither

The formal contract has 4 properties:
1. Closed admissible payload set (no open extension)
2. Total specialization (every allowed payload has an implementation path)
3. No implicit coercions (requires explicit cast blocks)
4. Deterministic resolution (compiler's choice is deterministic)

**Existing Context**: Topic 04 (Compilation) already mentions polymorphism/monomorphization. Topic 02 already has the cardinality-generic section. Adding payload-generic would parallel the cardinality-generic formalization (D19).

**Options**:

A. **Add "Payload-Generic Blocks" section to Topic 02**
   - Parallel to existing "Cardinality-Generic Blocks" section
   - Include formal contract (4 properties)
   - Include "which blocks are payload-generic" table
   - Include "what is NOT allowed" constraints
   - Add note on compilation (fully specialized IR, no runtime payload dispatch)
   - Reject registry metadata (per D20 precedent — we rejected cardinality-generic registry metadata)

B. **Defer payload-generic formalization**
   - Note concept exists but don't formalize until implementation demands it
   - Keep the current implicit polymorphism section in Topic 04

C. **Add as T3 optional note only**
   - Brief mention in Topic 02 without full section
   - Implementation can refer to source doc directly

**Recommendation**: Option A — This mirrors D19's approach for cardinality-generic. The concept is well-defined and immediately useful for implementation. However, reject the registry metadata (§8) per D20 precedent.

---

## Q3: `vec3` as PayloadType

**Tag**: AMBIGUITY
**Severity**: MEDIUM
**Source**: 0-PayloadGeneriic-Block-Type-Spec.md vs GLOSSARY.md

**The Problem**:

The canonical GLOSSARY defines PayloadType as:
> `'float' | 'int' | 'vec2' | 'color' | 'phase' | 'bool' | 'unit'`

Source 2 repeatedly uses `vec3` as a payload type (in examples: Add, Mul, Normalize work on `{float, vec2, vec3}`). The canonical spec does NOT include `vec3`.

**Options**:

A. **Add `vec3` to PayloadType**
   - Expand to: `'float' | 'int' | 'vec2' | 'vec3' | 'color' | 'phase' | 'bool' | 'unit'`
   - Needed for 3D operations (normalize, length, cross product)
   - `vec3` = 3 components, distinct from `color` (4 components, RGBA semantics)

B. **Keep PayloadType as-is, note `vec3` as future extension**
   - Current system is 2D-focused
   - `vec3` can be added when 3D support is implemented
   - Source doc is aspirational

C. **Include `vec3` but mark as optional/deferred**
   - Add to type but mark as "post-MVP" or "when 3D is implemented"

**Note**: This is related to whether 3D shapes/layouts are in scope. The canonical spec doesn't currently reference 3D geometry.

---

## Q4: Unit Constraints on Blocks (NumericUnit)

**Tag**: AMBIGUITY
**Severity**: LOW
**Source**: 0-PayloadGeneriic-Block-Type-Spec.md §2.2 vs 01-type-system.md

**The Problem**:

Source 2 references unit constraints on blocks:
> "Sin allows `float(unit=radians)` and `phase(unit=phase)` but not `float(unit=ms)`"
> "If your SignalType includes `unit?: NumericUnit`..."

The canonical type system (`SignalType = { payload, extent }`) does NOT include a `unit` field. NumericUnit is not in the GLOSSARY.

**Options**:

A. **Add `unit?: NumericUnit` to SignalType**
   - Enables dimensional analysis and unit safety
   - Prevents connecting milliseconds to radians

B. **Reject unit annotations entirely**
   - Too complex for current implementation
   - Unit safety is a future concern
   - PayloadType `phase` already handles the phase-vs-float distinction

C. **Note as future extension, don't add to canonical now**
   - Acknowledge the concept
   - Defer to when implementation demands it

**Recommendation**: Option C — This is an interesting idea but adds complexity to the type system that isn't needed for MVP. PayloadType `phase` already distinguishes phase from raw float, which handles the most important case.

---

## Q5: Stride in State/Slot Allocation

**Tag**: COMPLEMENT
**Severity**: MEDIUM
**Source**: 0-CardinalityGeneric-Block-Types-Impact.md + 0-PayloadGeneriic-Block-Type-Spec.md vs 04-compilation.md

**The Problem**:

Both source documents reference the concept of **stride** — the number of floats per state/slot element:
- Source 1: "stride exists because many stateful primitives need more than one float per lane (e.g., a filter could store y and dy)"
- Source 2: "vec2 → 2 components, vec3 → 3 components, color → 4 components (RGBA)"

The canonical spec currently says:
- State allocation: "One state cell" or "N(domain) state cells" — doesn't mention stride
- Slot allocation: Allocated by cardinality but doesn't specify stride per payload type

**Options**:

A. **Add stride concept to state allocation and slot allocation**
   - StateMappingField: `stride: number` (floats per lane state element)
   - Slot formatting: `float|int|phase|unit → 1, vec2 → 2, vec3 → 3 (if added), color → 4`
   - This is implementation detail but matters for correctness

B. **Defer stride to implementation**
   - Note that "dense array" implies stride but don't formalize
   - Implementation already handles different payload sizes

**Recommendation**: Option A — Stride is fundamental to correct buffer allocation. Without it, the spec can't precisely describe how state buffers are laid out for multi-component types.

---

## Internal Contradiction: Lane-Index in StateId

**Tag**: CONTRADICTION-INTERNAL
**Severity**: LOW (already resolved in source document itself)
**Source**: 0-CardinalityGeneric-Block-Types-Impact.md (internal)

**The Problem**:

Within the conversation, Claude initially proposed `StateId = blockId + kind + lane_index`, and ChatGPT corrected this to identify the state **array**, not individual lanes. The document self-resolves this:

> "The stable unit of identity is the state array, not each lane"
> "Lane index is positional within an instance and can be remapped by continuity; treating it as part of StateId bakes in the thing you're trying to avoid."

**Resolution**: The document self-resolves. StateId identifies arrays, lane index is an offset into the buffer. This aligns with D19's GLOSSARY definition ("identifies conceptual state, not storage offset").

**Status**: RESOLVED (no action needed)

---

## Summary

| Question | Tag | Severity | Requires Resolution |
|----------|-----|----------|---------------------|
| Q1: State Keying model | CONTRADICTION-T2 | HIGH | YES |
| Q2: Payload-Generic formalization | NEW-TOPIC | HIGH | YES |
| Q3: `vec3` as PayloadType | AMBIGUITY | MEDIUM | YES |
| Q4: Unit constraints (NumericUnit) | AMBIGUITY | LOW | Recommended: defer |
| Q5: Stride in allocation | COMPLEMENT | MEDIUM | YES |
| Internal: Lane-index | INTERNAL | LOW | No (self-resolved) |

**CRITICAL items**: 0
**HIGH items requiring resolution**: 2 (Q1, Q2)
**MEDIUM items**: 2 (Q3, Q5)
**LOW/Resolved**: 2 (Q4, internal)
