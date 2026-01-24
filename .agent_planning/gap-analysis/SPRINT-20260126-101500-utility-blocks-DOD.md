# Definition of Done: utility-blocks (U-8)
Generated: 2026-01-26T10:15:00Z
Status: PARTIALLY READY (Noise is HIGH confidence; Length/Normalize are MEDIUM)
Plan: SPRINT-20260126-101500-utility-blocks-PLAN.md
Source: EVALUATION-20260126-101500.md

## Acceptance Criteria

### Noise Block

- [ ] `src/blocks/math-blocks.ts` contains a `registerBlock` call for type `'Noise'`
- [ ] BlockDef has `capability: 'pure'` (NOT stateful)
- [ ] BlockDef has `category: 'math'`, `form: 'primitive'`
- [ ] BlockDef has cardinality metadata: `cardinalityMode: 'preserve'`, `laneCoupling: 'laneLocal'`
- [ ] Input port: `x` (float signal)
- [ ] Output port: `out` (float signal)
- [ ] Lowering produces deterministic output for same input
- [ ] Output is in range [0, 1)
- [ ] Test: compilation succeeds
- [ ] Test: same input produces same output (deterministic)
- [ ] Test: output is in [0, 1) range for various inputs
- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes (all existing + new tests)

### Length Block

- [ ] Block registered for vector magnitude computation
- [ ] Accepts vec2 input, produces float output
- [ ] Accepts vec3 input, produces float output
- [ ] Does NOT accept float-only input
- [ ] Correctly computes sqrt(x² + y²) for vec2
- [ ] Correctly computes sqrt(x² + y² + z²) for vec3
- [ ] Test: known vec2 (3,4) → 5.0
- [ ] Test: known vec3 (1,2,2) → 3.0
- [ ] Test: zero vector → 0.0
- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes

### Normalize Block

- [ ] Block registered for unit vector computation
- [ ] Accepts vec2 input, produces vec2 output
- [ ] Accepts vec3 input, produces vec3 output
- [ ] Does NOT accept float-only input
- [ ] Output has magnitude ~1.0 for non-zero inputs (within floating-point tolerance)
- [ ] Zero vector does not produce NaN or Inf
- [ ] Test: known vec2 (3,4) → (0.6, 0.8)
- [ ] Test: known vec3 (1,2,2) → (1/3, 2/3, 2/3)
- [ ] Test: zero vector → (0,0) or (0,0,0)
- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes

### Overall Sprint

- [ ] No regressions: all 1294+ existing tests still pass
- [ ] `npm run typecheck` clean (no errors)
- [ ] All three blocks discoverable via `getBlockDefinition('Noise')`, `getBlockDefinition('Length')`, `getBlockDefinition('Normalize')`
