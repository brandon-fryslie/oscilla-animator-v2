# Type2 Cubic
#
# First-class Type 2 parametric shape demo rendered through the canonical path.

patch "Type2 Cubic" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 4000
    role = "timeRoot"
  }

  block "CubicBezier2D" "curve" {
    resolution = 72
    p0x = -0.10
    p0y = -0.08
    p1x = -0.04
    p1y = 0.16
    p2x = 0.14
    p2y = -0.12
    p3x = 0.20
    p3y = 0.08
    outputs {
      shape = instances.element
    }
  }

  block "Array" "instances" {
    count = 36
    outputs {
      elements = layout.elements
      t = color.h
    }
  }

  block "CircleLayoutUV" "layout" {
    radius = 0.28
    outputs {
      controlPoints = render.controlPoints
    }
  }

  block "MakeColorHSL" "color" {
    s = 0.75
    l = 0.55
    outputs {
      color = render.color
    }
  }

  block "RenderInstances2D" "render" {}
}
