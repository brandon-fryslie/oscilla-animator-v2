# Expression Field Ops
#
# Demonstrates Expression block as a field-first math surface:
# - mixed one+many references (`clock.phaseA` + `points.t`)
# - explicit field mapping with `mapField(value, overField)`
# - pure Expression-driven scale + hue animation

patch "Expression Field Ops" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 5000
    role = "timeRoot"
    outputs {
      phaseA = [scale_expr.refs, hue-shift.b]
    }
  }

  block "Ellipse" "dot" {
    rx = 0.018
    ry = 0.018
    outputs {
      shape = points.element
    }
  }

  block "Array" "points" {
    count = 144
    outputs {
      elements = layout.elements
      t = [scale_expr.refs, hue-shift.a]
    }
  }

  block "GridLayoutUV" "layout" {
    rows = 12
    cols = 12
    outputs {
      controlPoints = render.controlPoints
    }
  }

  # Explicit field operator: map one-cardinality oscillator value over points.t lanes
  block "Expression" "scale_expr" {
    expression = <<-EXPR
      // Baseline scale level shared by every instance.
      // Visual: keeps the grid readable at all times.
      base_scale = 0.85

      // How far scale can deviate from baseline.
      // Visual: determines the perceived energy of the pulse.
      pulse_amount = 0.2

      // Convert phase to radians for sine oscillator.
      // Visual: drives rhythmic global expansion/contraction.
      pulse_phase = clock.phaseA * 6.2832

      // One-cardinality pulse value before field mapping.
      // Visual: all points start from the same temporal pulse.
      pulse_value = base_scale + pulse_amount * sin(pulse_phase)

      // Broadcast pulse to every points.t lane.
      // Visual: applies identical scale animation to the whole grid.
      mapField(pulse_value, points.t)
    EXPR
    outputs {
      out = render.scale
    }
  }

  block "Add" "hue-shift" {
    outputs {
      out = color.h
    }
  }

  block "MakeColorOKLCH" "color" {
    s = 0.9
    l = 0.7
    a = 0.9
    outputs {
      color = render.color
    }
  }

  block "RenderInstances2D" "render" {}
}
