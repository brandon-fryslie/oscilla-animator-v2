# Diagnostic Stage 01: Static Grid Baseline
#
# Purpose:
# - Verify baseline compile -> draw-prep -> indirect render path without time/expression dynamics.
# - If this fails, the core render pipeline is broken (not animation logic).

patch "Diagnostic - Stage 01 Static Grid" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 10000
    role = "timeRoot"
    outputs {
      phaseA = [pulse.phase]
    }
  }

  block "Oscillator" "pulse" {
    outputs {
      out = pulse-map.in
    }
  }

  block "Const" "pulse-scale" {
    value = 0
    outputs {
      out = pulse-map.scale
    }
  }

  block "Const" "pulse-bias" {
    value = 0
    outputs {
      out = pulse-map.bias
    }
  }

  block "ScaleBias" "pulse-map" {
    outputs {
      out = scale-field.amount
    }
  }

  block "Ellipse" "dot" {
    rx = 0.012
    ry = 0.012
    outputs {
      shape = instances.element
    }
  }

  block "Array" "instances" {
    count = 81
    outputs {
      elements = grid.elements
      t = color.h
    }
  }

  block "GridLayoutUV" "grid" {
    rows = 9
    cols = 9
    outputs {
      controlPoints = render.controlPoints
    }
  }

  block "Const" "scale-value" {
    value = 0.82
    outputs {
      out = scale-field.value
    }
  }

  block "Const" "scale-seed" {
    value = 1
    outputs {
      out = scale-field.seed
    }
  }

  block "NoisyBroadcast" "scale-field" {
    outputs {
      out = render.scale
    }
  }

  block "MakeColorOKLCH" "color" {
    outputs {
      color = render.color
    }
  }

  block "RenderInstances2D" "render" {}
}
