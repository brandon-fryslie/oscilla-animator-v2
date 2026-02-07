# Path Field Demo
#
# Star vertices with per-vertex warm-to-cool gradient.
# Shows path field functionality with animated hue shift.
# Demonstrates: ProceduralStar, PathField, Broadcast, HueRainbow.

patch "Path Field Demo" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 4000
    role = "timeRoot"
    outputs {
      phaseA = hue-rainbow.t
    }
  }

  block "ProceduralStar" "star" {
    points = 5
    outerRadius = 0.25
    innerRadius = 0.1
    outputs {
      controlPoints = path-field.controlPoints
    }
  }

  block "PathField" "path-field" {
    outputs {
      position = render.pos
    }
  }

  block "Ellipse" "marker" {
    rx = 0.015
    ry = 0.015
  }

  # Cycling rainbow color (signal-level, broadcast to field)
  block "HueRainbow" "hue-rainbow" {
    outputs {
      out = color-field.signal
    }
  }

  block "Broadcast" "color-field" {
    outputs {
      field = render.color
    }
  }

  block "RenderInstances2D" "render" {}
}
