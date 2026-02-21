# Simple
#
# 8 circles in a rotating circle layout with per-element rainbow.
# Minimum viable patch demonstrating core concepts.
# Demonstrates: InfiniteTimeRoot, Array, CircleLayoutUV, per-element color.

patch "Simple" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 4000
    role = "timeRoot"
    outputs {
      phaseA = layout.phase
    }
  }

  block "Ellipse" "dot" {
    rx = 0.04
    ry = 0.04
    outputs {
      shape = instances.element
    }
  }

  block "Array" "instances" {
    count = 8
    outputs {
      elements = layout.elements
      t = color.h
    }
  }

  block "CircleLayoutUV" "layout" {
    radius = 0.2
    outputs {
      position = render.pos
    }
  }

  # Per-element rainbow: each dot gets its own hue from Array.t
  block "MakeColorHSL" "color" {
    outputs {
      color = render.color
    }
  }

  block "RenderInstances2D" "render" {}
}
