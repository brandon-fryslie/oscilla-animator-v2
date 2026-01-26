# Canonical Addressing System - Complete Reference

**Version**: v1
**Scope**: Hierarchical paths for all addressable elements in Oscilla graph
**Philosophy**: Nothing is implicit. All topology elements (edges, adapters, defaults) are addressable for error messages and tooling, even if user expressions can only access block outputs.

---

## 1. CORE ELEMENTS

### 1.1 Blocks

**Format**: `v1:blocks.<canonicalName>`

**Examples**:
- `v1:blocks.my_circle` - Block with canonical name "my_circle"
- `v1:blocks.oscillator_1` - Block with canonical name "oscillator_1"

**Canonical Name Generation**:
- Source: Block's `displayName` field (if present) or fallback to `blockId`
- Normalization: `normalizeCanonicalName(displayName)`
  - Strip chars: `!@#&()[]{}|'"+-=*^%<>?.`
  - Replace spaces: ` ` → `_`
  - Lowercase: entire string
- Example: `My Circle! (nice)` → `my_circle_nice`
- Uniqueness: Must be unique per patch (validated at normalization time)

---

### 1.2 Ports (Inputs and Outputs)

**Output Format**: `v1:blocks.<canonicalName>.outputs.<portId>`
**Input Format**: `v1:blocks.<canonicalName>.inputs.<portId>`

**Examples**:
- `v1:blocks.my_circle.outputs.radius` - Output port "radius"
- `v1:blocks.oscillator.inputs.phase` - Input port "phase"
- `v1:blocks.add_op.inputs.b` - Second input of add block

**Port ID**:
- Source: Port identifier from block registry (e.g., "radius", "phase", "in0")
- Case-sensitive: Defined by block type definition
- Discoverable: Block registry defines all available ports per type

---

### 1.3 Parameters (Config-Only Inputs)

**Format**: `v1:blocks.<canonicalName>.params.<paramId>`

**Examples**:
- `v1:blocks.expression.params.expression` - Expression text parameter
- `v1:blocks.noise.params.seed` - Noise seed parameter

**Parameter ID**:
- Source: Parameter identifier from block definition
- Applies to: Config-only inputs (inputs with `exposedAsPort: false`)
- Value storage: `Block.params[paramId]` in Patch

---

## 2. EDGES AND TOPOLOGY

### 2.1 Edges (Connections)

**Format**: `v1:edges.<edgeId>`

**Examples**:
- `v1:edges.e1a2b3c4` - Edge with ID "e1a2b3c4"

**Edge Properties via Hierarchical Addressing**:
- `v1:edges.e1a2b3c4/from` - Source endpoint (block, port)
- `v1:edges.e1a2b3c4/to` - Target endpoint (block, port)
- `v1:edges.e1a2b3c4/enabled` - Boolean enabled state
- `v1:edges.e1a2b3c4/sortKey` - Numeric sort order for combine
- `v1:edges.e1a2b3c4/role` - Edge role (user, default, auto, adapter)

**Edge Details**:
- `from`: Endpoint with `{ blockId, slotId: portId }`
- `to`: Endpoint with `{ blockId, slotId: portId }`
- Endpoint addresses resolved via block canonical names

**Examples of Complete Edge References**:
- `v1:edges.e123/from → v1:blocks.my_oscillator.outputs.out`
- `v1:edges.e123/to → v1:blocks.my_circle.inputs.angle`

---

### 2.2 Default Sources (Implicit Edges)

**Format**: `v1:blocks.<canonicalName>.inputs.<portId>/defaultSource`

**Examples**:
- `v1:blocks.my_shape.inputs.color/defaultSource`
- Points to the implicit default source block and output

**Default Source Details**:
- Stored: `Block.inputPorts[portId].defaultSource`
- Value: `{ blockType, output, params? }`
- Represented: As implicit edge with role `{ kind: 'default', meta: { defaultSourceBlockId } }`
- Resolution: Compiler creates default source block automatically

**Examples of Default Source Blocks**:
- `v1:blocks.default_color_for_shape_color_input` - Auto-generated default source
- Address format for the generated block: Same as normal blocks

---

### 2.3 Combine Modes (Per-Input Configuration)

**Format**: `v1:blocks.<canonicalName>.inputs.<portId>/combineMode`

**Examples**:
- `v1:blocks.my_vector.inputs.components/combineMode`
- Value: One of 10 modes: `sum`, `average`, `max`, `min`, `mul`, `last`, `first`, `layer`, `or`, `and`

**Combine Mode Details**:
- Stored: `Block.inputPorts[portId].combineMode`
- Applies: When multiple edges connect to same input
- Type-sensitive: Only valid modes per payload type

---

## 3. ADAPTERS AND TRANSFORMS

### 3.1 Adapter Blocks

**Format**: `v1:blocks.<canonicalName>` (same as normal blocks)

**Adapter-Specific Metadata**:
- Role: `{ kind: 'derived', meta: { kind: 'adapter', edgeId, adapterType } }`
- Address includes: block canonical name (normalized from displayName)

**Examples**:
- `v1:blocks.float_to_color_adapter_e123` - Adapter for edge e123
- Generated automatically when type mismatch needs resolution

---

### 3.2 Adapter Edges

**Format**: `v1:edges.<edgeId>/adapter`

**Examples**:
- `v1:edges.e456/adapter → v1:blocks.float_to_color_adapter_e123`
- Points to adapter block that mediates the type conversion

---

## 4. DOMAIN SYSTEM

### 4.1 Domain Blocks

**Format**: `v1:blocks.<canonicalName>` (domain blocks are regular blocks with role="domain")

**Examples**:
- `v1:blocks.my_circle_domain` - Circle domain block
- `v1:blocks.grid_layout` - Grid domain block

**Domain Block Properties**:
- Role: `{ kind: 'domain', meta: { domainType, ... } }`
- Outputs: Instance count, layout parameters
- Addressable: Like normal blocks

---

### 4.2 Domain Instances (Array Elements)

**Format**: `v1:domains.<canonicalDomainName>/instances[<index>]`

**Examples**:
- `v1:domains.my_circles/instances[0]` - First circle
- `v1:domains.my_circles/instances[5]` - Sixth circle

**Instance Details**:
- Index: 0-based (0 to count-1)
- Computed from: Domain block outputs + instance layout system
- Reference: Stable as long as instance count doesn't change

---

### 4.3 Intrinsic Properties

**Format**: `v1:domains.<canonicalDomainName>/instances[<index>]/intrinsics.<propertyName>`

**Examples**:
- `v1:domains.my_circles/instances[0]/intrinsics.position` - First circle's position
- `v1:domains.my_circles/instances[0]/intrinsics.radius` - First circle's radius
- `v1:domains.my_grid/instances[0]/intrinsics.index` - First grid cell's index
- `v1:domains.my_grid/instances[0]/intrinsics.normalizedIndex` - Normalized index

**Available Intrinsics** (payload type indicated):
- `index` → `int` - 0-based element index
- `normalizedIndex` → `float` - 0.0 to 1.0 normalized
- `randomId` → `float` - 0.0 to 1.0 deterministic per-element random
- `position` → `vec2` - Layout-derived 2D position
- `radius` → `float` - Layout-derived radius (circles only)

**Intrinsic Properties**:
- Read-only: Computed by compiler and runtime
- Type-safe: Only valid intrinsics per domain type
- Instance-bound: Each instance has its own value

---

### 4.4 Domain Type Metadata

**Format**: `v1:domainTypes.<domainTypeId>`

**Examples**:
- `v1:domainTypes.shape` - Base shape domain
- `v1:domainTypes.circle` - Circle domain
- `v1:domainTypes.grid` - Grid domain

**Domain Type Details**:
- ID: Registered in domain registry
- Intrinsics: List of available intrinsic properties
- Parent: Domain hierarchy (e.g., circle extends shape)
- Definitive source: `src/core/domain-registry.ts`

---

## 5. SYSTEM AND DERIVED ELEMENTS

### 5.1 System Blocks (Derived)

**Format**: `v1:blocks.<canonicalName>` (role="derived")

**Types**:
- Default source blocks (auto-generated)
- Wirestate blocks (internal)
- Lens blocks (internal)
- Adapter blocks (documented above)

**Examples**:
- `v1:blocks.default_source_for_shape_color_input` - Default source
- `v1:blocks.wirestate_e123` - Wire state block

**Identification**:
- Role: `{ kind: 'derived', meta: { kind: 'defaultSource'|'wireState'|'lens'|'adapter', ... } }`
- Address format: Same as normal blocks
- Target: `meta` field indicates what system element they serve

---

### 5.2 Wire State Blocks

**Format**: `v1:blocks.<canonicalName>` (derived with kind="wireState")

**Purpose**: Internal system block tracking continuity state for wires

**Not directly addressable by users**: System-internal

---

## 6. ADDRESSING IN ERROR MESSAGES AND TOOLING

### 6.1 Complete Path Examples

**Simple case** (block → output → edge → input):
```
Circle block (v1:blocks.my_circle)
  ├── output port (v1:blocks.my_circle.outputs.radius)
  ├── edge (v1:edges.e123)
  └── input port (v1:blocks.transform.inputs.scale)
```

**With adapter**:
```
Oscillator (v1:blocks.osc)
  ├── output (float) (v1:blocks.osc.outputs.out)
  ├── edge (v1:edges.e456)
  ├── adapter block (v1:blocks.float_to_vec2_e456)
  └── input (vec2) (v1:blocks.geometry.inputs.position)
```

**Instance property**:
```
Domain: my_circles (v1:blocks.my_circle_domain)
  ├── instance [0] (v1:domains.my_circles/instances[0])
  └── intrinsic position (v1:domains.my_circles/instances[0]/intrinsics.position)
```

### 6.2 Error Message Usage

**Clear, unambiguous references in errors**:
```
Type mismatch on edge v1:edges.e123:
  Source: v1:blocks.my_oscillator.outputs.out (type: float)
  Target: v1:blocks.my_vector.inputs.components (type: vec2)
  Adapter needed: v1:blocks.float_to_vec2_adapter_e123
```

```
Invalid default source for input v1:blocks.my_shape.inputs.color/defaultSource:
  Referenced block type "UnknownColor" not found in registry.
```

```
Circular dependency detected at v1:edges.e789:
  from: v1:blocks.operation.outputs.result
  to: v1:blocks.operation.inputs.value
  Cycle involves: [v1:blocks.operation, v1:blocks.transform]
```

---

## 7. ADDRESSABLE ELEMENTS SUMMARY TABLE

| Element | Format | Example | Persistence | Accessibility |
|---------|--------|---------|-------------|---|
| Block | `v1:blocks.<name>` | `v1:blocks.my_circle` | ✓ Patch | All |
| Output Port | `v1:blocks.<name>.outputs.<id>` | `v1:blocks.my_circle.outputs.radius` | ✓ Registry | All |
| Input Port | `v1:blocks.<name>.inputs.<id>` | `v1:blocks.my_circle.inputs.angle` | ✓ Registry | All |
| Parameter | `v1:blocks.<name>.params.<id>` | `v1:blocks.expr.params.expression` | ✓ Patch | Config only |
| Edge | `v1:edges.<id>` | `v1:edges.e123` | ✓ Patch | All (errors, tooling) |
| Edge Property | `v1:edges.<id>/<prop>` | `v1:edges.e123/from` | ✓ Patch | Tooling only |
| Combine Mode | `v1:blocks.<name>.inputs.<id>/combineMode` | `v1:blocks.vec.inputs.parts/combineMode` | ✓ Patch | Tooling |
| Default Source | `v1:blocks.<name>.inputs.<id>/defaultSource` | `v1:blocks.shape.inputs.color/defaultSource` | ✓ Patch | Tooling |
| Adapter Block | `v1:blocks.<name>` | `v1:blocks.f_to_v2_e123` | ✓ Patch | All |
| Default Source Block | `v1:blocks.<name>` | `v1:blocks.default_color_for_shape_color` | ✓ Patch | All |
| Domain Block | `v1:blocks.<name>` | `v1:blocks.my_circles` | ✓ Patch | All |
| Domain Instance | `v1:domains.<name>/instances[n]` | `v1:domains.my_circles/instances[0]` | ✓ Runtime | Compiler only |
| Intrinsic Property | `v1:domains.<name>/instances[n]/intrinsics.<prop>` | `v1:domains.my_circles/instances[0]/intrinsics.position` | ✓ Runtime | Compiler only |
| Domain Type | `v1:domainTypes.<id>` | `v1:domainTypes.circle` | ✓ Registry | Metadata |

---

## 8. CONSTRAINTS AND LIMITATIONS

### 8.1 User-Facing Access

**Expressions can access**:
- ✓ Block outputs: `v1:blocks.my_circle.outputs.radius`
- ✓ Input ports (via wiring): `v1:blocks.my_circle.inputs.angle`

**Expressions cannot access** (by design):
- ✗ Edge properties (combineMode, sortKey, role)
- ✗ Adapter details
- ✗ Domain intrinsics (instance properties)
- ✗ System blocks and internals

*Rationale*: Expression inputs are equivalent to wiring blocks together. Only block outputs are exposed.

### 8.2 Canonical Name Constraints

**Uniqueness**: Canonical names must be unique per patch
- Collision examples (illegal):
  - `My Block!` and `My block` (both → `my_block`)
  - `My Block` and `My Block ` (space handling)
- Validation: `validateDisplayNameUniqueness(patch)` enforces this

**Format**: Deterministic and reversible (with metadata)
- Cannot recover original displayName from canonical name alone
- Original stored in Patch (Block.displayName)

### 8.3 Addressability Does NOT Mean Accessibility

**Key principle**: Everything is addressable for tooling/errors, but only intended elements are accessible from user code.

**Examples**:
- Adapter blocks are addressable (good error messages) but not directly usable
- Domain intrinsics are addressable (for debugging) but read-only
- Edge properties are addressable (for diagnostics) but immutable from expressions

---

## 9. IMPLEMENTATION CHECKLIST

- [ ] Canonical name normalization function (single source of truth)
- [ ] Canonical name collision detection and validation
- [ ] CanonicalAddress type covering all element types
- [ ] addressToString() for all address types
- [ ] parseAddress() for all address types (with version support)
- [ ] Address registry with O(1) lookup
- [ ] Error message generation using addresses
- [ ] Domain instance addressing in runtime
- [ ] Intrinsic property addressing in compiler
- [ ] Tests for all address formats
- [ ] Migration path for v1 → v2 format changes

---

## 10. FUTURE EXTENSIBILITY

**Current version**: v1
**Migration strategy**: If format changes needed, introduce new version (v2)
- Existing v1 addresses can coexist with v2
- Migration path: v1 → v2 converter
- Metadata versioning: Parse function checks `v1:`, `v2:` prefix

