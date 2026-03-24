# Perspective Camera
#
# 10x10 grid viewed through a perspective camera with Slew-smoothed yaw.
# Per-element rainbow gradient.
# Demonstrates: Camera, Slew rate-limiting, perspective projection.

patch "Perspective Camera" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 12000
    role = "timeRoot"
    outputs {
      phaseA = yaw-deg.in
    }
  }

  # Camera with animated yaw — Slew smooths the rotation
  block "Adapter_PhaseToDegrees" "yaw-deg" {
    outputs {
      out = smooth-yaw.in
    }
  }

  block "Slew" "smooth-yaw" {
    outputs {
      out = camera.yawDeg
    }
  }

  block "Camera" "camera" {}

  # Shape + instancing
  block "Ellipse" "dot" {
    rx = 0.015
    ry = 0.015
    outputs {
      shape = grid-elements.element
    }
  }

  block "InstanceDomain" "grid-elements" {
    count = 100
    outputs {
      index = grid.index
      rank = color.h
    }
  }

  block "ScatterUV" "grid" {

    outputs {
      uv = render.controlPoints
    }
  }

  # Per-element rainbow
  block "MakeColorOKLCH" "color" {
    outputs {
      color = render.color
    }
  }

  block "RenderInstances2D" "render" {}
}
