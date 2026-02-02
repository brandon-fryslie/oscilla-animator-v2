# Implementation Context: color-foundation

## Key Files

### UnitType (P0)
- `src/core/canonical-types/units.ts` — Add `'hsl'` to color unit union, add `unitHsl()` constructor
- `src/core/canonical-types/index.ts` — Export `unitHsl`

### HSL→RGB Conversion (P1)
- Algorithm from spec (`design-docs/_new/colors/01-colors.md` lines 278-296):
  ```
  if s == 0: r=g=b=l
  else:
    q = l < 0.5 ? l*(1+s) : l+s-l*s
    p = 2*l - q
    r = hue2rgb(p, q, h+1/3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h-1/3)

  hue2rgb(p, q, t):
    t = wrap01(t)
    if t < 1/6: return p + (q-p)*6*t
    if t < 1/2: return q
    if t < 2/3: return p + (q-p)*(2/3-t)*6
    else: return p
  ```
- **Decision needed at implementation time**: Pure opcode lowering vs new HslToRgb opcode
  - Opcode lowering: ~20-30 IR nodes per conversion, but no runtime changes
  - New opcode: 1 IR node, but requires OpcodeInterpreter addition
  - Recommendation: New opcode is cleaner. The hue2rgb branching logic doesn't map well to component-wise opcodes.

### FieldConstColor Fix (P2)
- `src/blocks/field/field-const-color.ts` — Replace throw with `construct` call
- Pattern: `ctx.b.construct([rId, gId, bId, aId], colorType)`
- Reference: `construct` intrinsic at `src/compiler/ir/IRBuilder.ts:115`

## Existing Patterns to Follow
- Block registration: See `src/blocks/adapter/radians-to-phase.ts` for adapter pattern
- Construct intrinsic: See `ValueExprConstruct` at `src/compiler/ir/value-expr.ts:337-341`
- Extract intrinsic: See `ValueExprExtract` at `src/compiler/ir/value-expr.ts:319-324`
- OpCode dispatch: `src/runtime/OpcodeInterpreter.ts`

## Available OpCodes (relevant to color math)
- `Wrap01` — wrap to [0,1)
- `Clamp(x, min, max)` — ternary clamp
- `Lerp(a, b, t)` — ternary lerp
- `Add`, `Sub`, `Mul`, `Div` — basic arithmetic
- `Floor` — floor function
