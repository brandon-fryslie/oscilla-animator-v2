# Hypnotic Vortex - Expression DSL Demo Patch

## Overview

The "Wobbly" patch has been replaced with **Hypnotic Vortex**, a visually striking demo that showcases the power of the Expression DSL.

The effect creates mesmerizing concentric spiral rings that pulsate and rotate, creating a hypnotic, organic animation from pure mathematics.

## What Makes It Cool

### Visual
- **Logarithmic spiral pattern** - Creates beautiful, naturally-flowing spiral geometry
- **Pulsating rings** - Radius varies sinusoidally, creating a breathing effect
- **Rotating motion** - Smooth, continuous rotation with time-based modulation
- **Dynamic color** - Hue changes based on both position and time, creating wave-like color shifts
- **5000 particles** - Dense coverage creates a solid, integrated visual

### Technical
- **3 Expression blocks** - Each handling different aspects of the animation
- **Complex math** - Uses sin, cos, fract, multiplication, addition
- **No verbose block graphs** - Achieves sophisticated effect with minimal visual noise
- **Pure DSL composition** - Everything computes via mathematical expressions

## How It Works

### Expression 1: Angle (Rotating Spiral)
```
goldenAngle + time * 2
```
- `goldenAngle`: Phyllotaxis pattern (golden angle, ~137.5°)
  - Creates naturally-distributed spiral structure
  - Computed by `FieldGoldenAngle` block
- `time * 2`: Time-based rotation
  - Multiplying `phaseA` (normalized time in [0,1)) by 2
  - Creates slow, continuous rotation
- Result: Golden angle pattern spinning smoothly

### Expression 2: Radius (Pulsating Spiral Growth)
```
(0.2 + in0 * 0.8) * (0.7 + 0.3 * sin(in1 * 8))
```
- Outer factor `(0.2 + in0 * 0.8)`:
  - Maps normalized index (0 to 1) to radius 0.2-1.0
  - Creates the logarithmic spiral outward growth
  - `in0` is `array.t` (normalized position in spiral)
- Inner factor `(0.7 + 0.3 * sin(in1 * 8))`:
  - `in1` is `time.phaseA` (normalized time 0-1)
  - `sin(in1 * 8)` oscillates -1 to 1, eight times per cycle
  - Modulates radius between 0.7 and 1.0
  - Creates pulsating "breathing" effect
- Result: Spiral that grows outward while pulsating

### Expression 3: Hue (Dynamic Color)
```
fract(in0 * 3 + in1 * 2)
```
- `in0 * 3`: Color rings based on position
  - Multiplying normalized position by 3
  - Creates 3 color cycles across the spiral
  - Different hues at different radius
- `in1 * 2`: Time-based color rotation
  - Multiplying time by 2
  - Rotates hues over time
  - Complete hue rotation every 0.5 cycles
- `fract()`: Wraps result to [0, 1) range
  - HSV hue wraps naturally
  - Creates seamless color continuity
- Result: Color waves that rotate and pulse with the spiral

## Patch Structure

```
Time Root
├─ phaseA ──→ Angle Expression
├─ phaseA ──→ Radius Expression
└─ phaseA ──→ Hue Expression

Circle (0.01 radius)
├─ → Array (5000 particles)
   └─ → GridLayout (71×71)
      ├─ t → Golden Angle
      ├─ t → Radius Expression
      └─ t → Hue Expression

Golden Angle
└─ angle → Angle Expression → Polar to Cartesian
              ↓
Radius Expression ───→ Polar to Cartesian → Render

Hue Expression → HSV to RGB → Render
```

## Why This Demonstrates the DSL Well

### 1. **Eliminates Verbose Block Graphs**
Without the DSL, you'd need:
- Separate field add blocks for angle combination
- Field multiply blocks for radius calculation
- Field division/modulo for hue wrapping
- ~15-20 blocks instead of 3

With the DSL:
- 3 Expression blocks, ~50 lines of code total
- Each expression is a clear, readable formula
- Clear intent: what each part does is obvious

### 2. **Complex Math Becomes Easy**
The vortex uses:
- Trigonometric functions (sin)
- Fractional arithmetic (fract)
- Order-dependent operations (specific precedence matters)
- All expressed naturally in infix notation

### 3. **Composable Expressions**
- Angle expression feeds into position calculation
- Radius expression feeds into the same position calculation
- Hue expression feeds into color calculation
- Each expression is independent but coordinates beautifully

### 4. **Time-Dependent Animation**
- All 3 expressions reference `time.phaseA`
- Animation is baked into the mathematical expressions
- No separate "animation" layer needed
- Natural, mathematical time modulation

## Visual Effect Details

### The Spiral
- **Shape**: Logarithmic spiral (Fibonacci spiral family)
- **Pitch**: Controlled by golden angle (natural growth)
- **Growth**: Outer radius reaches full extent
- **Regularity**: Phyllotaxis pattern (naturally-distributed)

### The Pulsation
- **Frequency**: 8 pulses per time cycle
- **Amplitude**: Radius varies ±30% (factor of 0.7 to 1.0)
- **Smoothness**: Sine-based (natural acceleration/deceleration)
- **Coordination**: All particles pulse together

### The Rotation
- **Speed**: 2× normalized time = 2 full rotations per animation cycle
- **Smooth**: Linear time progression (no jitter)
- **Stable**: Same rotation speed regardless of particle position

### The Color
- **Hue Rings**: 3 rings of different hues
- **Color Rotation**: Hue shifts continuously
- **Wave Pattern**: Color transitions smoothly across the spiral
- **Saturation**: Full (HSV RGB conversion handles it)

## Comparison to Original "Wobbly"

| Aspect | Wobbly | Hypnotic Vortex |
|--------|--------|-----------------|
| **Blocks** | 11 blocks | 9 blocks |
| **Expressions** | Field math blocks | 3 Expression blocks |
| **Visual** | Golden angle spin | Logarithmic spiral |
| **Motion** | Angular offset | Full 2D rotation |
| **Math** | Linear combinations | Complex functions |
| **Effect** | Rotating rings | Pulsating vortex |
| **Time params** | 2 periods | 2 periods (slower) |

## Future DSL Enhancements This Enables

### Scope for v2
- **Expression templates**: Save and recall "golden angle spiral" formulas
- **Syntax highlighting**: Color-code functions vs operators
- **Auto-complete**: Function suggestions, variable hints
- **Live preview**: Show output type as artist types
- **Error messages**: Highlight position of syntax errors in UI

### Scope for v3
- **User-defined functions**: `def ease(t) = t*t; ease(phase)`
- **Conditional logic**: More sophisticated `? :` operations
- **Field expressions**: `field.x + field.y` for vector operations
- **Library presets**: Easing, wave, shape formulas

## How to View It

1. Run the app: `npm run dev`
2. Select "Wobbly" patch from the dropdown
3. Watch the Hypnotic Vortex animate
4. Inspect the Expression blocks to see the math
5. Modify the expressions to experiment with different effects

## Code Location

- **Patch definition**: `src/main.ts` line 249 (patchWobbly function)
- **Expression blocks used**: `src/blocks/expression-blocks.ts`
- **Expression compiler**: `src/expr/`

## Commit

```
b869d93 - demo(expr): Replace Wobbly patch with Hypnotic Vortex - Expression DSL showcase
```
