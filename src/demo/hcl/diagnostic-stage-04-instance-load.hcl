# Diagnostic Stage 04: Instance Load
#
# Purpose:
# - Verify high-cardinality instance execution with simple, deterministic topology.
# - Isolate throughput issues from Expression complexity.
# - Useful for checking dispatch counts and indirect-record population under load.

patch "Diagnostic - Stage 04 Instance Load" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 9000
    role = "timeRoot"
    outputs {
      phaseA = [pulse.phase]
    }
  }

  block "Ellipse" "dot" {
    rx = 0.0024
    ry = 0.0024
    outputs {
      shape = instances.element
    }
  }

  block "Array" "instances" {
    count = 10000
    outputs {
      elements = grid.elements
      t = color.h
    }
  }

  block "GridLayoutUV" "grid" {
    rows = 100
    cols = 100
    outputs {
      controlPoints = render.controlPoints
    }
  }

  block "Oscillator" "pulse" {
    outputs {
      out = pulse-map.in
    }
  }

  block "Const" "pulse-scale" {
    value = 0.16
    outputs {
      out = pulse-map.scale
    }
  }

  block "Const" "pulse-bias" {
    value = 0.72
    outputs {
      out = pulse-map.bias
    }
  }

  block "ScaleBias" "pulse-map" {
    outputs {
      out = scale-field.amount
    }
  }

  block "Const" "base-scale" {
    value = 0.68
    outputs {
      out = scale-field.value
    }
  }

  block "Const" "seed" {
    value = 19
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
    s = 0.88
    l = 0.62
    a = 0.9
    outputs {
      color = render.color
    }
  }

  block "RenderInstances2D" "render" {}
}
