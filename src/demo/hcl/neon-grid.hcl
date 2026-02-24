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
      phaseA = [pulse.phase, tile-wobble.phase]
    }
  }

  block "Rect" "tile" {
    width = 0.012
    height = 0.012
    cornerRadius = 0.002
    outputs {
      controlPoints = tile-wobble.controlPoints
    }
  }

  block "ShapeWobble2D" "tile-wobble" {
    amount = 0.0015
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
      t = color.h
    }
  }

  block "GridLayoutUV" "grid" {
    rows = 25
    cols = 25
    outputs {
      position = render.pos
    }
  }

  # Stepped pulsing: Oscillator → StepQuantize (discrete sizes)
  block "Oscillator" "pulse" {
    outputs {
      out = quantize.in
    }
  }

  block "Const" "step-size" {
    value = 0.5
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
    value = 0.3
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

  # Per-element rainbow
  block "Const" "saturation" {
    value = 1.0
    outputs {
      out = color.s
    }
  }

  block "MakeColorHSL" "color" {
    outputs {
      color = render.color
    }
  }

  block "RenderInstances2D" "render" {}
}
