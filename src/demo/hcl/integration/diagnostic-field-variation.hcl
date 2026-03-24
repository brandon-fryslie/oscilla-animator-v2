# Diagnostic: Field Variation
#
# Purpose:
# - Validates many-cardinality lane generation (`FloatRangeField`)
# - Validates one->many deterministic jitter (`NoisyBroadcast`)
# - Isolates field shaping independent of Expression blocks

patch "Diagnostic - Field Variation" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 7000
    role = "timeRoot"
    outputs {
      phaseA = jitter_osc.phase
    }
  }

  block "Ellipse" "dot" {
    rx = 0.009
    ry = 0.009
    outputs {
      shape = instances.element
    }
  }

  block "InstanceDomain" "instances" {
    count = 196
    outputs {
      index = grid.index
    }
  }

  block "ScatterUV" "grid" {

    outputs {
      uv = render.controlPoints
    }
  }

  block "FloatRangeField" "hue_range" {
    min = 0.05
    max = 0.95
    step = 0.02
    outputs {
      out = hue_wrap.in
    }
  }

  block "Adapter_ScalarToPhase01" "hue_wrap" {
    outputs {
      out = color.h
    }
  }

  block "Oscillator" "jitter_osc" {
    outputs {
      out = jitter_gain.in
    }
  }

  block "Const" "jitter_amt" {
    value = 0.2
    outputs {
      out = jitter_gain.scale
    }
  }

  block "Const" "jitter_bias" {
    value = 0.26
    outputs {
      out = jitter_gain.bias
    }
  }

  block "ScaleBias" "jitter_gain" {
    outputs {
      out = scale_jitter.amount
    }
  }

  block "Const" "base_scale" {
    value = 0.72
    outputs {
      out = scale_jitter.value
    }
  }

  block "Const" "seed" {
    value = 13
    outputs {
      out = scale_jitter.seed
    }
  }

  block "NoisyBroadcast" "scale_jitter" {
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
