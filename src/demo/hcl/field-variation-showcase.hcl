# Field Variation Showcase
#
# Demonstrates practical variation blocks for live patches:
# - FloatRangeField: per-instance stepped value field (many)
# - NoisyBroadcast: one -> many with deterministic per-instance jitter
#
# Visual result:
# - Spiral of dots
# - Hue gradient across instances (quantized bands)
# - Scale jitter per instance, with animated jitter amount

patch "Field Variation Showcase" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 14000
    periodBMs = 5000
    role = "timeRoot"
    outputs {
      phaseB = jitter-osc.phase
    }
  }

  # --- Shape + instances ---

  block "Ellipse" "dot" {
    rx = 0.009
    ry = 0.009
    outputs {
      shape = instances.element
    }
  }

  block "Array" "instances" {
    count = 160
    outputs {
      elements = spiral.elements
    }
  }

  block "SpiralLayout" "spiral" {
    turns = 5
    expansion = 0.65
    spin = 1
    outputs {
      controlPoints = render.controlPoints
    }
  }

  # --- Variation 1: stepped per-instance hue field ---

  block "FloatRangeField" "hue-range" {
    min = 0.05
    max = 0.95
    step = 0.02
    outputs {
      out = hue-wrap.in
    }
  }

  block "Adapter_ScalarToPhase01" "hue-wrap" {
    outputs {
      out = color.h
    }
  }

  # --- Variation 2: one->many scale jitter ---

  block "Oscillator" "jitter-osc" {
    mode = 0
    outputs {
      out = jitter-amount.in
    }
  }

  block "Const" "jitter-amp" {
    value = 0.22
    outputs {
      out = jitter-amount.scale
    }
  }

  block "Const" "jitter-bias" {
    value = 0.26
    outputs {
      out = jitter-amount.bias
    }
  }

  block "ScaleBias" "jitter-amount" {
    outputs {
      out = scale-jitter.amount
    }
  }

  block "Const" "base-scale" {
    value = 0.65
    outputs {
      out = scale-jitter.value
    }
  }

  block "Const" "noise-seed" {
    value = 19
    outputs {
      out = scale-jitter.seed
    }
  }

  block "NoisyBroadcast" "scale-jitter" {
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

