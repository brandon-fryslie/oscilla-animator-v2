# Sprint: utility-blocks - Noise, Length, Normalize (U-8)
Generated: 2026-01-26T10:15:00Z
Confidence: HIGH: 3, MEDIUM: 0, LOW: 0
Status: COMPLETE
Source: EVALUATION-20260126-101500.md
Completed: 2026-01-26T17:00:00Z

## Sprint Goal
Implement the three U-8 MVP utility math blocks: Noise (procedural noise), Length (vector magnitude), and Normalize (unit vector). All are pure, stateless, cardinality-generic blocks.

## Scope
**Deliverables:**
- Noise block: deterministic procedural noise float→float
- Length block: vec2/vec3 → float magnitude
- Normalize block: vec2/vec3 → vec2/vec3 unit vector
- Tests for all three blocks (compilation + runtime behavior)
- OpCode additions as needed (Length, Normalize)

## Work Items

### [P0] Noise Block - Procedural Noise (HIGH confidence)

**Dependencies**: None — `noise1` kernel already exists in runtime spec, Hash block provides pattern
**Spec Reference**: 02-block-system.md L379 (MVP block #6), 05-runtime.md L530 (noise1 kernel)

#### Description
Implement a pure math block producing procedural noise. Input: any float (seed/coordinate). Output: deterministic float in [0, 1). This is essentially the Hash block with a different label and noise-specific semantics. The `noise1` kernel is already specified in the runtime.

The block is:
- Category: `math`
- Capability: `pure`
- Cardinality-generic: yes (laneLocal, preserve)
- NOT payload-generic (float→float only)

#### Inputs
- `x` (float): Input coordinate/seed value

#### Outputs
- `out` (float): Noise value in [0, 1)

#### Acceptance Criteria
- [ ] Block registered as type `'Noise'` with `capability: 'pure'`
- [ ] Category: 'math', form: 'primitive'
- [ ] Input: `x` (float signal)
- [ ] Output: `out` (float signal)
- [ ] Uses OpCode.Hash or a new noise-specific opcode for deterministic noise generation
- [ ] Output is deterministic given same input
- [ ] Output range is [0, 1)
- [ ] Cardinality metadata: cardinalityMode: 'preserve', laneCoupling: 'laneLocal'
- [ ] Tests: compilation succeeds, output in range [0,1), deterministic for same input

#### Technical Notes
- Follow Hash block pattern exactly (signal-blocks.ts:425-475)
- May reuse OpCode.Hash directly if noise1 ≡ hash semantics
- If different noise semantics needed, add OpCode.Noise to enum
- Goes in `src/blocks/math-blocks.ts` alongside Add/Multiply

---

### [P1] Length Block - Vector Magnitude (MEDIUM confidence)

**Dependencies**: Need to add OpCode for vector length or implement via component decomposition
**Spec Reference**: 02-block-system.md L496 (Length: {vec2, vec3} → float, reduction-like)

#### Description
Implement a pure math block computing Euclidean vector length. Input: vec2 or vec3. Output: float scalar (magnitude). This is a "reduction-like" operation — it reduces a vector to a scalar.

The block is:
- Category: `math`
- Capability: `pure`
- Cardinality-generic: yes (laneLocal, preserve)
- Payload-specific: vec2/vec3 input → float output (NOT valid for float input)

#### Inputs
- `v` (vec2 or vec3): Input vector

#### Outputs
- `out` (float): Euclidean magnitude (sqrt(x² + y² [+ z²]))

#### Unknowns to Resolve
1. **OpCode approach**: Add a new OpCode.Length? Or decompose into OpCode.Mul + OpCode.Add + OpCode.Sqrt?
2. **Payload dispatch**: How does the lowering handle vec2 vs vec3? Is this a single block with payload-variant lowering, or two blocks (LengthVec2, LengthVec3)?
3. **Stride-aware computation**: vec2 has stride=2, vec3 has stride=3. The lowering needs to access individual components. How do existing blocks handle multi-component payloads?

#### Exit Criteria (to raise to HIGH)
- Determine whether to add OpCode.Length or decompose
- Understand how multi-component payloads are accessed in lowering functions
- Decide single block vs two blocks for vec2/vec3

#### Acceptance Criteria
- [ ] Block(s) registered for Length operation
- [ ] Accepts vec2 and/or vec3 input
- [ ] Output is float scalar (magnitude)
- [ ] Correctly computes sqrt(x² + y²) for vec2
- [ ] Correctly computes sqrt(x² + y² + z²) for vec3
- [ ] Does NOT accept float input (spec explicitly forbids this)
- [ ] Tests: compilation, correct magnitude for known vectors

---

### [P1] Normalize Block - Unit Vector (MEDIUM confidence)

**Dependencies**: Same unknowns as Length (component access, payload dispatch)
**Spec Reference**: 02-block-system.md L497 (Normalize: {vec2, vec3}, homogeneous unary)

#### Description
Implement a pure math block producing a unit vector (normalized to magnitude 1.0). Input: vec2 or vec3. Output: same type as input, with magnitude 1.0. This is a "homogeneous unary" operation — T → T.

The block is:
- Category: `math`
- Capability: `pure`
- Cardinality-generic: yes (laneLocal, preserve)
- Payload-specific: vec2→vec2 or vec3→vec3 (NOT valid for float input)

#### Inputs
- `v` (vec2 or vec3): Input vector

#### Outputs
- `out` (same as input type): Unit vector (v / |v|)

#### Unknowns to Resolve
1. **OpCode approach**: Add OpCode.Normalize? Or compose from Length + Div?
2. **Zero vector handling**: What happens when |v| = 0? Return zero vector, or return some sentinel?
3. **Same unknowns as Length** regarding payload dispatch and component access

#### Exit Criteria (to raise to HIGH)
- Determine OpCode strategy (same decision as Length)
- Decide zero-vector behavior
- Understand payload dispatch mechanism

#### Acceptance Criteria
- [ ] Block(s) registered for Normalize operation
- [ ] Accepts vec2 and/or vec3 input
- [ ] Output is same type as input
- [ ] Output has magnitude ~1.0 for non-zero inputs
- [ ] Does NOT accept float input (spec explicitly forbids this)
- [ ] Zero-vector edge case handled (no NaN/Inf)
- [ ] Tests: compilation, correct normalization for known vectors

---

## Dependencies
- Noise: No dependencies. Can be implemented immediately.
- Length/Normalize: Need investigation into multi-component payload access patterns in the lowering layer. May require new OpCodes in the IR.

## Risks
- **MEDIUM**: Length and Normalize require understanding how the IR handles vector component access. The current OpCode enum is scalar-oriented. Vector operations may need a different approach (kernel functions vs OpCodes).
- **LOW**: Noise is straightforward — essentially a relabeled Hash with noise semantics.
- **LOW**: Zero-vector edge case in Normalize needs a decision (spec doesn't specify).
