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
      phaseA = [layout.phase, dot-wobble.phase, hue-shift.b]
    }
  }

  block "Ellipse" "dot" {
    rx = 0.034
    ry = 0.034
    outputs {
      controlPoints = dot-wobble.controlPoints
    }
  }

  block "ShapeWobble2D" "dot-wobble" {
    amount = 0.006
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
    count = 12
    outputs {
      elements = layout.elements
      t = hue-shift.a
    }
  }

  block "CircleLayoutUV" "layout" {
    radius = 0.26
    outputs {
      controlPoints = render.controlPoints
    }
  }

  block "Add" "hue-shift" {
    outputs {
      out = color.h
    }
  }

  # Per-element rainbow: each dot gets its own hue from Array.t
  block "MakeColorOKLCH" "color" {
    s = 0.92
    l = 0.74
    a = 0.96
    outputs {
      color = render.color
    }
  }

  block "RenderInstances2D" "render" {}
}
