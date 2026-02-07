# Perspective Camera
#
# 10x10 grid of ellipses viewed through a perspective camera with animated yaw.
# Per-element warm gradient (red→yellow) that shifts with time.
# Demonstrates: Camera block, perspective projection, GridLayoutUV, color animation.

patch "Perspective Camera" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 12000
    periodBMs = 8000
    role = "timeRoot"
    outputs {
      phaseA = yaw-deg.in
      phaseB = hue-animated.b
    }
  }

  # Camera with animated yaw driven by phaseA → degrees
  block "Adapter_PhaseToDegrees" "yaw-deg" {
    outputs {
      out = camera.yawDeg
    }
  }

  block "Camera" "camera" {}

  # Shape + instancing
  block "Ellipse" "dot" {
    rx = 0.03
    ry = 0.03
    outputs {
      shape = grid-elements.element
    }
  }

  block "Array" "grid-elements" {
    count = 100
    outputs {
      elements = grid.elements
      t = hue-scaled.a
    }
  }

  block "GridLayoutUV" "grid" {
    rows = 10
    cols = 10
    outputs {
      position = render.pos
    }
  }

  # Per-element hue: warm range (0.0→0.15 = red→yellow), shifting with time
  block "Const" "hue-range" {
    value = 0.15
    outputs {
      out = hue-scaled.b
    }
  }

  block "Multiply" "hue-scaled" {
    outputs {
      out = hue-animated.a
    }
  }

  block "Add" "hue-animated" {
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
