# Evaluation: Shape2D Type System
Generated: 2026-01-21

## Topic
Implement the shape2d type system from `.agent_planning/_future/12-shapes-types.md` - adding shape2d as a first-class PayloadType with packed binary storage, typed scalar banks, and proper combine mode restrictions.

## Verdict: CONTINUE

The work is well-defined with clear requirements. No blockers identified.

---

## 1. What Exists

### PayloadType System ✅
- `PayloadType` defined in `src/core/canonical-types.ts` (line 50-59)
- Includes `'shape'` as a payload type
- SignalType and Extent machinery fully operational

### Shape Representation
- `ShapeDescriptor`: Plain object with topologyId + params dict (ScheduleExecutor:43-46)
- `ResolvedShape`: Pre-resolved structure with mode/topologyId/params/controlPoints
- Shapes flow through generic object store (`RuntimeState.values.objects`)

### Scalar Storage Infrastructure ✅
- `SlotMetaEntry` defines physical storage kinds: `'f64' | 'f32' | 'i32' | 'u32' | 'object'`
- Each storage type has separate backing arrays + offsets
- Shapes currently map to `'object'` storage class

### Topology System ✅
- `TopologyDef` and `PathTopologyDef` interfaces defined
- `TopologyId` is already a numeric type (`number`)
- Registry exists: `registerDynamicTopology()`, `getTopology()`

### SigExprShapeRef
- Creates shape references with topologyId + paramSignals + optional controlPointField
- Returns SigExpr, stored in object slot

---

## 2. What's Missing

### P0: Shape Combine Mode Validation (HIGH confidence)
- `validateCombineMode()` in combine-utils.ts has no rules for 'shape' type
- Risk: Invalid combines like `sum(shape1, shape2)` are not caught
- **Required**: Add validation to restrict shape to `last | first | layer`

### P1: Typed Scalar Banks for shape2d (MEDIUM confidence)  
- Current: Shapes stored as JS objects in generic Map
- Target: Packed Uint32Array bank with 8-word fixed-width records
- **Required**: Add `'shape2d'` to ScalarStorageKind, create Shape2DBank

### P2: Packed Shape2D Record Format (MEDIUM confidence)
- Current: ShapeDescriptor is a plain JS object
- Target: 8 x u32 words: TopologyId, PointsFieldSlot, PointsCount, StyleRef, Flags, Reserved[3]
- **Required**: Define Shape2DWord enum, packing/unpacking utilities

### P3: sigShapeRef Packed Output (MEDIUM confidence)
- Current: Returns SigExpr stored as object
- Target: Allocates slot in shape2d bank, writes packed record
- **Required**: Update IRBuilder to use packed format

### P4: Control Points Field Validation (MEDIUM confidence)
- Current: No compile-time validation that control points field matches point count
- Target: Assert fieldSlot.payload === 'vec2' && laneCount === pointsCount
- **Required**: Add validation in sigShapeRef and/or compiler

### P5: Default shape2d Source (LOW confidence)
- Every input port needs a default source
- Need canonical fallback shape2d (e.g., triangle or unit segment)
- **Required**: Define default shape2d value

---

## 3. Gap Analysis

| Area | Current | Target | Gap |
|------|---------|--------|-----|
| PayloadType | 'shape' | 'shape2d' variant | Rename/add alias |
| Storage | object Map | Uint32Array bank | New storage kind |
| Format | JS object | 8-word packed record | New data structure |
| Combine validation | Missing | last/first/layer only | Add rules |
| sigShapeRef | Object output | Packed slot output | Modify IR builder |
| Control points | No validation | Compile-time check | Add validation |
| Default source | Undefined | Canonical fallback | Define default |

---

## 4. Dependencies

1. **TopologyId is already numeric** - No change needed
2. **Slot system exists** - Can add new storage kind
3. **RuntimeState structure** - Needs new bank field
4. **RenderAssembler** - Already unpacks shapes, minor updates needed
5. **Canvas2DRenderer** - Already uses resolvedShape, no changes

---

## 5. Risks

### R1: Breaking Change Risk (MEDIUM)
- Changing shape storage format affects all blocks using shapes
- Mitigation: Dual-format support during transition

### R2: Performance Impact (LOW)
- Packed format should be faster than JS objects
- Risk: Packing/unpacking overhead in hot paths

### R3: Validation Strictness (LOW)
- New compile-time validation may reject previously-compiling graphs
- Mitigation: Clear error messages, graceful degradation

---

## 6. Recommended Approach

### Sprint 1: Combine Mode Validation (HIGH confidence)
- Add shape combine mode restrictions
- Simple, low-risk, immediate value

### Sprint 2: Packed Shape2D Format (MEDIUM confidence)
- Define packed record structure
- Add shape2d storage kind to RuntimeState
- Create packing/unpacking utilities

### Sprint 3: sigShapeRef Migration (MEDIUM confidence)
- Update IRBuilder to use packed format
- Add control points field validation
- Update RenderAssembler for new format

### Future: Default Source & Full Integration (LOW confidence)
- Define canonical fallback shape2d
- Remove legacy object-based shape storage
