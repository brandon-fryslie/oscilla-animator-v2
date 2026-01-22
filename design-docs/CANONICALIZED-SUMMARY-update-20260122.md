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

# Update Summary: Cardinality-Generic State & Payload-Generic Blocks

**Run Type**: UPDATE
**Existing Canonical**: `CANONICAL-oscilla-v2.5-20260109/`
**Current Status**: 15 topics, 58 sources, 91 resolutions
**New Sources**: 2 files

---

## Source 1: `0-CardinalityGeneric-Block-Types-Impact.md`

**Nature**: Conversation transcript (Claude + ChatGPT) discussing stable state management for cardinality-generic blocks operating on fields.

**Key Proposals**:
1. StateId identifies **state arrays** (per block), not individual lanes
2. State mappings should be **range-based** for field-cardinality blocks (slotStart + laneCount + stride)
3. Hot-swap migration should use **continuity's lane mapping** (not naive index copy) when identity is stable
4. `stride` field needed for multi-float state elements (e.g., filter stores y and dy)
5. `instanceId` field required in field-state mappings (ties buffer to lane set)

**Document Quality**: Conversational; contains design exploration and working-out. Core ideas are sound but need distillation.

---

## Source 2: `0-PayloadGeneriic-Block-Type-Spec.md`

**Nature**: Formal specification for Payload-Generic Blocks — blocks that operate over a closed set of payload types with compile-time specialization.

**Key Proposals**:
1. **Formal contract**: 4 properties (closed admissible payload set, total per-payload specialization, no implicit coercions, deterministic resolution)
2. **Type system rules**: Payload unification + unit constraints
3. **Runtime semantics**: Componentwise vs type-specific categories
4. **Compilation**: Fully specialized IR, stride-aware slot allocation, no runtime payload dispatch
5. **Validity shapes**: Signature families (homogeneous unary/binary, mixed binary, predicate, reduction)
6. **Hard constraints**: No implicit reinterpretation, no semantic ambiguity, no partial coverage
7. **Registry metadata**: Per-block payload support tables, combination rules, semantics category, unit constraints
8. **Diagnostics**: 4 new error codes (PAYLOAD_NOT_ALLOWED, PAYLOAD_COMBINATION_NOT_ALLOWED, UNIT_MISMATCH, IMPLICIT_CAST_DISALLOWED)

**Document Quality**: Formal, complete, well-structured specification.

---

## Affected Existing Topics

| Topic | Impact | Nature |
|-------|--------|--------|
| **02-block-system** | HIGH | State allocation section needs range-based mapping; Payload-generic as new block classification |
| **04-compilation** | HIGH | Slot allocation by payload stride; Payload specialization process |
| **05-runtime** | MEDIUM | StateMigration needs stride/instanceId; Hot-swap uses continuity mapping |
| **01-type-system** | MEDIUM | PayloadType already exists; Unit constraints are new addition |

---

## Proposed New Topics

None. All content fits within existing topics.

---

## Overlap Analysis

| Content | Existing Topic | Nature |
|---------|---------------|--------|
| StateId concept | 02-block-system, 05-runtime | COMPLEMENT (refines existing) |
| Cardinality-generic contract | 02-block-system | Already integrated (D19) |
| Compile-time specialization | 04-compilation | COMPLEMENT (payload axis adds to cardinality axis) |
| No runtime dispatch | 04-compilation, 05-runtime | Aligns with existing erasure model |
| Slot allocation | 04-compilation | COMPLEMENT (stride extends existing) |

---

## Gap Analysis

| Gap | Severity | Notes |
|-----|----------|-------|
| `vec3` payload type | LOW | PayloadType in GLOSSARY lists `float|int|vec2|color|phase|bool|unit` — no `vec3`. Source 2 assumes `vec3` exists. |
| Unit constraints on blocks | LOW | NumericUnit concept referenced but not in canonical spec |
| `stride` in slot allocation | MEDIUM | Current spec assumes 1 component for scalar types, but multi-component payloads (vec2=2, color=4) need stride |

---

## Findings Summary

| Category | Count |
|----------|-------|
| CRITICAL (T1 contradictions) | 0 |
| HIGH (T2 contradictions) | 2 |
| NORMAL (T3 contradictions) | 0 |
| Internal contradictions | 1 |
| Overlaps/Complements | 5 |
| Ambiguities | 2 |
| Gaps | 3 |
| New topics proposed | 0 |

---

## Resolution Progress

**3 of 5 items require resolution** before integration can proceed.
