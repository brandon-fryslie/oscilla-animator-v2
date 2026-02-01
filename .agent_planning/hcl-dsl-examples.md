# Oscilla Patch DSL — Examples

## 1. Minimal: Static Circle

The simplest possible patch — one shape, rendered once.

```hcl
patch "StaticCircle" {}

block "InfiniteTimeRoot" "time" {
  role      = "timeRoot"
  periodAMs = 1000
}

block "Ellipse" "dot" {
  rx = 0.05
  ry = 0.05
}

block "Array" "array" {
  count = 1
}

block "Const" "white" {
  value = { r = 1, g = 1, b = 1, a = 1 }
}

block "RenderInstances2D" "render" {}

connect { from = dot.shape,   to = array.element }
connect { from = array.elements, to = render.elements }
connect { from = white.out,   to = render.color }
connect { from = dot.shape,   to = render.shape }
```

---

## 2. Simple: Tile Grid

400 rectangles on a grid with a fixed color.

```hcl
patch "TileGrid" {
  description = "20x20 grid of light blue tiles"
}

block "InfiniteTimeRoot" "time" {
  role      = "timeRoot"
  periodAMs = 3000
  periodBMs = 7000
}

block "Rect" "tile" {
  width  = 0.018
  height = 0.012
}

block "Array" "tiles" {
  count = 400
}

block "GridLayoutUV" "grid" {
  rows = 20
  cols = 20
}

block "Const" "color" {
  value = { r = 0.5, g = 0.8, b = 1.0, a = 1.0 }
}

block "RenderInstances2D" "render" {}

connect { from = tile.shape,     to = tiles.element }
connect { from = tiles.elements, to = grid.elements }
connect { from = grid.position,  to = render.pos }
connect { from = color.out,      to = render.color }
connect { from = tile.shape,     to = render.shape }
```

---

## 3. Simple: Golden Spiral

5000 ellipses in a circle. The baseline demo.

```hcl
patch "GoldenSpiral" {
  description = "5000 ellipses in a circle layout"
}

block "InfiniteTimeRoot" "time" {
  role      = "timeRoot"
  periodAMs = 4000
  periodBMs = 120000
}

block "Ellipse" "dot" {
  rx = 0.02
  ry = 0.02
}

block "Array" "dots" {
  count = 5000
}

block "CircleLayoutUV" "layout" {
  radius = 0.35
}

block "Const" "warmYellow" {
  value = { r = 0.9, g = 0.7, b = 0.5, a = 1.0 }
}

block "RenderInstances2D" "render" {}

connect { from = dot.shape,      to = dots.element }
connect { from = dots.elements,  to = layout.elements }
connect { from = layout.position, to = render.pos }
connect { from = warmYellow.out, to = render.color }
connect { from = dot.shape,      to = render.shape }
```

---

## 4. Medium: Mouse-Controlled Spiral

Interactive — mouse position and click state drive the animation.

```hcl
patch "MouseSpiral" {
  description = "Interactive spiral responding to mouse input"
}

block "InfiniteTimeRoot" "time" {
  role      = "timeRoot"
  periodAMs = 4000
  periodBMs = 8000
}

# External inputs
block "ExternalInput" "mouseX"  { channel = "mouse.x" }
block "ExternalInput" "mouseY"  { channel = "mouse.y" }
block "ExternalInput" "clicking" { channel = "mouse.button.left.held" }

# Shape and array
block "Ellipse" "dot"     { rx = 0.02, ry = 0.02 }
block "Array" "dots"      { count = 24 }
block "CircleLayoutUV" "layout" { radius = 0.3 }

# Size: base + click bonus
block "Const" "baseSize"   { value = 0.015 }
block "Const" "clickScale" { value = 0.015 }
block "Multiply" "clickBonus" {}
block "Add" "finalSize" {}

# Render
block "Const" "purple" {
  value = { r = 0.8, g = 0.6, b = 1.0, a = 1.0 }
}

block "RenderInstances2D" "render" {}

# Shape pipeline
connect { from = dot.shape,      to = dots.element }
connect { from = dots.elements,  to = layout.elements }

# Size computation
connect { from = clicking.value,  to = clickBonus.a }
connect { from = clickScale.out,  to = clickBonus.b }
connect { from = baseSize.out,    to = finalSize.a }
connect { from = clickBonus.out,  to = finalSize.b }

# Render wiring
connect { from = layout.position, to = render.pos }
connect { from = purple.out,      to = render.color }
connect { from = dot.shape,       to = render.shape }
connect { from = finalSize.out,   to = render.scale }
```

---

## 5. Medium: Animated Rectangles with Expression

Pulsing scale driven by an Expression block.

```hcl
patch "RectMosaic" {
  description = "400 rectangles with pulsing scale animation"
}

block "InfiniteTimeRoot" "time" {
  role      = "timeRoot"
  periodAMs = 4000
  periodBMs = 7000
}

block "Rect" "rect"             { width = 0.03, height = 0.015 }
block "Array" "rects"           { count = 400 }
block "CircleLayoutUV" "layout" { radius = 0.45 }

block "Const" "salmon" {
  value = { r = 1.0, g = 0.6, b = 0.4, a = 1.0 }
}

block "Expression" "pulse" {
  expression = "1.0 + 0.5 * sin(in0 * 6.28 + 1.57)"
}

block "RenderInstances2D" "render" {}

connect { from = rect.shape,      to = rects.element }
connect { from = rects.elements,  to = layout.elements }
connect { from = time.phaseA,     to = pulse.in0 }
connect { from = layout.position, to = render.pos }
connect { from = salmon.out,      to = render.color }
connect { from = rect.shape,      to = render.shape }
connect { from = pulse.out,       to = render.scale }
```

---

## 6. Medium: Perspective Camera

3D grid viewed through an animated camera.

```hcl
patch "PerspectiveCamera" {
  description = "Grid of dots through a rotating perspective camera"
}

block "InfiniteTimeRoot" "time" {
  role      = "timeRoot"
  periodAMs = 12000
  periodBMs = 4000
}

block "Camera" "camera" {}

# Animated yaw: phase -> degrees
block "Expression" "yawExpr" {
  expression = "in0 * 360.0"
}

block "Adapter_ScalarToDeg" "yawDeg" {}

# Scene
block "Ellipse" "dot"          { rx = 0.03, ry = 0.03 }
block "Array" "dots"           { count = 100 }
block "GridLayoutUV" "grid"    { rows = 10, cols = 10 }

block "Const" "skyBlue" {
  value = { r = 0.5, g = 0.8, b = 1.0, a = 1.0 }
}

block "RenderInstances2D" "render" {}

# Camera animation
connect { from = time.phaseA,  to = yawExpr.in0 }
connect { from = yawExpr.out,  to = yawDeg.in }
connect { from = yawDeg.out,   to = camera.yawDeg }

# Scene wiring
connect { from = dot.shape,     to = dots.element }
connect { from = dots.elements, to = grid.elements }
connect { from = grid.position, to = render.pos }
connect { from = skyBlue.out,   to = render.color }
connect { from = dot.shape,     to = render.shape }
```

---

## 7. Complex: Feedback Accumulator with Variable Speed

Two rings — outer uses feedback-driven rotation, inner uses constant time. Demonstrates UnitDelay feedback loops.

```hcl
patch "FeedbackRotation" {
  description = "Variable-speed feedback rotation vs constant time"
}

block "InfiniteTimeRoot" "time" {
  role      = "timeRoot"
  periodAMs = 3000
  periodBMs = 8000
}

# =========================================================================
# Speed modulation: delta oscillates between 0.005 and 0.025
# =========================================================================

block "Const" "speedBase" { value = 0.015 }
block "Const" "speedAmp"  { value = 0.01 }
block "Const" "one"       { value = 1.0 }

block "Oscillator" "speedOsc" {
  waveform = "oscSin"
}

block "Multiply" "speedMod" {}
block "Add" "delta" {}

connect { from = time.phaseA,   to = speedOsc.phase }
connect { from = speedOsc.out,  to = speedMod.a }
connect { from = speedAmp.out,  to = speedMod.b }
connect { from = speedBase.out, to = delta.a }
connect { from = speedMod.out,  to = delta.b }

# =========================================================================
# Feedback loop: phase[t] = (phase[t-1] + delta) mod 1
# =========================================================================

block "UnitDelay" "phaseDelay" {
  initialValue = 0
}

block "Add" "accumulate" {}
block "Modulo" "wrap" {}

connect { from = phaseDelay.out,  to = accumulate.a }  # previous frame
connect { from = delta.out,       to = accumulate.b }  # variable delta
connect { from = accumulate.out,  to = wrap.a }
connect { from = one.out,         to = wrap.b }
connect { from = wrap.out,        to = phaseDelay.in }  # feedback!

# =========================================================================
# Outer ring: feedback-driven (variable speed)
# =========================================================================

block "Ellipse" "outerDot"            { rx = 0.02, ry = 0.02 }
block "Array" "outerDots"             { count = 24 }
block "CircleLayoutUV" "outerLayout"  { radius = 0.35 }
block "Const" "cyan"                  { value = { r = 0.3, g = 0.9, b = 0.9, a = 1.0 } }
block "RenderInstances2D" "outerRender" {}

connect { from = outerDot.shape,       to = outerDots.element }
connect { from = outerDots.elements,   to = outerLayout.elements }
connect { from = outerLayout.position, to = outerRender.pos }
connect { from = cyan.out,             to = outerRender.color }
connect { from = outerDot.shape,       to = outerRender.shape }

# =========================================================================
# Inner ring: time-driven (constant speed for comparison)
# =========================================================================

block "Ellipse" "innerDot"            { rx = 0.015, ry = 0.015 }
block "Array" "innerDots"             { count = 16 }
block "CircleLayoutUV" "innerLayout"  { radius = 0.18 }
block "Const" "orange"                { value = { r = 1.0, g = 0.6, b = 0.3, a = 1.0 } }
block "RenderInstances2D" "innerRender" {}

connect { from = innerDot.shape,       to = innerDots.element }
connect { from = innerDots.elements,   to = innerLayout.elements }
connect { from = innerLayout.position, to = innerRender.pos }
connect { from = orange.out,           to = innerRender.color }
connect { from = innerDot.shape,       to = innerRender.shape }
```

---

## 8. Complex: Dual Topology (Two Shapes, Two Layouts, Two Renders)

Ellipses in a circle and rectangles on a grid, rendered as two layers with counter-pulsing scale.

```hcl
patch "ShapeKaleidoscope" {
  description = "Dual topology: ellipse circle + rectangle grid"
}

block "InfiniteTimeRoot" "time" {
  role      = "timeRoot"
  periodAMs = 6000
  periodBMs = 10000
}

# Animated scale: pulsing and counter-pulsing
block "Expression" "pulseA" {
  expression = "1.2 + 0.6 * sin(in0 * 6.28)"
}

block "Expression" "pulseB" {
  expression = "1.5 + 0.8 * sin(in0 * 6.28 + 3.14)"
}

connect { from = time.phaseA, to = pulseA.in0 }
connect { from = time.phaseB, to = pulseB.in0 }

# =========================================================================
# Layer 1: Ellipses in a circle
# =========================================================================

block "Ellipse" "eDot"              { rx = 0.015, ry = 0.015 }
block "Array" "eDots"               { count = 150 }
block "CircleLayoutUV" "eLayout"    { radius = 0.4 }
block "Const" "warmOrange"          { value = { r = 1.0, g = 0.5, b = 0.3, a = 0.8 } }
block "RenderInstances2D" "eRender" {}

connect { from = eDot.shape,      to = eDots.element }
connect { from = eDots.elements,  to = eLayout.elements }
connect { from = eLayout.position, to = eRender.pos }
connect { from = warmOrange.out,  to = eRender.color }
connect { from = eDot.shape,      to = eRender.shape }
connect { from = pulseA.out,      to = eRender.scale }

# =========================================================================
# Layer 2: Rectangles on a grid
# =========================================================================

block "Rect" "rTile"                { width = 0.025, height = 0.012 }
block "Array" "rTiles"              { count = 100 }
block "GridLayoutUV" "rGrid"        { rows = 10, cols = 10 }
block "Const" "coolBlue"            { value = { r = 0.3, g = 0.5, b = 1.0, a = 0.7 } }
block "RenderInstances2D" "rRender" {}

connect { from = rTile.shape,     to = rTiles.element }
connect { from = rTiles.elements, to = rGrid.elements }
connect { from = rGrid.position,  to = rRender.pos }
connect { from = coolBlue.out,    to = rRender.color }
connect { from = rTile.shape,     to = rRender.shape }
connect { from = pulseB.out,      to = rRender.scale }
```

---

## 9. Complex: Expression Block with Varargs

An expression that references multiple blocks by alias.

```hcl
patch "ExpressionVarargs" {
  description = "Expression block with multiple named references"
}

block "InfiniteTimeRoot" "time" {
  role      = "timeRoot"
  periodAMs = 4000
  periodBMs = 8000
}

block "Phasor" "phase" {}
block "Const" "speed"    { value = 2.5 }
block "Const" "offset"   { value = 0.1 }
block "Const" "amplitude" { value = 0.8 }

block "Expression" "wave" {
  expression = "amplitude * sin(phase * speed * 6.28) + offset"

  vararg "refs" {
    connect { from = phase.out,     alias = "phase" }
    connect { from = speed.out,     alias = "speed" }
    connect { from = offset.out,    alias = "offset" }
    connect { from = amplitude.out, alias = "amplitude" }
  }
}

block "Ellipse" "dot"             { rx = 0.03, ry = 0.03 }
block "Array" "dots"              { count = 1 }
block "Const" "green"             { value = { r = 0.2, g = 1.0, b = 0.4, a = 1.0 } }
block "RenderInstances2D" "render" {}

connect { from = time.phaseA,     to = phase.frequency }
connect { from = dot.shape,       to = dots.element }
connect { from = dots.elements,   to = render.elements }
connect { from = green.out,       to = render.color }
connect { from = dot.shape,       to = render.shape }
connect { from = wave.out,        to = render.scale }
```

---

## 10. Complex: Port Overrides (CombineMode + DefaultSource)

Multiple signals combining into one port, with custom default sources.

```hcl
patch "CombinedModulation" {
  description = "Multiple modulators combine additively on render ports"
}

block "InfiniteTimeRoot" "time" {
  role      = "timeRoot"
  periodAMs = 3000
  periodBMs = 5000
}

block "Phasor" "lfoA" {}
block "Phasor" "lfoB" {}
block "Oscillator" "oscA" { waveform = "oscSin" }
block "Oscillator" "oscB" { waveform = "oscTriangle" }

block "Ellipse" "dot"           { rx = 0.04, ry = 0.04 }
block "Array" "dots"            { count = 1 }
block "RenderInstances2D" "render" {
  # Override combine mode: multiple color inputs add together
  port "color" {
    combineMode = "sum"
  }

  # Override default source for scale
  port "scale" {
    default {
      blockType = "Const"
      output    = "out"
      params    = { value = 1.5 }
    }
  }
}

connect { from = time.phaseA, to = lfoA.frequency }
connect { from = time.phaseB, to = lfoB.frequency }
connect { from = lfoA.out,    to = oscA.phase }
connect { from = lfoB.out,    to = oscB.phase }

connect { from = dot.shape,     to = dots.element }
connect { from = dots.elements, to = render.elements }
connect { from = dot.shape,     to = render.shape }

# Two signals wired to the same port — combined via sum
connect { from = oscA.out, to = render.color }
connect { from = oscB.out, to = render.color }
```

---

## 11. Complex: Lenses on Connections

Degree-to-radian conversion and quantization applied per-connection.

```hcl
patch "LensDemo" {
  description = "Lenses transform signals on individual connections"
}

block "InfiniteTimeRoot" "time" {
  role      = "timeRoot"
  periodAMs = 6000
}

block "Expression" "rotation" {
  expression = "in0 * 360.0"
}

block "Expression" "rawScale" {
  expression = "0.5 + in0 * 2.0"
}

block "Ellipse" "dot"             { rx = 0.03, ry = 0.03 }
block "Array" "dots"              { count = 12 }
block "CircleLayoutUV" "layout"   { radius = 0.3 }
block "Const" "white"             { value = { r = 1, g = 1, b = 1, a = 1 } }
block "RenderInstances2D" "render" {}

connect { from = time.phaseA,  to = rotation.in0 }
connect { from = time.phaseA,  to = rawScale.in0 }
connect { from = dot.shape,    to = dots.element }
connect { from = dots.elements, to = layout.elements }
connect { from = layout.position, to = render.pos }
connect { from = white.out,    to = render.color }
connect { from = dot.shape,    to = render.shape }

# Lens: convert degrees to radians on this specific connection
connect {
  from = rotation.out
  to   = render.rotation

  lens "Adapter_DegreesToRadians" {}
}

# Lens: quantize scale to steps of 0.25
connect {
  from = rawScale.out
  to   = render.scale

  lens "Quantize" {
    step = 0.25
  }
}
```

---

## 12. Composite Definition: SmoothNoise

Noise filtered through Lag for organic modulation.

```hcl
composite "SmoothNoise" {
  description = "Smooth random values - Noise through Lag"
  category    = "composite"
  readonly    = true

  input "x" {
    internal_block = "noise"
    internal_port  = "x"
    label          = "X"
  }

  input "smoothing" {
    internal_block = "lag"
    internal_port  = "smoothing"
    label          = "Smoothing"
  }

  output "out" {
    internal_block = "lag"
    internal_port  = "out"
    label          = "Output"
  }

  block "Noise" "noise" {}

  block "Lag" "lag" {
    smoothing = 0.9
  }

  connect { from = noise.out, to = lag.target }
}
```

---

## 13. Composite Definition: PingPong

Triangle wave from math on a phasor. More internal blocks and wiring.

```hcl
composite "PingPong" {
  description = "Triangle wave (0->1->0) from Phasor"
  category    = "composite"
  readonly    = true

  input "frequency" {
    internal_block = "phasor"
    internal_port  = "frequency"
    label          = "Frequency"
  }

  output "out" {
    internal_block = "sub2"
    internal_port  = "out"
    label          = "Output"
  }

  output "phase" {
    internal_block = "phasor"
    internal_port  = "out"
    label          = "Raw Phase"
  }

  # Internal blocks
  block "Phasor" "phasor" {}
  block "Const" "two"       { value = 2 }
  block "Const" "one"       { value = 1 }
  block "Multiply" "mult"   {}
  block "Subtract" "sub1"   {}
  block "Subtract" "sub2"   {}

  block "Expression" "abs" {
    expression = "abs(a)"
  }

  # Internal wiring: out = 1 - |2*phase - 1|
  connect { from = phasor.out, to = mult.a }
  connect { from = two.out,    to = mult.b }
  connect { from = mult.out,   to = sub1.a }
  connect { from = one.out,    to = sub1.b }
  connect { from = sub1.out,   to = abs.in0 }
  connect { from = one.out,    to = sub2.a }
  connect { from = abs.out,    to = sub2.b }
}
```

---

## 14. Composite Usage in a Patch

Using the composites defined above as regular blocks.

```hcl
patch "CompositeDemo" {
  description = "Using PingPong and SmoothNoise composites"
}

block "InfiniteTimeRoot" "time" {
  role      = "timeRoot"
  periodAMs = 4000
  periodBMs = 8000
}

# Composites used like any other block
block "PingPong" "bounce" {}
block "SmoothNoise" "noise" {
  smoothing = 0.95
}

# Scene
block "Ellipse" "dot"             { rx = 0.03, ry = 0.03 }
block "Array" "dots"              { count = 60 }
block "CircleLayoutUV" "layout"   { radius = 0.35 }
block "Const" "teal"              { value = { r = 0.2, g = 0.8, b = 0.7, a = 1.0 } }
block "RenderInstances2D" "render" {}

connect { from = time.phaseA,      to = bounce.frequency }
connect { from = time.phaseB,      to = noise.x }
connect { from = dot.shape,        to = dots.element }
connect { from = dots.elements,    to = layout.elements }
connect { from = layout.position,  to = render.pos }
connect { from = teal.out,         to = render.color }
connect { from = dot.shape,        to = render.shape }
connect { from = bounce.out,       to = render.scale }
```

---

## 15. Extremely Complex: Layered Scene with Feedback, Expressions, Varargs, Lenses, Port Overrides, Composites, External Input, and Multiple Renders

Everything at once. A three-layer interactive animation.

```hcl
patch "KitchenSink" {
  description = "Three-layer interactive scene exercising every DSL feature"
}

block "InfiniteTimeRoot" "time" {
  role      = "timeRoot"
  periodAMs = 4000
  periodBMs = 12000
}

# =========================================================================
# External inputs
# =========================================================================

block "ExternalInput" "mouseX"   { channel = "mouse.x" }
block "ExternalInput" "mouseY"   { channel = "mouse.y" }
block "ExternalInput" "clicking" { channel = "mouse.button.left.held" }
block "ExternalInput" "wheel"    { channel = "mouse.wheel.dy" }

# =========================================================================
# Shared constants
# =========================================================================

block "Const" "one"    { value = 1.0 }
block "Const" "zero"   { value = 0.0 }
block "Const" "half"   { value = 0.5 }
block "Const" "tau"    { value = 6.283185 }

# =========================================================================
# Feedback accumulator: mouse-wheel-driven zoom
# phase[t] = clamp(phase[t-1] + wheel * 0.01, 0.5, 3.0)
# =========================================================================

block "Const" "wheelSensitivity" { value = 0.01 }
block "Multiply" "wheelDelta" {}
block "UnitDelay" "zoomDelay" { initialValue = 1.0 }
block "Add" "zoomAccum" {}
block "Clamp" "zoomClamp" { min = 0.5, max = 3.0 }

connect { from = wheel.value,           to = wheelDelta.a }
connect { from = wheelSensitivity.out,   to = wheelDelta.b }
connect { from = zoomDelay.out,          to = zoomAccum.a }
connect { from = wheelDelta.out,         to = zoomAccum.b }
connect { from = zoomAccum.out,          to = zoomClamp.a }
connect { from = zoomClamp.out,          to = zoomDelay.in }  # feedback

# =========================================================================
# Feedback accumulator: variable-speed phase rotation
# =========================================================================

block "Const" "speedBase" { value = 0.012 }
block "Const" "speedAmp"  { value = 0.008 }

block "Oscillator" "speedOsc" { waveform = "oscSin" }
block "Multiply" "speedMod" {}
block "Add" "speedDelta" {}

connect { from = time.phaseA,    to = speedOsc.phase }
connect { from = speedOsc.out,   to = speedMod.a }
connect { from = speedAmp.out,   to = speedMod.b }
connect { from = speedBase.out,  to = speedDelta.a }
connect { from = speedMod.out,   to = speedDelta.b }

block "UnitDelay" "rotDelay" { initialValue = 0 }
block "Add" "rotAccum" {}
block "Modulo" "rotWrap" {}

connect { from = rotDelay.out,   to = rotAccum.a }
connect { from = speedDelta.out, to = rotAccum.b }
connect { from = rotAccum.out,   to = rotWrap.a }
connect { from = one.out,        to = rotWrap.b }
connect { from = rotWrap.out,    to = rotDelay.in }  # feedback

# =========================================================================
# Composites
# =========================================================================

block "PingPong" "bounce" {}
block "SmoothNoise" "jitter" { smoothing = 0.92 }

connect { from = time.phaseB, to = bounce.frequency }
connect { from = time.phaseA, to = jitter.x }

# =========================================================================
# Expression: complex color from multiple inputs
# =========================================================================

block "Expression" "dynamicColor" {
  expression = "vec3(sin(phase * 6.28) * 0.5 + 0.5, mouseY * 0.8, cos(phase * 3.14) * 0.3 + 0.7)"

  vararg "refs" {
    connect { from = rotWrap.out,  alias = "phase" }
    connect { from = mouseY.value, alias = "mouseY" }
  }
}

# =========================================================================
# Layer 1: Large ellipses in outer ring (feedback rotation)
# =========================================================================

block "Ellipse" "bigDot"              { rx = 0.025, ry = 0.025 }
block "Array" "bigDots"               { count = 24 }
block "CircleLayoutUV" "outerRing"    { radius = 0.4 }
block "RenderInstances2D" "outerRender" {
  port "color" {
    combineMode = "sum"
  }
}

connect { from = bigDot.shape,       to = bigDots.element }
connect { from = bigDots.elements,   to = outerRing.elements }
connect { from = outerRing.position, to = outerRender.pos }
connect { from = bigDot.shape,       to = outerRender.shape }
connect { from = zoomClamp.out,      to = outerRender.scale }

# Two color sources combined via sum
connect { from = dynamicColor.out,  to = outerRender.color }
connect { from = jitter.out,        to = outerRender.color }

# =========================================================================
# Layer 2: Small rectangles in grid (bouncing scale)
# =========================================================================

block "Rect" "tile"                 { width = 0.02, height = 0.01 }
block "Array" "tiles"               { count = 100 }
block "GridLayoutUV" "grid"         { rows = 10, cols = 10 }
block "Const" "coolBlue"            { value = { r = 0.3, g = 0.5, b = 1.0, a = 0.6 } }
block "RenderInstances2D" "gridRender" {}

connect { from = tile.shape,      to = tiles.element }
connect { from = tiles.elements,  to = grid.elements }
connect { from = grid.position,   to = gridRender.pos }
connect { from = coolBlue.out,    to = gridRender.color }
connect { from = tile.shape,      to = gridRender.shape }
connect { from = bounce.out,      to = gridRender.scale }

# =========================================================================
# Layer 3: Tiny dots in inner ring (click-reactive, with lenses)
# =========================================================================

block "Ellipse" "tinyDot"            { rx = 0.01, ry = 0.01 }
block "Array" "tinyDots"             { count = 32 }
block "CircleLayoutUV" "innerRing"   { radius = 0.15 }

block "Const" "clickGrowth"          { value = 0.02 }
block "Multiply" "clickEffect" {}
block "Const" "tinyBase"             { value = 0.008 }
block "Add" "tinySize" {}

connect { from = clicking.value,  to = clickEffect.a }
connect { from = clickGrowth.out, to = clickEffect.b }
connect { from = tinyBase.out,    to = tinySize.a }
connect { from = clickEffect.out, to = tinySize.b }

block "Expression" "rotationDeg" {
  expression = "in0 * 360.0"
}

connect { from = rotWrap.out, to = rotationDeg.in0 }

block "Const" "hotPink" {
  value = { r = 1.0, g = 0.2, b = 0.6, a = 1.0 }
}

block "RenderInstances2D" "innerRender" {
  port "scale" {
    default {
      blockType = "Const"
      output    = "out"
      params    = { value = 1.0 }
    }
  }
}

connect { from = tinyDot.shape,       to = tinyDots.element }
connect { from = tinyDots.elements,   to = innerRing.elements }
connect { from = innerRing.position,  to = innerRender.pos }
connect { from = hotPink.out,         to = innerRender.color }
connect { from = tinyDot.shape,       to = innerRender.shape }
connect { from = tinySize.out,        to = innerRender.scale }

# Lens: degrees to radians on rotation
connect {
  from = rotationDeg.out
  to   = innerRender.rotation

  lens "Adapter_DegreesToRadians" {}
}
```

---

## 16. Extremely Complex: Composite with Internal Feedback

A composite that contains its own feedback loop internally.

```hcl
composite "DampedSpring" {
  description = "Damped spring oscillator - target chasing with overshoot"
  category    = "composite"
  readonly    = true

  input "target" {
    internal_block = "diff"
    internal_port  = "a"
    label          = "Target"
  }

  input "stiffness" {
    internal_block = "stiffMul"
    internal_port  = "b"
    label          = "Stiffness"
  }

  input "damping" {
    internal_block = "dampMul"
    internal_port  = "b"
    label          = "Damping"
  }

  output "out" {
    internal_block = "posDelay"
    internal_port  = "out"
    label          = "Position"
  }

  output "velocity" {
    internal_block = "velDelay"
    internal_port  = "out"
    label          = "Velocity"
  }

  # Position state: pos[t] = pos[t-1] + vel[t-1]
  block "UnitDelay" "posDelay" { initialValue = 0 }
  block "Add" "posAccum" {}

  # Velocity state: vel[t] = vel[t-1] + force - dampingForce
  block "UnitDelay" "velDelay" { initialValue = 0 }
  block "Add" "velAccum" {}

  # Force = (target - pos) * stiffness
  block "Subtract" "diff" {}
  block "Multiply" "stiffMul" {}

  # Damping = vel * damping
  block "Multiply" "dampMul" {}
  block "Subtract" "netForce" {}

  # Position feedback: pos += vel
  connect { from = posDelay.out, to = posAccum.a }
  connect { from = velDelay.out, to = posAccum.b }
  connect { from = posAccum.out, to = posDelay.in }  # feedback

  # Velocity feedback: vel += (stiffness * (target - pos)) - (damping * vel)
  connect { from = posDelay.out,  to = diff.b }       # diff = target - pos
  connect { from = diff.out,      to = stiffMul.a }   # spring force
  connect { from = velDelay.out,  to = dampMul.a }    # damping force
  connect { from = stiffMul.out,  to = netForce.a }
  connect { from = dampMul.out,   to = netForce.b }   # net = spring - damp
  connect { from = velDelay.out,  to = velAccum.a }
  connect { from = netForce.out,  to = velAccum.b }
  connect { from = velAccum.out,  to = velDelay.in }   # feedback
}
```

Usage:

```hcl
patch "SpringDemo" {
  description = "Mouse-chasing dot with spring physics"
}

block "InfiniteTimeRoot" "time" {
  role      = "timeRoot"
  periodAMs = 1000
}

block "ExternalInput" "mouseX" { channel = "mouse.x" }

block "DampedSpring" "spring" {
  stiffness = 0.05
  damping   = 0.15
}

block "Ellipse" "dot"              { rx = 0.04, ry = 0.04 }
block "Array" "dots"               { count = 1 }
block "Const" "red"                { value = { r = 1, g = 0.2, b = 0.2, a = 1 } }
block "RenderInstances2D" "render" {}

connect { from = mouseX.value,    to = spring.target }
connect { from = dot.shape,       to = dots.element }
connect { from = dots.elements,   to = render.elements }
connect { from = red.out,         to = render.color }
connect { from = dot.shape,       to = render.shape }
connect { from = spring.out,      to = render.scale }
```
