# Sprint Status: clean-materializer-map

**Status:** COMPLETE ✅
**Completed:** 2026-01-21T12:57:40Z
**Commit:** e27b16f

## Work Completed

### P0: Simplify applyMap to opcodes-only ✅
- applyMap function already simplified in prior commit
- Removed kernel branch for sqrt/floor/ceil/round
- Throws explicit error for kernel kind in map context
- Only opcodes supported in map path

### P1: Move fieldGoldenAngle to applyKernel ✅
- fieldGoldenAngle already moved to applyKernel in prior commit
- Added to applyKernel function at line 745
- Handles single-input field case with golden angle calculation
- Listed in Materializer header contract

### P2: Update IR routing for math ops ✅
- Added opcodes to OpCode enum: Sqrt, Floor, Ceil, Round, Pow, Fract, Exp, Log, Sign
- Updated src/expr/compile.ts to use OpCode.{Sqrt,Floor,Ceil,Round}
- Removed kernel('sqrt'), kernel('floor'), kernel('ceil'), kernel('round')
- All scalar math now routes through opcode path
- Verified no other IR routes these ops through kernels

### P3: Add Materializer header contract comment ✅
- Header contract already present in prior commit
- Lists all field kernels including fieldGoldenAngle
- Defines layer responsibilities and boundaries
- Documents opcode vs kernel separation

## Verification

- Build: SUCCESS (pnpm build, 9.44s)
- Tests: 510/513 passing
  - 3 failures in Hash Block tests (pre-existing, unrelated to sprint)
  - All sprint-related code passes tests

## Files Modified

- src/compiler/ir/types.ts (added 9 opcodes to enum)
- src/expr/compile.ts (changed math ops from kernel to opcode)

## Dependencies Met

- Sprint 1 (add-opcodes) provided opcode implementations
- OpcodeInterpreter already had floor/ceil/round/sqrt/etc

## Impact

- Map function now opcodes-only ✅
- Scalar math unified under opcodes ✅
- Field kernels segregated to applyKernel ✅
- Layer contracts enforced ✅
- No kernel/opcode confusion ✅

## Next

Ready for Sprint 3 or subsequent refactoring phase
