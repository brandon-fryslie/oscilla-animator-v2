# PathField Enhancement - Technical Exploration

**Task**: oscilla-animator-v2-4h6 - Enhance PathField with tangent and arc length properties
**Explored**: 2026-01-25
**Explorer**: Code exploration agent

## Investigation Summary

This document captures the detailed technical exploration of how to add tangent and arc length computation to the PathField block. It serves as the research foundation for the implementation plan.

---

## 1. Current PathField Implementation

**Location**: `src/blocks/path-operators-blocks.ts` (lines 14-101)

**Current Functionality**:
- Block name: PathField
- Summary: "Path control point properties"
- Takes controlPoints field (Field<vec2> over DOMAIN_CONTROL)
- Outputs:
  - position: Pass-through of input field
  - index: Intrinsic field (element index 0, 1, 2, ...)

**Deferred Features** (documented in code):
Lines 27-29 explicitly comment:
```
// Future: tangent, arcLength
// - tangent: Field<vec2> - direction at each control point
// - arcLength: Field<float> - cumulative distance from start
// Requires: Path-aware kernel system (not in current IR)
```

**Block Registration Pattern**:
```typescript
export const PathField = defineBlock({
  name: 'PathField',
  inputs: { controlPoints: ... },
  outputs: { position: ..., index: ... },
  lower(ctx, block) {
    // Block receives LowerCtx with access to:
    // - ctx.getInput(block, 'controlPoints') - get input from bus
    // - ctx.b - IRBuilder for creating IR nodes
    // - ctx.setOutput(block, 'position', exprId) - set output
  }
});
```

**Instance Creation Pattern**:
```typescript
const controlInstance = ctx.b.createInstance(
  DOMAIN_CONTROL,
  controlPointsInput.count,  // Element count
  'static'
);

const indexField = ctx.b.fieldIntrinsic(controlInstance, 'index', type);
```

---

## 2. Field Kernel System Architecture

**Location**: `src/runtime/FieldKernels.ts`

**Kernel Dispatch**:
```typescript
export function applyFieldKernel(
  out: ArrayBufferView,
  inputs: ArrayBufferView[],
  fieldOp: string,      // Kernel name: 'fieldPolarToCartesian', 'makeVec2', etc.
  N: number,            // Element count
  _type: SignalType
): void {
  switch (fieldOp) {
    case 'makeVec2':
      applyMakeVec2(out, inputs[0], inputs[1], N);
      break;
    case 'fieldPolarToCartesian':
      applyPolarToCartesian(out, inputs[0], inputs[1], inputs[2], inputs[3], N);
      break;
    // ... 20+ kernels ...
  }
}
```

**Key Characteristics**:
1. **Stateless**: Kernels are pure functions
2. **Buffer-oriented**: No object/class data structures
3. **Element-count parameterized**: `N` is the only metadata
4. **No topology information**: Cannot inspect domain, instance, or shape structure
5. **Strictly typed**: Input/output types checked via TypeScript

**Example Kernel** (fieldPolarToCartesian):
```typescript
function applyPolarToCartesian(
  out: ArrayBufferView,
  centerX: ArrayBufferView,
  centerY: ArrayBufferView,
  r: ArrayBufferView,
  theta: ArrayBufferView,
  N: number
): void {
  const outVec2 = out as Float32Array;
  const cxArr = centerX as Float32Array;
  const cyArr = centerY as Float32Array;
  const rArr = r as Float32Array;
  const thetaArr = theta as Float32Array;

  for (let i = 0; i < N; i++) {
    const cx = cxArr[i];
    const cy = cyArr[i];
    const rval = rArr[i];
    const theta = thetaArr[i];
    outVec2[i * 2] = cx + rval * Math.cos(theta);
    outVec2[i * 2 + 1] = cy + rval * Math.sin(theta);
  }
}
```

**Why Kernels Can't Access Topology**:
- Kernels receive only: `out`, `inputs[]`, `N`, `type`
- No registry, no instance metadata, no domain information
- Design philosophy: kernels are portable mathematical operations
- Enables: kernel reuse across different domain contexts

---

## 3. PathTopologyDef Structure

**Location**: `src/shapes/types.ts` (lines 144-153)

**Definition**:
```typescript
export interface PathTopologyDef extends TopologyDef {
  readonly verbs: readonly PathVerb[];           // MOVE, LINE, CUBIC, QUAD, CLOSE
  readonly pointsPerVerb: readonly number[];     // Points consumed per verb
  readonly totalControlPoints: number;           // Total number of points
  readonly closed: boolean;                      // Is path closed?
}

export type PathVerb = 'MOVE' | 'LINE' | 'CUBIC' | 'QUAD' | 'CLOSE';
```

**Example PathTopologyDef** (for triangle):
```typescript
{
  id: TOPOLOGY_ID_TRIANGLE,
  verbs: ['MOVE', 'LINE', 'LINE', 'CLOSE'],
  pointsPerVerb: [1, 1, 1, 0],
  totalControlPoints: 3,
  closed: true,
}
```

**Where This Information Exists**:
1. **At compile time**: Block lowering has access to block definitions
   - Available in: `src/blocks/` during lowering
   - NOT available in: LowerCtx (context doesn't expose registry)

2. **At topology registration time**: When procedural paths are created
   - Location: `src/shapes/registry.ts` - registerDynamicTopology()
   - Only accessible during compilation, not at runtime

3. **NOT at materialization time**: When fields are evaluated
   - Materializer only receives: FieldExprId, InstanceDecl, buffer pool
   - No access to: topology registry, shape definitions, verb sequences

**Critical Gap**: The verb sequence needed to distinguish "is point i a line endpoint or cubic control point?" exists only at compile time.

---

## 4. Intrinsic System Architecture

**Location**: `src/compiler/ir/types.ts` (lines 174-177) and `src/runtime/Materializer.ts` (lines 409-452)

**Closed Union Type**:
```typescript
export type IntrinsicPropertyName =
  | 'index'
  | 'normalizedIndex'
  | 'randomId';
```

**How Intrinsics Are Materialized** (Materializer.ts):
```typescript
function fillBufferIntrinsic(
  intrinsic: IntrinsicPropertyName,
  buffer: ArrayBufferView,
  instance: InstanceDecl
): void {
  const N = typeof instance.count === 'number' ? instance.count : 0;
  const arr = buffer as Float32Array;

  switch (intrinsic) {
    case 'index': {
      for (let i = 0; i < N; i++) {
        arr[i] = i;
      }
      break;
    }
    case 'normalizedIndex': {
      const normalized = N <= 1 ? 0 : 1 / (N - 1);
      for (let i = 0; i < N; i++) {
        arr[i] = i * normalized;
      }
      break;
    }
    case 'randomId': {
      for (let i = 0; i < N; i++) {
        const val = Math.sin(i * 12.9898) * 43758.5453;
        arr[i] = val % 1.0;
      }
      break;
    }
    default: {
      const _exhaustive: never = intrinsic;
      throw new Error(`Unknown intrinsic: ${_exhaustive}`);
    }
  }
}
```

**Intrinsic Constraints**:
1. **Pure per-element computation**: Each `arr[i]` computed independently from index `i` alone
2. **No neighbor access**: Cannot read `arr[i-1]` or `arr[i+1]`
3. **No cumulative state**: Cannot maintain running total (arc length needs this)
4. **No domain knowledge**: Cannot check "what domain is this instance for?"

**Why Tangent/ArcLength Can't Be Intrinsics**:
- Tangent[i] = (controlPoints[i+1] - controlPoints[i-1]) / 2
  - Requires reading neighbors → violates "per-element only"
- ArcLength[i] = sum of distances from 0 to i
  - Requires cumulative state → violates "independent computation"
- PathTopologyDef would let us know point structure → not available in intrinsics

---

## 5. Instance and Domain Tracking

**Location**: `src/compiler/ir/IRBuilderImpl.ts` (lines 47-95)

**InstanceDecl Interface**:
```typescript
export interface InstanceDecl {
  readonly id: string;              // Unique instance ID
  readonly domainType: string;      // DomainTypeId ('control', 'circle', etc.)
  readonly count: number;           // Element count (might be signal-dependent)
  readonly lifecycle: 'static' | 'dynamic' | 'pooled';
  readonly identityMode: 'stable' | 'none';
  readonly elementIdSeed?: number;
}
```

**Instance Creation** (from ProceduralStar block):
```typescript
const controlInstance = ctx.b.createInstance(
  DOMAIN_CONTROL,
  { kind: 'signal', signal: sidesSignal },  // Count from signal
  'static'
);
```

**Instance Inference** (IRBuilderImpl.ts:297-343):
```typescript
inferFieldInstance(fieldId: FieldExprId): InstanceId | undefined {
  const expr = this.getFieldExpr(fieldId);

  switch (expr.kind) {
    case 'intrinsic':
    case 'array':
    case 'layout':
      return expr.instanceId;  // Bound to specific instance

    case 'map':
      return this.inferFieldInstance(expr.input);  // Propagate from input

    case 'zipSig':
      return this.inferFieldInstance(expr.input);  // Propagate from input

    case 'zip': {
      const inst0 = this.inferFieldInstance(expr.inputs[0]);
      const inst1 = this.inferFieldInstance(expr.inputs[1]);
      if (inst0 !== inst1) {
        throw new Error(`Cannot zip fields from different instances`);
      }
      return inst0;
    }

    case 'const':
    case 'broadcast':
      return undefined;  // Instance-agnostic

    default: {
      const _exhaustive: never = expr;
      throw new Error(`Unknown field expr: ${_exhaustive}`);
    }
  }
}
```

**Key Insight**: Instance binding enables the compiler to track:
- Which instance a field operates over
- Element count for that instance
- Domain type for that instance
- These facts are available at materialization time via `instances` map

**How This Helps**: If we add a new field expression kind `fieldPathDerivative`:
```typescript
case 'pathDerivative':
  return this.inferFieldInstance(expr.input);  // Inherit from control points field
```

Then Materializer knows:
- Which instance (controlPoints instance)
- Element count (N)
- Domain type (DOMAIN_CONTROL)

But still NOT: the verb sequence, which points are which verb type.

---

## 6. Data Flow: Lowering to Materialization

**Block Lowering** (PathField block):
```typescript
lower(ctx: LowerCtx, block: BlockInstance) {
  // Input: Bus<Field<vec2>>
  const controlPointsInput = ctx.getInput(block, 'controlPoints');
  const controlPointsExpr = ctx.inputToBus(controlPointsInput);  // FieldExprId

  // At this point we know:
  // - controlPointsExpr: FieldExprId (abstract IR reference)
  // - Type: { payload: 'vec2', unit: 'control', cardinality: 'field' }
  //
  // We DON'T know:
  // - PathTopologyDef structure
  // - Whether it's a procedural shape, static path, etc.
  //
  // We CAN'T know:
  // - Instance count (might be signal-dependent)
  // - Control points actual data (not materialized yet)

  // Output: Set IR expression for each output
  ctx.setOutput(block, 'position', controlPointsExpr);
}
```

**Compiler Passes** (Types → Dependency Graph → Schedule):
```typescript
// Pass 1-5: Process IR, resolve types, build schedule
// Output: ScheduleStep with field references
//
// At this stage:
// - Types are resolved
// - Instances are identified
// - But topology information is not needed
```

**Materialization** (Runtime):
```typescript
function materializeField(
  fieldId: FieldExprId,
  instanceId: string,
  fields: readonly FieldExpr[],
  signals: readonly SigExpr[],
  instances: ReadonlyMap<string, InstanceDecl>,  // Instance metadata
  state: RuntimeState,  // Signal values
  pool: BufferPool
): ArrayBufferView {
  const expr = fields[fieldId];
  const instance = instances.get(instanceId);
  const N = typeof instance.count === 'number' ? instance.count : 0;

  switch (expr.kind) {
    case 'intrinsic':
      // Can only compute from index (i)
      return fillBufferIntrinsic(expr.intrinsic, buffer, instance);

    case 'source':
      // Read from signal state
      return readSignalBuffer(expr.sourceId, state);

    case 'map':
      // Evaluate kernel on input field
      return applyFieldKernel(buffer, [input], expr.kernel, N, type);

    // At this point, what do we have?
    // - Instance count (N)
    // - Instance domain type (DOMAIN_CONTROL)
    // - Input field buffers (control points)
    // - Type information
    //
    // What DON'T we have?
    // - TopologyDef (not in InstanceDecl)
    // - Verb sequence
    // - Which points are which verb type
  }
}
```

**Critical Realization**: Topology information flows from block definitions → block lowering → IR → but NOT further downstream to materialization.

---

## 7. Three Possible Architectural Approaches

### APPROACH A: Field Kernels with Topology Context

**Concept**: Pass topology information to kernels via context parameter

**Changes Required**:

1. **Extend IRBuilder to capture topology**:
   ```typescript
   // In block lowering (PathField)
   // Block can access topology at this time
   const controlPointsSignal = ctx.inputToBus(inputPort);
   const topologyId = somehow_get_topology(controlPointsSignal);  // ???
   // But LowerCtx doesn't provide shape registry access
   ```

2. **Thread topology through IR**:
   ```typescript
   export interface FieldExprWithTopology {
     readonly kind: 'kernelWithTopology';
     readonly kernel: string;
     readonly topologyId: TopologyId;  // Pass topology through IR
     readonly inputs: FieldExprId[];
   }
   ```

3. **Update kernel dispatch**:
   ```typescript
   export function applyFieldKernel(
     out: ArrayBufferView,
     inputs: ArrayBufferView[],
     fieldOp: string,
     N: number,
     topologyId?: TopologyId,  // NEW
     registry?: Map<TopologyId, TopologyDef>  // NEW
   ): void {
     // Kernels now stateful (depend on topology)
   }
   ```

4. **Kernels inspect topology**:
   ```typescript
   case 'tangentWithTopology':
     const topo = registry.get(topologyId);
     for (let i = 0; i < N; i++) {
       // Compute tangent, checking verb type from topo
     }
   ```

**Analysis**:
- ❌ Kernels lose purity (become stateful)
- ❌ Topology lookup needed on every kernel call
- ❌ Topology information must be captured at block lowering
  - LowerCtx doesn't expose shape registry
  - Would need to add registry access to LowerCtx
  - Couples block lowering to shape system
- ✅ Fully supports bezier curves and complex topologies
- ✅ Natural extension point for future enhancements

**Verdict**: Architecturally invasive. Requires coupling block system to shape registry.

---

### APPROACH B: Field Expression Derivatives (RECOMMENDED)

**Concept**: New field expression kind that materializes derivatives from buffered inputs

**Changes Required**:

1. **Add new IR kind**:
   ```typescript
   export interface FieldExprPathDerivative {
     readonly kind: 'pathDerivative';
     readonly input: FieldExprId;  // Source field (control points)
     readonly operation: 'tangent' | 'arcLength';
     readonly type: SignalType;
   }
   ```

2. **Add to FieldExpr union**:
   ```typescript
   export type FieldExpr =
     | FieldExprConst | FieldExprSource | FieldExprIntrinsic
     | FieldExprArray | FieldExprLayout | FieldExprMap
     | FieldExprZip | FieldExprZipSig
     | FieldExprPathDerivative;  // NEW
   ```

3. **Add IRBuilder method**:
   ```typescript
   fieldPathDerivative(
     input: FieldExprId,
     operation: 'tangent' | 'arcLength',
     type: SignalType
   ): FieldExprId {
     const id = this.allocFieldId();
     this.fieldExprs.push({ kind: 'pathDerivative', input, operation, type });
     return id;
   }
   ```

4. **Update instance inference**:
   ```typescript
   case 'pathDerivative':
     return this.inferFieldInstance(expr.input);  // Same instance as input
   ```

5. **Materialize in Materializer**:
   ```typescript
   function fillBufferPathDerivative(
     out: ArrayBufferView,
     input: ArrayBufferView,
     operation: 'tangent' | 'arcLength'
   ): void {
     const N = input.byteLength / (2 * 4);  // vec2 = 2 floats

     if (operation === 'tangent') {
       // Tangent[i] = (input[i+1] - input[i-1]) / 2
       const outArr = out as Float32Array;
       const inArr = input as Float32Array;
       for (let i = 0; i < N; i++) {
         const prev = i === 0 ? N - 1 : i - 1;
         const next = (i + 1) % N;
         outArr[i*2] = (inArr[next*2] - inArr[prev*2]) / 2;
         outArr[i*2+1] = (inArr[next*2+1] - inArr[prev*2+1]) / 2;
       }
     } else if (operation === 'arcLength') {
       // ArcLength[i] = sum of distances from 0 to i
       const outArr = out as Float32Array;
       const inArr = input as Float32Array;
       outArr[0] = 0;
       let total = 0;
       for (let i = 1; i < N; i++) {
         const dx = inArr[i*2] - inArr[(i-1)*2];
         const dy = inArr[i*2+1] - inArr[(i-1)*2+1];
         total += Math.sqrt(dx*dx + dy*dy);
         outArr[i] = total;
       }
     }
   }
   ```

6. **Use in PathField block**:
   ```typescript
   lower(ctx, block) {
     const controlPoints = ctx.inputToBus(ctx.getInput(block, 'controlPoints'));

     ctx.setOutput(block, 'position', controlPoints);
     ctx.setOutput(block, 'index',
       ctx.b.fieldIntrinsic(instanceId, 'index', type)
     );

     // NEW outputs
     ctx.setOutput(block, 'tangent',
       ctx.b.fieldPathDerivative(controlPoints, 'tangent', vecType)
     );
     ctx.setOutput(block, 'arcLength',
       ctx.b.fieldPathDerivative(controlPoints, 'arcLength', floatType)
     );
   }
   ```

**Analysis**:
- ✅ Maintains kernel purity
- ✅ Changes localized to 3 files (types, IRBuilder, Materializer, PathField)
- ✅ No new coupling introduced
- ✅ Extensible (easy to add curvature, normal, etc.)
- ✅ Instance inference handles naturally
- ✅ Works for MVP (polygonal paths with linear interpolation)
- ⚠️ Limited to linear approximation (bezier curves need Approach A)
- ⚠️ Makes assumptions about element layout (assumes vec2 for input)

**Verdict**: **RECOMMENDED**. Best MVP solution with clean architecture.

---

### APPROACH C: Pre-computed Topology Metadata (BAKED DATA)

**Concept**: Compute tangent/arcLength at compile time, bake into constant fields

**Changes Required**:

1. **Block captures control point data at lower time**:
   ```typescript
   // If control points are constant (can happen for demo/test)
   const controlPointsData = get_constant_value(controlPointsExpr);
   const tangents = compute_tangents(controlPointsData);
   const arcLengths = compute_arclengths(controlPointsData);

   ctx.setOutput(block, 'tangent',
     ctx.b.fieldConst(tangents, type)
   );
   ```

2. **No changes to IR or Materializer**

**Analysis**:
- ✅ Zero runtime overhead
- ✅ Works for both polygons and curves (if computed offline)
- ❌ Only works when control points are compile-time constants
- ❌ Defeats purpose of live animation (can't change control points)
- ❌ Not general solution
- ❌ Requires knowing control point data during lowering

**Verdict**: Not suitable for MVP (animations are dynamic).

---

## 8. Architecture Decision Matrix

| Criterion | A (Topology Context) | B (Field Derivatives) | C (Baked Data) |
|-----------|---|---|---|
| Maintains kernel purity | ❌ | ✅ | ✅ |
| Changes localized | ❌ (affects kernel dispatch) | ✅ | ⚠️ (one file) |
| No new coupling | ❌ | ✅ | ✅ |
| Extensible | ✅ | ✅ | ❌ |
| Supports dynamic paths | ✅ | ✅ | ❌ |
| MVP-ready | ⚠️ | ✅ | ❌ |
| Works for bezier curves | ✅ | ❌ (linear only) | ✅ (if computed offline) |
| Implementation complexity | High | Medium | Low |
| Risk level | High | Low | Low |
| Architectural debt | Possible | None | None |

**RECOMMENDATION**: **Approach B (Field Derivatives)**

**Rationale**:
1. Minimal architectural impact
2. Clean separation of concerns (kernels stay pure)
3. Easy to test in isolation
4. MVP-appropriate (linear approximation is sufficient for polygons)
5. Future-proof (Approach A can be added later if bezier support needed)
6. No coupling between systems introduced

---

## 9. Materialization Implementation Details

### Tangent Computation (Central Difference)

```typescript
// Input: control points Field<vec2> over DOMAIN_CONTROL
// Output: tangent Field<vec2> over same domain
//
// Assumptions:
// - Closed polygonal path (first and last points are adjacent)
// - Control points are evenly or unevenly spaced
//
// Tangent at point i is the average direction to neighbors:
// tangent[i] = (point[i+1] - point[i-1]) / 2
//
// Edge handling:
// - Point 0 sees point[N-1] as previous
// - Point N-1 sees point[0] as next
//
// Examples:
// Triangle [(0,0), (1,0), (0.5,1)]:
//   tangent[0] = ((1,0) - (0.5,1)) / 2 = (0.25, -0.5)  → toward vertex 1
//   tangent[1] = ((0.5,1) - (0,0)) / 2 = (0.25, 0.5)   → toward vertex 2
//   tangent[2] = ((0,0) - (1,0)) / 2 = (-0.5, 0)       → toward vertex 0
//
// Square [(-1,-1), (1,-1), (1,1), (-1,1)]:
//   tangent[0] = ((1,-1) - (-1,1)) / 2 = (1, -1)
//   tangent[1] = ((1,1) - (-1,-1)) / 2 = (1, 1)
//   tangent[2] = ((-1,1) - (1,-1)) / 2 = (-1, 1)
//   tangent[3] = ((-1,-1) - (1,1)) / 2 = (-1, -1)
//   (All point outward from center)
```

**Tangent Properties**:
- Direction: Points "outward" along path for convex polygons
- Magnitude: Depends on point spacing (farther apart → larger magnitude)
- Continuity: Proportional to change in direction (smooth curves → smooth tangents)

**Normalization Options**:
1. **As-is** (current plan): Magnitude varies, useful for "speed along path"
2. **To unit vector**: Normalize each tangent to length 1
3. **Parameterized**: User selects via block parameter

### Arc Length Computation (Cumulative Distance)

```typescript
// Input: control points Field<vec2> over DOMAIN_CONTROL
// Output: arcLength Field<float> over same domain
//
// Arc length is cumulative Euclidean distance:
// arcLength[0] = 0
// arcLength[i] = arcLength[i-1] + distance(point[i-1], point[i])
//
// Examples:
// Square [(0,0), (1,0), (1,1), (0,1)] (perimeter 4):
//   arcLength[0] = 0
//   arcLength[1] = 0 + 1 = 1
//   arcLength[2] = 1 + 1 = 2
//   arcLength[3] = 2 + 1 = 3
//
// Triangle [(0,0), (1,0), (0.5,1)] (perimeter ≈ 3.236):
//   arcLength[0] = 0
//   arcLength[1] = 0 + 1 = 1
//   arcLength[2] = 1 + sqrt(0.5^2 + 1^2) = 1 + 1.118 = 2.118
//   (Note: does NOT wrap back to first point)
//
// Single point path:
//   arcLength[0] = 0
```

**Arc Length Properties**:
- Monotonic: Always increasing (or flat)
- Physical: Represents actual distance traveled
- Not normalized: Depends on point spacing and scale

**Normalization Options**:
1. **As-is** (current plan): Cumulative distance 0 to total length
2. **Normalized to [0,1]**: Divide by total path length
3. **Parameterized**: User selects

### Edge Cases

**Single-point path**:
```typescript
// N = 1, point at (x, y)
// tangent[0] = (0, 0)  // No direction
// arcLength[0] = 0     // No distance
```

**Two-point path**:
```typescript
// N = 2, points at (0,0) and (1,0)
// tangent[0] = ((1,0) - (1,0)) / 2 = (0, 0)  // Wraps to self
// tangent[1] = ((0,0) - (0,0)) / 2 = (0, 0)  // Wraps to self
// arcLength[0] = 0
// arcLength[1] = 0 + 1 = 1
```

**Degenerate path** (all points identical):
```typescript
// All points at (0, 0)
// tangent[i] = (0, 0) for all i
// arcLength[i] = 0 for all i
```

**Very large polygons**:
```typescript
// N = 10000 points
// Cumulative distance could exceed float precision
// Consider: normalize to [0, 1] to avoid large numbers
```

---

## 10. Test Strategy

### Unit Tests

**Tangent Computation**:
1. Regular polygon (triangle, square, pentagon)
   - Verify tangent points in correct direction
   - Verify magnitude relates to vertex spacing
2. Irregular polygon
   - Verify tangent at each vertex
   - Verify wrapping at endpoints
3. Edge cases
   - Single-point path: tangent = [0, 0]
   - Two-point path: tangent = [0, 0] (wraps to self)
   - Degenerate path (all points same): tangent = [0, 0]

**Arc Length Computation**:
1. Known perimeter paths
   - Unit square: [0, 1, 2, 3]
   - Unit triangle: [0, 1, ≈2.118, ≈3.236]
2. Monotonicity
   - arcLength[i] ≤ arcLength[i+1] always
3. Distance correctness
   - arcLength[i+1] - arcLength[i] = distance(points[i], points[i+1])
4. Edge cases
   - Single-point: [0]
   - Two-point: [0, distance]

### Integration Tests

1. **Full pipeline**:
   - ProceduralStar → PathField (position, index, tangent, arcLength) → downstream

2. **Type checking**:
   - All outputs have correct types
   - Instance binding is consistent

3. **Materialization**:
   - Values present in RuntimeState after frame execution
   - Can connect to downstream blocks

### Acceptance Tests

1. **Visual verification**:
   - Create polygon in editor
   - Verify tangent vectors point along polygon edges
   - Verify arc length increases monotonically
   - Verify values update when control points change

---

## 11. Specification Compliance

**Spec Reference**: design-docs/CANONICAL-oscilla-v2.5-20260109/

**Relevant Sections**:
- **Field System** (section on FieldExpr)
  - Adds new FieldExpr kind ✓
  - Maintains field expression semantics ✓

- **Block Library** (PathField block)
  - Extends existing block with new outputs ✓
  - No spec changes required ✓

- **Materialization** (runtime field evaluation)
  - Adds new case to Materializer.fillBuffer ✓
  - Integrates cleanly with existing system ✓

**No Spec Changes Needed**: This is a pure implementation feature within existing architectural boundaries.

---

## 12. Performance Considerations

### Materialization Cost

**Tangent computation** (per frame):
```
for i in 0..N:
  read 2 floats (prev point)
  read 2 floats (next point)
  compute difference and divide
  write 2 floats
Cost: O(N), 2 vector subtractions + 1 division per element
```

**Arc length computation** (per frame):
```
for i in 0..N:
  read 2 floats (current point)
  read 2 floats (previous point)
  compute distance (sqrt of sum of squares)
  write 1 float
Cost: O(N), 1 sqrt per element
```

**Optimization opportunities**:
1. **Buffer pooling**: Reuse tangent/arcLength buffers across frames
2. **Lazy evaluation**: Only materialize if outputs are consumed
3. **SIMD**: Vectorize distance computation (currently scalar)

**For MVP**: Current implementation is acceptable; optimization deferred if profiling shows issue.

---

## 13. Future Enhancement Paths

### Bezier Curve Support (Approach A Migration)

When procedural paths with bezier curves are added:
1. Block lowering captures TopologyDef
2. Introduce FieldExprPathDerivativeWithTopology variant
3. Materializer uses topology structure for accurate derivative computation
4. Existing polygonal paths continue using linear approximation

### Additional Path Properties

Extensible via new operations in FieldExprPathDerivative:
- `'curvature'`: Rate of direction change
- `'normal'`: Perpendicular to tangent
- `'derivative'`: Rate of change of arc length
- `'secondDerivative'`: Acceleration along path

### Open Path Support

Currently assumes closed paths. Future:
- Add `closed: boolean` parameter to fillBufferPathDerivative
- Handle endpoints differently for open paths

---

## 14. Related Implementation Examples

### Similar Pattern: FieldExprMap

```typescript
// In IRBuilder
fieldMap(input: FieldExprId, kernel: string, type: SignalType): FieldExprId {
  // Just like our fieldPathDerivative
}

// In Materializer
case 'map': {
  const inputBuffer = materialize(expr.input, ...);
  applyFieldKernel(out, [inputBuffer], expr.kernel, N, type);
  break;
}
```

### Similar Pattern: FieldExprZipSig

```typescript
// Multiple inputs from different sources
export interface FieldExprZipSig {
  readonly kind: 'zipSig';
  readonly input: FieldExprId;
  readonly signal: SigExprId;
  readonly operation: 'combine';
}

// In Materializer
case 'zipSig': {
  const field = materialize(expr.input, ...);
  const signal = evaluateSignal(expr.signal, ...);
  combineFieldAndSignal(out, field, signal);
  break;
}
```

**Our pattern follows existing conventions** for new field expression kinds.

---

## Conclusion

**Field Expression Derivatives (Approach B)** is the recommended solution because:

1. **Minimal architectural impact**: Changes to 3 files, no system coupling
2. **Maintains design principles**: Kernels stay pure, IRs are independent
3. **MVP-ready**: Works well for polygonal paths with linear approximation
4. **Future-proof**: Can migrate to Approach A for bezier curves later
5. **Easy to test and verify**: Isolated logic in Materializer
6. **Extensible**: Natural place to add new path properties (curvature, normal, etc.)

The implementation plan is detailed in PLAN-20260125-tangent-arclen.md, with 5 phases covering types, IRBuilder, Materializer, PathField block, and testing.
