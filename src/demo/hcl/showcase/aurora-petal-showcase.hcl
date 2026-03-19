# Aurora Petal Showcase
#
# A single aurora canopy built from petal shards:
# - a drifting field of elongated petals folding toward the center
# - shared shape morphing that makes the canopy feel alive
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
        morph_lfo.phase,
        field_morph.phase,
      ]
      phaseB = [
        field_position.refs,
        field_scale.refs,
      ]
    }
  }

  # --- Aurora canopy ---

  block "Oscillator" "morph_lfo" {
    outputs {
      out = morph_amount.in
    }
  }

  block "Rect" "field_petal" {
    width = 0.050
    height = 0.012
    cornerRadius = 0.004
    outputs {
      controlPoints = field_morph.controlPoints
    }
  }

  block "ScaleBias" "morph_amount" {
    scale = 0.0036
    bias = 0.0024
    outputs {
      out = field_morph.amount
    }
  }

  block "ShapeWobble2D" "field_morph" {
    frequency = 7
    outputs {
      points = field_shape.controlPoints
    }
  }

  block "MakeShape2D" "field_shape" {
    closed = true
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

      x0 = lattice.controlPoints.x - 0.5
      y0 = lattice.controlPoints.y - 0.5
      lane = field_points.t
      r = sqrt(max(x0 * x0 + y0 * y0, 0.000001))

      swirl = lane * 31.0 + phase_a_field * 1.5
      arc = r * 10.0 + phase_b_field * 1.1
      fold = 0.70 + 0.20 * cos(arc)
      lift = 0.62 + 0.24 * sin(arc + lane * 8.0)
      drift_x = 0.070 * sin(swirl + y0 * 13.0)
      drift_y = 0.085 * cos(swirl * 0.92 - x0 * 15.0)
      fan = 0.040 * sin(lane * 14.0 - phase_b_field * 1.8)

      x = 0.5 + x0 * fold + drift_x + fan
      y = 0.5 + y0 * lift + drift_y - 0.030 * cos(lane * 10.0 + phase_a_field * 1.3)

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
      x0 = lattice.controlPoints.x - 0.5
      y0 = lattice.controlPoints.y - 0.5
      radius = sqrt(max(x0 * x0 + y0 * y0, 0.000001))

      ripple = 0.5 + 0.5 * sin(lane * 96.0 + phase_a_field * 4.2)
      radial = 0.45 + 0.55 * cos(radius * 16.0 - phase_b_field * 2.8)
      0.34 + 0.72 * ripple * radial
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
    s = 0.98
    l = 0.72
    a = 0.88
    outputs {
      color = field_render.color
    }
  }

  block "RenderInstances2D" "field_render" {}
}
