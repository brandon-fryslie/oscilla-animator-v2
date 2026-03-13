# GPU 10K Grid Smoke
#
# Capacity smoke test:
# - 10,000 instances (100x100)
# - minimal per-instance math
# - fixed color + scale

patch "GPU 10K Grid Smoke" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 12000
    role = "timeRoot"
    outputs {
      phaseA = color.h
    }
  }

  block "Rect" "dot" {
    width = 0.0009
    height = 0.0009
    cornerRadius = 0.0
    outputs {
      shape = swarm.element
    }
  }

  block "Array" "swarm" {
    count = 10000
    outputs {
      elements = lattice.elements
    }
  }

  block "GridLayoutUV" "lattice" {
    rows = 100
    cols = 100
    outputs {
      controlPoints = render.controlPoints
    }
  }

  block "Const" "scale" {
    value = 0.18
    outputs {
      out = render.scale
    }
  }

  block "MakeColorOKLCH" "color" {
    s = 0.88
    l = 0.60
    a = 0.95
    outputs {
      color = render.color
    }
  }

  block "RenderInstances2D" "render" {}
}
