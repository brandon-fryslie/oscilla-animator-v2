# Smooth Chase
#
# An oscillator drives a target value. A Lag block smoothly chases it.
# Both the raw and smoothed values drive separate ring scales,
# so you can see the Lag "catch up" to the oscillator.
#
# Demonstrates: Lag (exponential smoothing), dual render passes for comparison.

patch "Smooth Chase" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 2500
    periodBMs = 15000
    role = "timeRoot"
  }

  # --- Signal chain: oscillator → lag ---

  block "Oscillator" "source" {}

  block "Lag" "smoother" {
    smoothing = 0.92
    initialValue = 0
  }

  connect {
    from = clock.phaseA
    to = source.phase
  }

  connect {
    from = source.out
    to = smoother.target
  }

  # --- Scale mapping for both signals ---
  # Map oscillator [-1,1] → scale [0.5, 1.5]: scale = 1 + 0.5 * value

  block "Const" "half" {
    value = 0.5
  }

  block "Const" "one" {
    value = 1
  }

  # Raw oscillator scale
  block "Multiply" "raw-half" {}
  block "Add" "raw-scale" {}

  connect {
    from = source.out
    to = raw-half.a
  }

  connect {
    from = half.out
    to = raw-half.b
  }

  connect {
    from = one.out
    to = raw-scale.a
  }

  connect {
    from = raw-half.out
    to = raw-scale.b
  }

  # Smoothed scale
  block "Multiply" "smooth-half" {}
  block "Add" "smooth-scale" {}

  connect {
    from = smoother.out
    to = smooth-half.a
  }

  connect {
    from = half.out
    to = smooth-half.b
  }

  connect {
    from = one.out
    to = smooth-scale.a
  }

  connect {
    from = smooth-half.out
    to = smooth-scale.b
  }

  # --- Outer ring: raw oscillator (jumpy) ---

  block "Ellipse" "outer-dot" {
    rx = 0.012
    ry = 0.012
  }

  block "Array" "outer-instances" {
    count = 24
  }

  block "CircleLayoutUV" "outer-ring" {
    radius = 0.35
  }

  block "Const" "outer-color" {
    value = { r = 1, g = 0.3, b = 0.3, a = 0.7 }
  }

  block "RenderInstances2D" "render-raw" {}

  connect {
    from = outer-dot.shape
    to = outer-instances.element
  }

  connect {
    from = outer-instances.elements
    to = outer-ring.elements
  }

  connect {
    from = outer-ring.position
    to = render-raw.pos
  }

  connect {
    from = outer-color.out
    to = render-raw.color
  }

  connect {
    from = outer-dot.shape
    to = render-raw.shape
  }

  connect {
    from = raw-scale.out
    to = render-raw.scale
  }

  # --- Inner ring: smoothed (silky) ---

  block "Ellipse" "inner-dot" {
    rx = 0.02
    ry = 0.02
  }

  block "Array" "inner-instances" {
    count = 12
  }

  block "CircleLayoutUV" "inner-ring" {
    radius = 0.18
  }

  block "Const" "inner-color" {
    value = { r = 0.3, g = 1, b = 0.5, a = 1 }
  }

  block "RenderInstances2D" "render-smooth" {}

  connect {
    from = inner-dot.shape
    to = inner-instances.element
  }

  connect {
    from = inner-instances.elements
    to = inner-ring.elements
  }

  connect {
    from = inner-ring.position
    to = render-smooth.pos
  }

  connect {
    from = inner-color.out
    to = render-smooth.color
  }

  connect {
    from = inner-dot.shape
    to = render-smooth.shape
  }

  connect {
    from = smooth-scale.out
    to = render-smooth.scale
  }
}
