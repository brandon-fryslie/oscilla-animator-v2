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
      phaseA = [layout.phase, dot-wobble.phase]
    }
  }

  block "Ellipse" "dot" {
    rx = 0.04
    ry = 0.04
    outputs {
      controlPoints = dot-wobble.controlPoints
    }
  }

  block "ShapeWobble2D" "dot-wobble" {
    amount = 0.004
    frequency = 6
    outputs {
      points = dot-shape.controlPoints
    }
  }

  block "MakeShape2D" "dot-shape" {
    closed = true
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
      controlPoints = render.controlPoints
    }
  }

  # Per-element rainbow: each dot gets its own hue from Array.t
  block "MakeColorOKLCH" "color" {
    outputs {
      color = render.color
    }
  }

  block "RenderInstances2D" "render" {}
}
