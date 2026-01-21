# Sprint: add-opcodes - Definition of Done

**Generated:** 2026-01-21T03:55:17Z

## Acceptance Criteria

### P0: Unary Opcodes Added

- [ ] `applyOpcode('floor', [1.7])` returns `1`
- [ ] `applyOpcode('ceil', [1.2])` returns `2`
- [ ] `applyOpcode('round', [1.5])` returns `2`
- [ ] `applyOpcode('fract', [3.7])` returns `0.7` (within floating point tolerance)
- [ ] `applyOpcode('sqrt', [4])` returns `2`
- [ ] `applyOpcode('exp', [0])` returns `1`
- [ ] `applyOpcode('log', [Math.E])` returns `1` (within tolerance)
- [ ] `applyOpcode('sign', [-5])` returns `-1`
- [ ] `applyOpcode('sign', [0])` returns `0`
- [ ] `applyOpcode('sign', [5])` returns `1`

### P1: Binary pow Opcode Added

- [ ] `applyOpcode('pow', [2, 3])` returns `8`
- [ ] `applyOpcode('pow', [4, 0.5])` returns `2`
- [ ] `applyOpcode('pow', [2])` throws error (arity mismatch)

### P2: Header Comment Updated

- [ ] Header comment lists all opcodes by arity category
- [ ] Variadic ops clearly marked (add, mul, min, max)
- [ ] Fixed-arity ops clearly marked

### Verification

```bash
# Run type check
npx tsc --noEmit

# Run tests (if opcode tests exist)
npm test -- --grep "OpcodeInterpreter"
```
