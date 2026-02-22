# Library Kitchen Sink
#
# Broad block-library coverage in one patch:
# - one/math/lens/adapter chain (one-only)
# - event + IO controls
# - camera control path
# - multiple independent render branches (grid/circle/line/spiral/path)
# - field utilities (Broadcast, NoisyBroadcast, FloatRangeField, FieldConstColor, PathField, Reduce)

patch "Library Kitchen Sink" {
  # --- Time + IO + event ---

  block "InfiniteTimeRoot" "clock" {
    periodAMs = 20000
    periodBMs = 9000
    role = "timeRoot"
    outputs {
      pulse = [pulse-mask.event, hold.trigger]
      energy = hold.value
      phaseA = [circle.phase, spiral.phase, path.offset]
      phaseB = [path-hue-shift.shift, line-hue-shift.shift]
    }
  }

  block "ExternalInput" "mouse-x" {
    channel = "mouse.x"
    outputs {
      value = [speed-map.in, vector-test.x]
    }
  }

  block "ExternalGate" "mouse-gate" {
    channel = "mouse.button.left.held"
    threshold = 0.5
    outputs {
      gate = gate-mask-sum.b
    }
  }

  block "ExternalVec2" "mouse-pos" {
    channelBase = "mouse"
  }

  block "EventToOneMask" "pulse-mask" {
    outputs {
      out = gate-mask-sum.a
    }
  }

  block "SampleHold" "hold" {
    outputs {
      out = [vector-test.y, cam.centerX, path-scale-map.in]
    }
  }

  # --- One + math + lens + adapter chain (one-only) ---

  block "ScaleBias" "speed-map" {
    scale = 1.3
    bias = 0.25
    outputs {
      out = phasor-sig.frequency
    }
  }

  block "Phasor" "phasor-sig" {
    outputs {
      out = [osc-sin.phase, osc-saw.phase, osc-square.phase, phase-to-deg.in]
    }
  }

  block "Oscillator" "osc-sin" {
    mode = 0
    outputs {
      out = sum.a
    }
  }

  block "Oscillator" "osc-saw" {
    mode = 1
    outputs {
      out = sum.b
    }
  }

  block "Oscillator" "osc-square" {
    mode = 2
    outputs {
      out = product.b
    }
  }

  block "Noise" "noise" {
    outputs {
      out = quantize.step
    }
  }

  block "Hash" "hash" {
    seed = 17
    outputs {
      out = f2i.in
    }
  }

  block "Add" "sum" {
    outputs {
      out = product.a
    }
  }

  block "Multiply" "product" {
    outputs {
      out = quotient.a
    }
  }

  block "Const" "divisor" {
    value = 2.0
    outputs {
      out = quotient.b
    }
  }

  block "Divide" "quotient" {
    outputs {
      out = modulo.a
    }
  }

  block "Const" "mod-base" {
    value = 1.0
    outputs {
      out = modulo.b
    }
  }

  block "Modulo" "modulo" {
    outputs {
      out = [sine.input, cosine.input]
    }
  }

  block "Sin" "sine" {
    outputs {
      result = norm-range.in
    }
  }

  block "Cos" "cosine" {
    outputs {
      result = cam.far
    }
  }

  block "Lens_NormalizeRange" "norm-range" {
    min = -1
    max = 1
    outputs {
      out = quantize.in
    }
  }

  block "StepQuantize" "quantize" {
    outputs {
      out = denorm.in
    }
  }

  block "Lens_DenormalizeRange" "denorm" {
    min = -1
    max = 1
    outputs {
      out = slew.in
    }
  }

  block "Slew" "slew" {
    rate = 0.35
    outputs {
      out = deadzone.in
    }
  }

  block "Deadzone" "deadzone" {
    threshold = 0.06
    outputs {
      out = gamma.in
    }
  }

  block "PowerGamma" "gamma" {
    gamma = 1.7
    outputs {
      out = gate-mask.in
    }
  }

  block "Add" "gate-mask-sum" {
    outputs {
      out = gate-mask.mask
    }
  }

  block "Mask" "gate-mask" {
    outputs {
      out = clamp-lens.in
    }
  }

  block "Clamp" "clamp-lens" {
    min = -1
    max = 1
    outputs {
      out = [wrap-lens.in, clamp11.in]
    }
  }

  block "Wrap01" "wrap-lens" {
    outputs {
      out = smooth.in
    }
  }

  block "Smoothstep" "smooth" {
    edge0 = 0.1
    edge1 = 0.9
    outputs {
      out = lag-drive.a
    }
  }

  block "Adapter_Clamp11" "clamp11" {
    outputs {
      out = bipolar-to-unipolar.in
    }
  }

  block "Adapter_BipolarToUnipolar" "bipolar-to-unipolar" {
    outputs {
      out = clamp01.in
    }
  }

  block "Adapter_Clamp01" "clamp01" {
    outputs {
      out = [unipolar-to-bipolar.in, norm01-to-scalar.in]
    }
  }

  block "Adapter_UnipolarToBipolar" "unipolar-to-bipolar" {
    outputs {
      out = lag-drive.b
    }
  }

  block "Adapter_Norm01ToScalar" "norm01-to-scalar" {
    outputs {
      out = cam.near
    }
  }

  block "Multiply" "lag-drive" {
    outputs {
      out = lag.target
    }
  }

  block "Lag" "lag" {
    smoothing = 0.45
    initialValue = 0
    outputs {
      out = delay.in
    }
  }

  block "UnitDelay" "delay" {
    initialValue = 0
    outputs {
      out = unit-cast.in
    }
  }

  block "Adapter_UnitCast" "unit-cast" {
    outputs {
      out = wrap-adapter.in
    }
  }

  block "Adapter_Wrap01" "wrap-adapter" {
    outputs {
      out = scalar-to-phase.in
    }
  }

  block "Adapter_ScalarToPhase01" "scalar-to-phase" {
    outputs {
      out = phase-to-rad.in
    }
  }

  block "Adapter_PhaseToRadians" "phase-to-rad" {
    outputs {
      out = rad-to-deg.in
    }
  }

  block "Adapter_RadiansToDegrees" "rad-to-deg" {
    outputs {
      out = [deg-to-phase.in, cam.tiltDeg]
    }
  }

  block "Adapter_DegreesToPhase" "deg-to-phase" {
    outputs {
      out = phase-to-scalar.in
    }
  }

  block "Adapter_PhaseToScalar01" "phase-to-scalar" {
    outputs {
      out = scalar-to-deg.in
    }
  }

  block "Adapter_ScalarToDeg" "scalar-to-deg" {
    outputs {
      out = cam.yawDeg
    }
  }

  block "Adapter_PhaseToDegrees" "phase-to-deg" {
    outputs {
      out = [deg-to-rad.in, cam.fovYDeg]
    }
  }

  block "Adapter_DegreesToRadians" "deg-to-rad" {
    outputs {
      out = rad-to-phase.in
    }
  }

  block "Adapter_RadiansToPhase01" "rad-to-phase" {
  }

  block "Adapter_CastFloatToInt" "f2i" {
    outputs {
      out = i2f.in
    }
  }

  block "Adapter_CastIntToFloat" "i2f" {
    outputs {
      out = [vector-test.z, cam.distance]
    }
  }

  block "Construct" "vector-test" {
    outputs {
      out = vector-z.in
    }
  }

  block "Extract" "vector-z" {
    component = 2
    outputs {
      out = cam.centerY
    }
  }

  # --- Grid branch ---

  block "Rect" "rect" {
    width = 0.02
    height = 0.02
    outputs {
      shape = grid-array.element
    }
  }

  block "Array" "grid-array" {
    count = 96
    outputs {
      elements = [grid.elements, grid-flat-color.elements]
      t = [grid-color.h, grid-mix.t]
    }
  }

  block "GridLayoutUV" "grid" {
    cols = 12
    rows = 8
    outputs {
      position = grid-render.pos
      scale = grid-scale-sub.a
    }
  }

  block "Const" "grid-scale-base" {
    value = 0.7
    outputs {
      out = grid-scale-broadcast.one
    }
  }

  block "Broadcast" "grid-scale-broadcast" {
    outputs {
      field = grid-scale-sub.b
    }
  }

  block "Subtract" "grid-scale-sub" {
    outputs {
      out = grid-render.scale
    }
  }

  block "FieldConstColor" "grid-flat-color" {
    r = 0.15
    g = 0.55
    b = 0.95
    a = 0.75
    outputs {
      color = grid-mix.b
    }
  }

  block "MakeColorHSL" "grid-color" {
    s = 1
    l = 0.55
    outputs {
      color = grid-mix.a
    }
  }

  block "MixColor" "grid-mix" {
    outputs {
      color = grid-render.color
    }
  }

  block "RenderInstances2D" "grid-render" {}

  # --- Circle branch ---

  block "Ellipse" "dot" {
    rx = 0.012
    ry = 0.012
    outputs {
      shape = circle-array.element
    }
  }

  block "Array" "circle-array" {
    count = 84
    outputs {
      elements = circle.elements
    }
  }

  block "CircleLayoutUV" "circle" {
    radius = 0.3
    outputs {
      position = circle-render.pos
    }
  }

  block "FloatRangeField" "circle-range" {
    min = 0.0
    max = 1.0
    step = 0.04
    outputs {
      out = circle-hue-phase.in
    }
  }

  block "Adapter_ScalarToPhase01" "circle-hue-phase" {
    outputs {
      out = circle-color.h
    }
  }

  block "MakeColorHSL" "circle-color" {
    s = 0.9
    l = 0.6
    outputs {
      color = circle-render.color
    }
  }

  block "Const" "circle-scale-value" {
    value = 0.65
    outputs {
      out = circle-scale-noise.value
    }
  }

  block "Const" "circle-scale-amt" {
    value = 0.2
    outputs {
      out = circle-scale-noise.amount
    }
  }

  block "Const" "circle-scale-seed" {
    value = 13
    outputs {
      out = circle-scale-noise.seed
    }
  }

  block "NoisyBroadcast" "circle-scale-noise" {
    outputs {
      out = circle-render.scale
    }
  }

  block "RenderInstances2D" "circle-render" {}

  # --- Line branch ---

  block "ProceduralPolygon" "polygon" {
    sides = 6
    radiusX = 0.018
    radiusY = 0.018
    outputs {
      controlPoints = poly-shape.controlPoints
    }
  }

  block "MakeShape2D" "poly-shape" {
    closed = 1
    outputs {
      shape = line-array.element
    }
  }

  block "Array" "line-array" {
    count = 72
    outputs {
      elements = line.elements
      t = line-rainbow.t
    }
  }

  block "LineLayoutUV" "line" {
    x0 = 0.1
    y0 = 0.82
    x1 = 0.9
    y1 = 0.2
    outputs {
      position = line-render.pos
      scale = line-render.scale
    }
  }

  block "HueRainbow" "line-rainbow" {
    outputs {
      out = line-hue-shift.in
    }
  }

  block "HueShift" "line-hue-shift" {
    outputs {
      out = line-render.color
    }
  }

  block "RenderInstances2D" "line-render" {}

  # --- Spiral + Path branches share star source ---

  block "ProceduralStar" "star" {
    points = 5
    outerRadius = 0.02
    innerRadius = 0.009
    outputs {
      shape = [spiral-array.element, path.shape]
      controlPoints = path-field.controlPoints
    }
  }

  block "Array" "spiral-array" {
    count = 110
    outputs {
      elements = [spiral.elements, path.elements, spiral-flat-color.elements]
      t = [path-rainbow.t, path-mix.t]
    }
  }

  block "SpiralLayout" "spiral" {
    turns = 4.5
    spin = 0.9
    expansion = 0.7
    outputs {
      position = spiral-render.pos
    }
  }

  block "FieldConstColor" "spiral-flat-color" {
    r = 1
    g = 0.35
    b = 0.2
    a = 0.8
    outputs {
      color = spiral-render.color
    }
  }

  block "Const" "spiral-scale-base" {
    value = 0.5
    outputs {
      out = spiral-scale.one
    }
  }

  block "Broadcast" "spiral-scale" {
    outputs {
      field = spiral-render.scale
    }
  }

  block "RenderInstances2D" "spiral-render" {}

  block "PathLayout" "path" {
    spacing = 1.0
    outputs {
      position = attract-layout.positions
    }
  }

  block "AttractorLayout" "attract-layout" {
    strength = 0.35
    outputs {
      position = path-render.pos
    }
  }

  block "HueRainbow" "path-rainbow" {
    outputs {
      out = path-hue-shift.in
    }
  }

  block "HueShift" "path-hue-shift" {
    outputs {
      out = path-mix.a
    }
  }

  block "MakeColorHSL" "path-color" {
    s = 0.95
    l = 0.55
    outputs {
      color = path-mix.b
    }
  }

  block "MixColor" "path-mix" {
    outputs {
      color = split-path.color
    }
  }

  block "SplitColorHSL" "split-path" {
    outputs {
      h = picker-path.h
      s = picker-path.s
      l = picker-path.l
      a = picker-path.a
    }
  }

  block "ColorPicker" "picker-path" {
    outputs {
      color = path-alpha.in
    }
  }

  block "AlphaMultiply" "path-alpha" {
    outputs {
      out = [path-render.color, hsl-to-rgba.in]
    }
  }

  block "Adapter_HslToRgba" "hsl-to-rgba" {}

  block "PathField" "path-field" {
    outputs {
      tangent = [tan-x.in, tan-y.in, tan-z.in]
      arcLength = path-length.field
    }
  }

  block "Extract" "tan-x" {
    component = 0
    outputs {
      out = tan-norm.x
    }
  }

  block "Extract" "tan-y" {
    component = 1
    outputs {
      out = tan-norm.y
    }
  }

  block "Extract" "tan-z" {
    component = 2
    outputs {
      out = tan-norm.z
    }
  }

  block "Normalize" "tan-norm" {
    outputs {
      outX = tan-length.x
      outY = tan-length.y
      outZ = tan-length.z
    }
  }

  block "Length" "tan-length" {
    outputs {
      out = tan-avg.field
    }
  }

  block "Reduce" "path-length" {
    op = "max"
    outputs {
      one = path-scale-mul.a
    }
  }

  block "Reduce" "tan-avg" {
    op = "avg"
    outputs {
      one = path-scale-mul.b
    }
  }

  block "Multiply" "path-scale-mul" {
    outputs {
      out = path-scale-map.scale
    }
  }

  block "ScaleBias" "path-scale-map" {
    bias = 0.4
    outputs {
      out = path-scale-noise.amount
    }
  }

  block "Const" "path-scale-value" {
    value = 0.5
    outputs {
      out = path-scale-noise.value
    }
  }

  block "Const" "path-scale-seed" {
    value = 29
    outputs {
      out = path-scale-noise.seed
    }
  }

  block "NoisyBroadcast" "path-scale-noise" {
    outputs {
      out = path-render.scale
    }
  }

  block "RenderInstances2D" "path-render" {}

  # --- Camera ---

  block "CameraProjectionConst" "cam-proj" {
    value = 1
    outputs {
      out = cam.projection
    }
  }

  block "Camera" "cam" {
    distance = 1.0
    near = 0.01
    far = 100
  }
}
