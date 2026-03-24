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
        field_morph.phase]
      phaseB = [
        field_position.refs,
        field_scale.refs]
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

  block "InstanceDomain" "field_points" {
    count = 384
    outputs {
      index = lattice.index
      rank = [field_position.refs, field_scale.refs, field_hue_shift.a]
    }
  }

  block "ScatterUV" "lattice" {

    outputs {
      uv = [field_position.refs, field_scale.refs]
    }
  }

  block "Expression" "field_position" {
    expression = <<-EXPR
      phase_a = clock.phaseA * 6.2832
      phase_b = clock.phaseB * 6.2832
      phase_a_field = mapField(phase_a, field_points.rank)
      phase_b_field = mapField(phase_b, field_points.rank)
      sin_a = sin(phase_a_field)
      cos_a = cos(phase_a_field)
      sin_b = sin(phase_b_field)
      cos_b = cos(phase_b_field)

      x0 = lattice.uv.x - 0.5
      y0 = lattice.uv.y - 0.5
      r = sqrt(max(x0 * x0 + y0 * y0, 0.000001))

      bend = r * 8.4 + 1.2 * sin_b
      veil = 0.76 + 0.16 * cos(bend)
      plume = 0.72 + 0.14 * sin(bend + (x0 + y0) * 6.0 + 0.4 * cos_a)
      curl_x = 0.080 * sin(y0 * 12.0 + 1.4 * sin_a + 0.6 * cos(x0 * 8.0 - sin_b))
      curl_y = 0.092 * cos(x0 * 11.0 - 1.1 * sin_b + 0.5 * sin(y0 * 9.0 + cos_a))
      drift = 0.034 * sin((x0 + y0) * 10.0 - 0.9 * cos_b)
      orbit_x = 0.020 * sin((x0 - y0) * 7.0 + 1.7 * sin_a)
      orbit_y = 0.024 * cos((x0 + y0) * 6.0 - 1.5 * cos_b)

      x = 0.5 + x0 * veil + curl_x + drift + orbit_x
      y = 0.5 + y0 * plume + curl_y + orbit_y

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
      phase_a_field = mapField(phase_a, field_points.rank)
      phase_b_field = mapField(phase_b, field_points.rank)

      lane = field_points.rank
      x0 = lattice.uv.x - 0.5
      y0 = lattice.uv.y - 0.5
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
