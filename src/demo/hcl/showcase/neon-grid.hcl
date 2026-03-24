# Neon Grid
#
# A three-layer neon wall:
# - a dim static scaffold that keeps the matrix legible
# - a larger cyan glow layer drifting in diagonal waves
# - a hot magenta core layer with stepped, noisy pulse changes
#
# Demonstrates: GridLayoutUV, Expression field warping, StepQuantize,
# NoisyBroadcast, dual render layering.

patch "Neon Grid" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 3600
    periodBMs = 7200
    role = "timeRoot"
    outputs {
      phaseA = [position.refs, pulse.phase, core_hue_shift.b]
      phaseB = [position.refs, tile_wobble.phase]
    }
  }

  block "Rect" "tile" {
    width = 0.014
    height = 0.014
    cornerRadius = 0.004
    outputs {
      controlPoints = tile_wobble.controlPoints
    }
  }

  block "ShapeWobble2D" "tile_wobble" {
    amount = 0.0028
    frequency = 9
    outputs {
      points = tile_shape.controlPoints
    }
  }

  block "MakeShape2D" "tile_shape" {
    closed = true
    outputs {
      shape = grid_elements.element
    }
  }

  block "InstanceDomain" "grid_elements" {
    count = 625
    outputs {
      index = [grid.index, scaffold_color.index, glow_color.index]
      rank = [position.refs, core_hue_shift.a]
    }
  }

  block "ScatterUV" "grid" {

    outputs {
      uv = [scaffold_render.controlPoints, position.refs]
    }
  }

  block "Expression" "position" {
    expression = <<-EXPR
      phase_a = clock.phaseA * 6.2832
      phase_b = clock.phaseB * 6.2832
      lane = grid_elements.rank

      x0 = grid.uv.x - 0.5
      y0 = grid.uv.y - 0.5
      diag = x0 + y0
      cross = x0 - y0

      wave_a = 0.038 * sin(diag * 26.0 + phase_a * 2.7 + lane * 18.0)
      wave_b = 0.028 * cos(cross * 22.0 - phase_b * 2.1 + lane * 15.0)
      scan = 0.014 * sin(y0 * 34.0 + phase_a * 5.0)

      x = 0.5 + x0 * 0.96 + wave_a + scan
      y = 0.5 + y0 * 0.96 + wave_b + 0.014 * cos(x0 * 34.0 - phase_b * 4.0)
      vec2(x, y)
    EXPR
    outputs {
      out = [glow_render.controlPoints, core_render.controlPoints]
    }
  }

  block "FieldConstColor" "scaffold_color" {
    r = 0.05
    g = 0.1
    b = 0.3
    a = 0.16
    outputs {
      color = scaffold_render.color
    }
  }

  block "FieldConstColor" "glow_color" {
    r = 0.02
    g = 0.92
    b = 1
    a = 0.18
    outputs {
      color = glow_render.color
    }
  }

  block "Const" "scaffold_scale" {
    value = 0.46
    outputs {
      out = scaffold_render.scale
    }
  }

  block "Oscillator" "pulse" {
    outputs {
      out = quantize.in
    }
  }

  block "Const" "step_size" {
    value = 0.24
    outputs {
      out = quantize.step
    }
  }

  block "StepQuantize" "quantize" {
    outputs {
      out = [glow_scale_map.in, core_scale_map.in]
    }
  }

  block "ScaleBias" "glow_scale_map" {
    scale = 0.58
    bias = 1.26
    outputs {
      out = glow_render.scale
    }
  }

  block "ScaleBias" "core_scale_map" {
    scale = 0.34
    bias = 0.78
    outputs {
      out = core_scale_noise.amount
    }
  }

  block "Const" "core_scale_base" {
    value = 0.92
    outputs {
      out = core_scale_noise.value
    }
  }

  block "Const" "core_scale_seed" {
    value = 43
    outputs {
      out = core_scale_noise.seed
    }
  }

  block "NoisyBroadcast" "core_scale_noise" {
    outputs {
      out = core_render.scale
    }
  }

  block "Add" "core_hue_shift" {
    outputs {
      out = core_color.h
    }
  }

  block "MakeColorOKLCH" "core_color" {
    s = 1
    l = 0.76
    a = 0.96
    outputs {
      color = core_render.color
    }
  }

  block "RenderInstances2D" "scaffold_render" {}
  block "RenderInstances2D" "glow_render" {}
  block "RenderInstances2D" "core_render" {}
}
