# Orbit
#
# Two concentric rings spinning at different speeds.
# The outer ring has more elements and spins slowly.
# The inner ring is smaller and spins fast.
# Demonstrates: multiple render passes, independent time phases.

patch "Orbit" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 6000
    periodBMs = 2000
    role = "timeRoot"
  }

  # --- Outer ring: 32 small circles, slow rotation ---

  block "Ellipse" "outer-dot" {
    rx = 0.015
    ry = 0.015
  }

  block "Array" "outer-instances" {
    count = 32
  }

  block "CircleLayoutUV" "outer-ring" {
    radius = 0.35
  }

  block "Const" "outer-color" {
    value = { r = 0.3, g = 0.6, b = 1, a = 0.8 }
  }

  block "RenderInstances2D" "render-outer" {}

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
    to = render-outer.pos
  }

  connect {
    from = outer-color.out
    to = render-outer.color
  }

  connect {
    from = outer-dot.shape
    to = render-outer.shape
  }

  # --- Inner ring: 8 larger circles, fast rotation ---

  block "Ellipse" "inner-dot" {
    rx = 0.035
    ry = 0.035

    outputs 
  }

  block "Array" "inner-instances" {
    count = 8
  }

  block "CircleLayoutUV" "inner-ring" {
    radius = 0.15
  }

  block "Const" "inner-color" {
    value = { r = 1, g = 0.8, b = 0.2, a = 1 }
  }

  block "RenderInstances2D" "render-inner" {}

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
    to = render-inner.pos
  }

  connect {
    from = inner-color.out
    to = render-inner.color
  }

  connect {
    from = inner-dot.shape
    to = render-inner.shape
  }
}
