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
  - type-system
---

# Glossary Update: Payload-Generic & State Mapping Terms

---

## NEW Terms (not in existing GLOSSARY)

### Payload-Generic Block

**Definition**: A block whose semantics are defined over a closed set of payload types such that: the block's behavior is well-defined for each allowed payload, the compiler selects the correct concrete implementation per payload at compile time, and any disallowed payload is a compile-time type error.

**Type**: concept (block classification property)

**Canonical Form**: `Payload-Generic Block`

**Contract**:
1. Closed admissible payload set (AllowedPayloads per port)
2. Total per-payload specialization (every allowed payload has implementation path)
3. No implicit coercions (explicit cast blocks required)
4. Deterministic resolution (compiler's choice is deterministic)

**Relationship**: Orthogonal to cardinality-generic. A block may be one, the other, both, or neither.

**Source**: 0-PayloadGeneriic-Block-Type-Spec.md

**Pending**: Requires Q2 resolution

---

### StateMappingScalar

**Definition**: State migration mapping for a scalar (cardinality: one) stateful block.

**Type**: type

**Canonical Form**: `StateMappingScalar`

**Structure** (proposed):
```typescript
interface StateMappingScalar {
  stateId: StateId;     // stable semantic identity
  slotIndex: number;    // unstable positional offset in state buffer
  stride: number;       // floats per state element (often 1)
  initial: number[];    // length = stride, per-element initial values
}
```

**Source**: 0-CardinalityGeneric-Block-Types-Impact.md

**Pending**: Requires Q1 resolution

---

### StateMappingField

**Definition**: State migration mapping for a field (cardinality: many) stateful block. Identifies the entire state buffer for all lanes.

**Type**: type

**Canonical Form**: `StateMappingField`

**Structure** (proposed):
```typescript
interface StateMappingField {
  stateId: StateId;         // stable semantic identity (identifies the state array)
  instanceId: InstanceId;   // ties buffer to lane set identity
  slotStart: number;        // unstable start offset in state buffer
  laneCount: number;        // N at compile time
  stride: number;           // floats per lane state (>=1)
  initial: number[];        // length = stride (per-lane init template)
}
```

**Source**: 0-CardinalityGeneric-Block-Types-Impact.md

**Note**: Lane index is NOT part of StateId — it's an offset into the buffer. StateId identifies the conceptual state array.

**Pending**: Requires Q1 resolution

---

### Stride (State/Slot)

**Definition**: The number of float values per element in a state buffer or slot allocation. Determined by payload type or state requirements.

**Type**: concept (numeric property)

**Values by PayloadType**:
- `float`, `int`, `phase`, `bool`, `unit` → stride 1
- `vec2` → stride 2
- `vec3` → stride 3 (if added)
- `color` → stride 4

**Values for state**: May exceed payload stride (e.g., a filter storing both y and dy has stride 2 even for float payload)

**Source**: Both source documents

**Pending**: Requires Q5 resolution

---

## CONFLICTING Terms (new vs canonical)

### StateKey (SUPERSEDED by StateId + StateMappings)

**Existing Canonical** (Topic 05):
```typescript
interface StateKey {
  blockId: BlockId;
  laneIndex: number;
}
```

**Proposed Replacement**: `StateId` (already in GLOSSARY) + `StateMappingScalar` / `StateMappingField` (above)

**Conflict**: The existing `StateKey` embeds lane index as part of identity. The new model says lane index is a buffer offset, not semantic identity.

**Resolution**: Pending Q1 resolution. If Q1 resolves to Option A, `StateKey` is superseded.

---

## COMPLEMENTARY Definitions (new detail for existing terms)

### StateId (existing — add detail)

**Current Definition**: "Stable identifier for a block's conceptual state that survives recompilation. Derived from stable anchors (blockId + primitive identity + state key + instance context)."

**Proposed Addition**:
- StateId identifies the **state array** (the conceptual unit), not individual lanes
- For scalar state: maps to one slot
- For field state: maps to a contiguous range of `laneCount * stride` floats
- Lane index is NOT part of StateId — it's a positional offset within the array
- StateId format: `blockId + primitive_kind` (plus optional state-key disambiguator for blocks with multiple state buffers)

**Source**: 0-CardinalityGeneric-Block-Types-Impact.md

---

### PayloadType (existing — potential extension)

**Current Values**: `'float' | 'int' | 'vec2' | 'color' | 'phase' | 'bool' | 'unit'`

**Proposed Addition**: `'vec3'` (3-component vector, distinct from `color`)

**Source**: 0-PayloadGeneriic-Block-Type-Spec.md

**Pending**: Requires Q3 resolution

---

## Terms Referenced But NOT Proposed for GLOSSARY

These terms appear in the source documents but are:
- Too implementation-specific for the glossary, OR
- Already covered by existing concepts, OR
- Rejected per precedent

| Term | Reason Not Added |
|------|-----------------|
| `AllowedPayloads` | Implementation-level metadata; rejected per D20 precedent |
| `NumericUnit` | Deferred concept (Q4) |
| `ImplRef` | Implementation detail (opcode/kernel/composed selection) |
| `identityMode` | Continuity system concept, already in Topic 11 |
| `StateMappingScalar`/`Field` combo table | Registry metadata; per D20, unneeded currently |
