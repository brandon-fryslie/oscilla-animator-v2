# Neon Grid
#
# 625 rectangles in a 25x25 grid with StepQuantize stepped pulsing
# and per-element rainbow color plus per-tile jitter.
# Demonstrates: StepQuantize, NoisyBroadcast, per-element rainbow, GridLayoutUV.

patch "Neon Grid" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 2000
    role = "timeRoot"
    outputs {
      phaseA = [pulse.phase, tile-wobble.phase, hue-shift.b]
    }
  }

  block "Rect" "tile" {
    width = 0.012
    height = 0.012
    cornerRadius = 0.0035
    outputs {
      controlPoints = tile-wobble.controlPoints
    }
  }

  block "ShapeWobble2D" "tile-wobble" {
    amount = 0.0022
    frequency = 7
    outputs {
      points = tile-shape.controlPoints
    }
  }

  block "MakeShape2D" "tile-shape" {
    closed = true
    outputs {
      shape = grid-elements.element
    }
  }

  block "Array" "grid-elements" {
    count = 625
    outputs {
      elements = grid.elements
      t = hue-shift.a
    }
  }

  block "GridLayoutUV" "grid" {
    rows = 25
    cols = 25
    outputs {
      controlPoints = render.controlPoints
    }
  }

  # Stepped pulsing: Oscillator → StepQuantize (discrete sizes)
  block "Oscillator" "pulse" {
    outputs {
      out = quantize.in
    }
  }

  block "Const" "step-size" {
    value = 0.33
    outputs {
      out = quantize.step
    }
  }

  block "StepQuantize" "quantize" {
    outputs {
      out = scale-map.in
    }
  }

  block "Const" "scale-amt" {
    value = 0.42
    outputs {
      out = scale-map.scale
    }
  }

  block "Const" "scale-center" {
    value = 1.0
    outputs {
      out = scale-map.bias
    }
  }

  block "ScaleBias" "scale-map" {
    outputs {
      out = scale-jitter.amount
    }
  }

  block "Const" "base-scale" {
    value = 1.0
    outputs {
      out = scale-jitter.value
    }
  }

  block "Const" "jitter-seed" {
    value = 31
    outputs {
      out = scale-jitter.seed
    }
  }

  block "NoisyBroadcast" "scale-jitter" {
    outputs {
      out = render.scale
    }
  }

  block "Add" "hue-shift" {
    outputs {
      out = color.h
    }
  }

  # Per-element rainbow
  block "Const" "saturation" {
    value = 0.98
    outputs {
      out = color.s
    }
  }

  block "MakeColorOKLCH" "color" {
    l = 0.72
    a = 0.92
    outputs {
      color = render.color
    }
  }

  block "RenderInstances2D" "render" {}
}
