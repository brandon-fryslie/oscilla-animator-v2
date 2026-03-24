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
      phaseA = hue-shift.b
      phaseB = jitter-osc.phase
    }
  }

  # --- Shape + instances ---

  block "Ellipse" "guide-dot" {
    rx = 0.006
    ry = 0.006
    outputs {
      shape = guide-instances.element
    }
  }

  block "InstanceDomain" "guide-instances" {
    count = 160
    outputs {
      index = guide-spiral.index
    }
  }

  block "Ellipse" "dot" {
    rx = 0.011
    ry = 0.011
    outputs {
      shape = instances.element
    }
  }

  block "InstanceDomain" "instances" {
    count = 160
    outputs {
      index = spiral.index
    }
  }

  block "ScatterUV" "spiral" {
    outputs {
      uv = render.controlPoints
    }
  }

  block "ScatterUV" "guide-spiral" {

    outputs {
      uv = guide-render.controlPoints
    }
  }

  # --- Variation 1: stepped per-instance hue field ---

  block "FloatRangeField" "hue-range" {
    min = 0.05
    max = 0.95
    step = 0.02
    outputs {
      out = hue-shift.a
    }
  }

  block "Adapter_ScalarToPhase01" "hue-wrap" {
    outputs {
      out = color.h
    }
  }

  block "Add" "hue-shift" {
    outputs {
      out = hue-wrap.in
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
    value = 0.42
    outputs {
      out = jitter-amount.scale
    }
  }

  block "Const" "jitter-bias" {
    value = 0.34
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
    value = 0.74
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
    s = 0.95
    l = 0.72
    a = 0.92
    outputs {
      color = render.color
    }
  }

  block "Const" "guide-color" {
    value = { r = 0.10, g = 0.14, b = 0.26, a = 0.18 }
    outputs {
      out = guide-render.color
    }
  }

  block "Const" "guide-scale" {
    value = 0.42
    outputs {
      out = guide-render.scale
    }
  }

  block "RenderInstances2D" "guide-render" {}
  block "RenderInstances2D" "render" {}
}
