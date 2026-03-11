# Domain Test
#
# 50 ellipses with rotating motion, per-element rainbow,
# and pulsing per-instance scale jitter.
# Demonstrates: per-element color, ScaleBias pulsing, NoisyBroadcast variation.

patch "Domain Test" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 8000
    periodBMs = 5000
    role = "timeRoot"
    outputs {
      phaseA = layout.phase
      phaseB = scale-osc.phase
    }
  }

  block "Ellipse" "dot" {
    rx = 0.025
    ry = 0.025
    outputs {
      shape = instances.element
    }
  }

  block "Array" "instances" {
    count = 50
    outputs {
      elements = layout.elements
      t = color.h
    }
  }

  block "CircleLayoutUV" "layout" {
    radius = 0.35
    outputs {
      controlPoints = render.controlPoints
    }
  }

  # Per-element rainbow
  block "MakeColorOKLCH" "color" {
    outputs {
      color = render.color
    }
  }

  # Pulsing scale via oscillator
  block "Oscillator" "scale-osc" {
    outputs {
      out = scale-map.in
    }
  }

  block "Const" "scale-amt" {
    value = 0.2
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
    value = 13
    outputs {
      out = scale-jitter.seed
    }
  }

  block "NoisyBroadcast" "scale-jitter" {
    outputs {
      out = render.scale
    }
  }

  block "RenderInstances2D" "render" {}
}
