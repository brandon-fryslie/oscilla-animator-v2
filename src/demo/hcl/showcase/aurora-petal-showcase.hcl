# Aurora Petal Showcase
#
# A visual showcase with two readable layers:
# - a drifting lattice field that folds toward the center
# - a bright petal ring that keeps the composition framed
#
# This patch is about selling the renderer, not exhausting the block catalog.

patch "Aurora Petal Showcase" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 11000
    periodBMs = 7000
    role = "timeRoot"
    outputs {
      phaseA = [
        field_position.refs,
        field_scale.refs,
        field_hue_shift.b,
        petal_ring.phase,
        petal_pulse.phase,
        petal_wobble.phase,
      ]
      phaseB = [
        field_position.refs,
        field_scale.refs,
        petal_hue_shift.b,
      ]
    }
  }

  # --- Background branch: folded aurora lattice ---

  block "Ellipse" "field_dot" {
    rx = 0.010
    ry = 0.010
    outputs {
      shape = field_points.element
    }
  }

  block "Array" "field_points" {
    count = 384
    outputs {
      elements = lattice.elements
      t = [field_position.refs, field_scale.refs, field_hue_shift.a]
    }
  }

  block "GridLayoutUV" "lattice" {
    rows = 16
    cols = 20
    outputs {
      controlPoints = [field_position.refs, field_scale.refs]
    }
  }

  block "Expression" "field_position" {
    expression = <<-EXPR
      phase_a = clock.phaseA * 6.2832
      phase_b = clock.phaseB * 6.2832
      phase_a_field = mapField(phase_a, field_points.t)
      phase_b_field = mapField(phase_b, field_points.t)

      x0 = lattice.controlPoints.x
      y0 = lattice.controlPoints.y
      lane = field_points.t
      r = sqrt(max(x0 * x0 + y0 * y0, 0.000001))

      swirl = lane * 40.0 + phase_a_field * 1.7
      arc = r * 11.0 + phase_b_field * 1.2
      envelope_x = 0.64 + 0.14 * cos(arc)
      envelope_y = 0.64 + 0.14 * sin(arc)

      x = x0 * envelope_x + 0.055 * sin(swirl + y0 * 14.0)
      y = y0 * envelope_y + 0.055 * cos(swirl - x0 * 14.0)

      vec2(x, y)
    EXPR
    outputs {
      out = field_render.controlPoints
    }
  }

  block "Expression" "field_scale" {
    expression = <<-EXPR
      phase_a = clock.phaseA * 6.2832
      phase_b = clock.phaseB * 6.2832
      phase_a_field = mapField(phase_a, field_points.t)
      phase_b_field = mapField(phase_b, field_points.t)

      lane = field_points.t
      x0 = lattice.controlPoints.x
      y0 = lattice.controlPoints.y
      radius = sqrt(max(x0 * x0 + y0 * y0, 0.000001))

      ripple = 0.5 + 0.5 * sin(lane * 120.0 + phase_a_field * 5.0)
      radial = 0.55 + 0.45 * cos(radius * 18.0 - phase_b_field * 3.0)
      0.22 + 0.58 * ripple * radial
    EXPR
    outputs {
      out = field_render.scale
    }
  }

  block "Add" "field_hue_shift" {
    outputs {
      out = field_hue_wrap.in
    }
  }

  block "Adapter_ScalarToPhase01" "field_hue_wrap" {
    outputs {
      out = field_color.h
    }
  }

  block "MakeColorOKLCH" "field_color" {
    s = 0.93
    l = 0.66
    a = 0.76
    outputs {
      color = field_render.color
    }
  }

  block "RenderInstances2D" "field_render" {}

  # --- Foreground branch: luminous petal frame ---

  block "Rect" "petal" {
    width = 0.034
    height = 0.012
    cornerRadius = 0.003
    outputs {
      controlPoints = petal_wobble.controlPoints
    }
  }

  block "ShapeWobble2D" "petal_wobble" {
    amount = 0.0024
    frequency = 6
    outputs {
      points = petal_shape.controlPoints
    }
  }

  block "MakeShape2D" "petal_shape" {
    closed = true
    outputs {
      shape = petals.element
    }
  }

  block "Array" "petals" {
    count = 112
    outputs {
      elements = petal_ring.elements
      t = [petal_hue_shift.a, petal_scale_base.in]
    }
  }

  block "CircleLayoutUV" "petal_ring" {
    radius = 0.38
    outputs {
      controlPoints = petal_render.controlPoints
    }
  }

  block "Add" "petal_hue_shift" {
    outputs {
      out = petal_hue_wrap.in
    }
  }

  block "Adapter_ScalarToPhase01" "petal_hue_wrap" {
    outputs {
      out = petal_color.h
    }
  }

  block "MakeColorOKLCH" "petal_color" {
    s = 1.0
    l = 0.78
    a = 0.98
    outputs {
      color = petal_render.color
    }
  }

  block "ScaleBias" "petal_scale_base" {
    scale = 0.72
    bias = 0.78
    outputs {
      out = petal_scale_jitter.value
    }
  }

  block "Oscillator" "petal_pulse" {
    outputs {
      out = petal_pulse_shape.in
    }
  }

  block "Const" "petal_pulse_amt" {
    value = 0.28
    outputs {
      out = petal_pulse_shape.scale
    }
  }

  block "Const" "petal_pulse_center" {
    value = 0.24
    outputs {
      out = petal_pulse_shape.bias
    }
  }

  block "ScaleBias" "petal_pulse_shape" {
    outputs {
      out = petal_scale_jitter.amount
    }
  }

  block "Const" "petal_jitter_seed" {
    value = 53
    outputs {
      out = petal_scale_jitter.seed
    }
  }

  block "NoisyBroadcast" "petal_scale_jitter" {
    outputs {
      out = petal_render.scale
    }
  }

  block "RenderInstances2D" "petal_render" {}
}
