# Debug Lens Coverage
#
# Focused debug-validation patch:
# - one + many cardinality edges
# - float, vec3, color payloads
# - broad value ranges (negative/positive/wrapped/clamped/quantized/noisy)
# - explicit lens attachments on multiple target ports

patch "Debug Lens Coverage" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 18000
    periodBMs = 5000
    role = "timeRoot"
    outputs {
      phaseA = hue-shift.b
      phaseB = [scale-lfo.phase, sat-lfo.phase]
    }
  }

  # --- Shape + instance context ---

  block "Ellipse" "dot" {
    rx = 0.010
    ry = 0.010
    outputs {
      shape = instances.element
    }
  }

  block "InstanceDomain" "instances" {
    count = 180
    outputs {
      index = spiral.index
      rank = hue-shift.a
    }
  }

  # --- Layout ---

  block "ScatterUV" "spiral" {
    outputs {
      uv = render.controlPoints
    }
  }

  # --- Color channels (many + one mix) ---

  block "Add" "hue-shift" {
    outputs {
      out = color.h
    }
  }

  block "Oscillator" "sat-lfo" {
    mode = 0
    outputs {
      out = sat-shape.in
    }
  }

  block "Const" "sat-scale" {
    value = 0.35
    outputs {
      out = sat-shape.scale
    }
  }

  block "Const" "sat-bias" {
    value = 0.65
    outputs {
      out = sat-shape.bias
    }
  }

  block "ScaleBias" "sat-shape" {
    outputs {
      out = color.s
    }
  }

  block "FloatRangeField" "light-field" {
    min = 0.10
    max = 0.95
    step = 0.01
    outputs {
      out = color.l
    }
  }

  block "ScaleBias" "alpha-shape" {
    scale = 0.05
    bias = 0.60
    outputs {
      out = color.a
    }
  }

  block "MakeColorOKLCH" "color" {
    outputs {
      color = render.color
    }

    lens "Wrap01" {
      port = "h"
      sourceAddress = "v1:blocks.hue-shift.outputs.out"
    }

    lens "Clamp" {
      port = "s"
      sourceAddress = "v1:blocks.sat-shape.outputs.out"
      min = 0.15
      max = 1.0
    }

    lens "Smoothstep" {
      port = "l"
      sourceAddress = "v1:blocks.light-field.outputs.out"
      edge0 = 0.05
      edge1 = 0.90
    }
  }

  # --- Scale path with lens chain on render.scale ---

  block "Oscillator" "scale-lfo" {
    mode = 0
    outputs {
      out = scale-shape.in
    }
  }

  block "Const" "scale-amp" {
    value = 0.55
    outputs {
      out = scale-shape.scale
    }
  }

  block "Const" "scale-bias" {
    value = 0.65
    outputs {
      out = scale-shape.bias
    }
  }

  block "ScaleBias" "scale-shape" {
    outputs {
      out = scale-noise.amount
    }
  }

  block "Const" "scale-base" {
    value = 0.75
    outputs {
      out = scale-noise.value
    }
  }

  block "Const" "scale-seed" {
    value = 13
    outputs {
      out = scale-noise.seed
    }
  }

  block "NoisyBroadcast" "scale-noise" {
    outputs {
      out = render.scale
    }
  }

  block "RenderInstances2D" "render" {
    lens "Clamp" {
      port = "scale"
      sourceAddress = "v1:blocks.scale-noise.outputs.out"
      min = 0.06
      max = 1.40
    }

    lens "StepQuantize" {
      port = "scale"
      sourceAddress = "v1:blocks.scale-noise.outputs.out"
      step = 0.02
    }
  }
}
