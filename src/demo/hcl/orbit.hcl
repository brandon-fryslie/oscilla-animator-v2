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
    outputs {
      shape = outer-instances.element
    }
  }

  block "Array" "outer-instances" {
    count = 32
    outputs {
      elements = outer-ring.elements
    }
  }

  block "CircleLayoutUV" "outer-ring" {
    radius = 0.35
    outputs {
      position = render-outer.pos
    }
  }

  block "Const" "outer-color" {
    value = { r = 0.3, g = 0.6, b = 1, a = 0.8 }
    outputs {
      out = render-outer.color
    }
  }

  block "RenderInstances2D" "render-outer" {}

  # --- Inner ring: 8 larger circles, fast rotation ---

  block "Ellipse" "inner-dot" {
    rx = 0.035
    ry = 0.035
    outputs {
      shape = inner-instances.element
    }
  }

  block "Array" "inner-instances" {
    count = 8
    outputs {
      elements = inner-ring.elements
    }
  }

  block "CircleLayoutUV" "inner-ring" {
    radius = 0.15
    outputs {
      position = render-inner.pos
    }
  }

  block "Const" "inner-color" {
    value = { r = 1, g = 0.8, b = 0.2, a = 1 }
    outputs {
      out = render-inner.color
    }
  }

  block "RenderInstances2D" "render-inner" {}
}
