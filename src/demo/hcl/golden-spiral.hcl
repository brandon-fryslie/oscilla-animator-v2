# Golden Spiral
#
# 200 ellipses in a slowly rotating Archimedean spiral with gentle pulsing
# scale jitter and vivid per-element rainbow gradient.
# Demonstrates: SpiralLayout, ScaleBias, NoisyBroadcast, per-element rainbow.

patch "Golden Spiral" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 30000
    periodBMs = 12000
    role = "timeRoot"
    outputs {
      phaseA = layout.phase
      phaseB = scale-osc.phase
    }
  }

  block "Ellipse" "dot" {
    rx = 0.008
    ry = 0.008
    outputs {
      shape = instances.element
    }
  }

  block "Array" "instances" {
    count = 200
    outputs {
      elements = layout.elements
      t = color.h
    }
  }

  block "SpiralLayout" "layout" {
    turns = 8
    expansion = 0.4
    outputs {
      position = render.pos
    }
  }

  # Gentle pulsing scale
  block "Oscillator" "scale-osc" {
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
    value = 0.85
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
    value = 0.9
    outputs {
      out = scale-jitter.value
    }
  }

  block "Const" "jitter-seed" {
    value = 29
    outputs {
      out = scale-jitter.seed
    }
  }

  block "NoisyBroadcast" "scale-jitter" {
    outputs {
      out = render.scale
    }
  }

  # Per-element rainbow from Array.t
  block "MakeColorHSL" "color" {
    outputs {
      color = render.color
    }
  }

  block "RenderInstances2D" "render" {}
}
