# Diagnostics Rendering
#
# Canonical rendering diagnostics patch for WebGPU coordinate/scale debugging.
# Expected visual checks:
# 1) Axis probes cross at world origin (clip center).
# 2) Low-count GridLayoutUV probe appears near center band (not at +/-1 corners).
# 3) Probe dots are visibly sized without manual zoom changes.

patch "Diagnostics Rendering" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 4000
    role = "timeRoot"
  }

  # Keep an explicit camera block in the graph so diagnostics cover
  # render-global camera slot plumbing as well.
  block "Camera" "camera" {
    centerX = 0
    centerY = 0
    distance = 2.0
    tiltDeg = 0
    yawDeg = 0
    fovYDeg = 60
    near = 0.01
    far = 100
  }

  block "Ellipse" "probe-dot" {
    rx = 0.08
    ry = 0.08
    outputs {
      shape = [grid-elements.element, axis-h-elements.element, axis-v-elements.element]
    }
  }

  # Probe A: low-count grid. This should stay near center band rather than
  # snapping to top-left/top-right corners.
  block "Array" "grid-elements" {
    count = 2
    outputs {
      elements = grid-low.elements
    }
  }

  block "GridLayoutUV" "grid-low" {
    rows = 5
    cols = 5
    outputs {
      controlPoints = render-grid.controlPoints
    }
  }

  block "Const" "grid-color" {
    value = { r = 1.0, g = 0.55, b = 0.2, a = 1.0 }
    outputs {
      out = render-grid.color
    }
  }

  block "Const" "grid-scale" {
    value = 1.25
    outputs {
      out = render-grid.scale
    }
  }

  # Probe B: horizontal axis marker line.
  block "Array" "axis-h-elements" {
    count = 9
    outputs {
      elements = axis-h.elements
    }
  }

  block "LineLayoutUV" "axis-h" {
    x0 = -0.7
    y0 = 0.0
    x1 = 0.7
    y1 = 0.0
    outputs {
      controlPoints = render-axis-h.controlPoints
    }
  }

  block "Const" "axis-h-color" {
    value = { r = 0.2, g = 0.95, b = 1.0, a = 1.0 }
    outputs {
      out = render-axis-h.color
    }
  }

  block "Const" "axis-h-scale" {
    value = 0.9
    outputs {
      out = render-axis-h.scale
    }
  }

  # Probe C: vertical axis marker line.
  block "Array" "axis-v-elements" {
    count = 9
    outputs {
      elements = axis-v.elements
    }
  }

  block "LineLayoutUV" "axis-v" {
    x0 = 0.0
    y0 = -0.7
    x1 = 0.0
    y1 = 0.7
    outputs {
      controlPoints = render-axis-v.controlPoints
    }
  }

  block "Const" "axis-v-color" {
    value = { r = 0.95, g = 0.25, b = 1.0, a = 1.0 }
    outputs {
      out = render-axis-v.color
    }
  }

  block "Const" "axis-v-scale" {
    value = 0.9
    outputs {
      out = render-axis-v.scale
    }
  }

  block "RenderInstances2D" "render-grid" {}
  block "RenderInstances2D" "render-axis-h" {}
  block "RenderInstances2D" "render-axis-v" {}
}
