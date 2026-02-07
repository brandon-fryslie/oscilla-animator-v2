# Domain Test
#
# 50 large ellipses with rotating motion and animated per-element rainbow.
# Slow spiral for continuity testing.
# Demonstrates: continuity state preservation, smooth animation transitions.

patch "Domain Test" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 8000
    periodBMs = 20000
    role = "timeRoot"
    outputs {
      phaseA = layout.phase
      phaseB = hue-add.b
    }
  }

  block "Ellipse" "dot" {
    rx = 0.025
    ry = 0.025
    outputs {
      shape = instances.element
    }
  }

  block "Array" "instances" {
    count = 50
    outputs {
      elements = layout.elements
      t = hue-add.a
    }
  }

  block "CircleLayoutUV" "layout" {
    radius = 0.35
    outputs {
      position = render.pos
    }
  }

  # Per-element animated hue: rainbow shifts over time
  block "Add" "hue-add" {
    outputs {
      out = color.h
    }
  }

  block "MakeColorHSL" "color" {
    outputs {
      color = render.color
    }
  }

  block "RenderInstances2D" "render" {}
}
