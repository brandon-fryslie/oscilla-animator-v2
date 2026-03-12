# GPU 10K Swarm Stress
#
# GPU-only stress demo:
# - 10,000 simultaneously animated instances (100x100 field)
# - layered trigonometric field warping in Expression
# - per-instance scale modulation and hue drift
#
# Note: this patch intentionally drives a high instance load near safety limits.

patch "GPU 10K Swarm Stress" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 18000
    periodBMs = 7000
    role = "timeRoot"
    outputs {
      phaseA = [position.refs, scale.refs, hue-shift.a]
      phaseB = [position.refs, scale.refs]
    }
  }

  block "Ellipse" "dot" {
    rx = 0.0014
    ry = 0.0014
    outputs {
      shape = swarm.element
    }
  }

  block "Array" "swarm" {
    count = 10000
    outputs {
      elements = lattice.elements
      t = [position.refs, scale.refs, hue-shift.b]
    }
  }

  block "GridLayoutUV" "lattice" {
    rows = 100
    cols = 100
    outputs {
      controlPoints = [position.refs, scale.refs]
    }
  }

  block "Expression" "position" {
    expression = <<-EXPR
      phase_a = clock.phaseA * 6.2832
      phase_b = clock.phaseB * 6.2832
      phase_a_field = mapField(phase_a, swarm.t)
      phase_b_field = mapField(phase_b, swarm.t)

      x0 = lattice.controlPoints.x
      y0 = lattice.controlPoints.y
      lane = swarm.t

      wave_x = sin(x0 * 14.0 + phase_a_field * 2.3 + lane * 55.0)
      wave_y = cos(y0 * 15.0 - phase_b_field * 3.1 + lane * 47.0)
      turbulence = wave_x * wave_y

      r = sqrt(max(x0 * x0 + y0 * y0, 0.000001))
      theta_seed = (x0 * 3.7 + y0 * 2.9) * 6.2832
      theta = theta_seed + 0.42 * turbulence + phase_a_field * 0.9
      ring = 0.72 * r + 0.09 * sin(lane * 90.0 + phase_b_field * 5.0)

      x = ring * cos(theta) + 0.08 * sin(phase_a_field * 3.0 + y0 * 19.0)
      y = ring * sin(theta) + 0.08 * cos(phase_b_field * 2.2 + x0 * 17.0)

      vec2(x, y)
    EXPR
    outputs {
      out = render.controlPoints
    }
  }

  block "Expression" "scale" {
    expression = <<-EXPR
      phase_a = clock.phaseA * 6.2832
      phase_b = clock.phaseB * 6.2832
      phase_a_field = mapField(phase_a, swarm.t)
      phase_b_field = mapField(phase_b, swarm.t)

      lane = swarm.t
      base = 0.75 + 0.25 * sin(lane * 240.0 + phase_a_field * 8.0)
      detail = 0.5 + 0.5 * cos((lattice.controlPoints.x + lattice.controlPoints.y) * 36.0 + phase_b_field * 7.0)
      0.18 + 0.42 * base * detail
    EXPR
    outputs {
      out = render.scale
    }
  }

  block "Add" "hue-shift" {
    outputs {
      out = hue-wrap.in
    }
  }

  block "Adapter_ScalarToPhase01" "hue-wrap" {
    outputs {
      out = color.h
    }
  }

  block "MakeColorOKLCH" "color" {
    s = 0.92
    l = 0.58
    a = 0.9
    outputs {
      color = render.color
    }
  }

  block "RenderInstances2D" "render" {}

  # spice_overlay_v2: radial accent layer
  block "Rect" "spicea_tile" {
    width = 0.009
    height = 0.009
    cornerRadius = 0.002
    outputs {
      shape = spicea_instances.element
    }
  }

  block "Array" "spicea_instances" {
    count = 36
    outputs {
      elements = spicea_layout.elements
      t = [spicea_offset.refs, spicea_color.h]
    }
  }

  block "CircleLayoutUV" "spicea_layout" {
    radius = 0.44
    outputs {
      controlPoints = spicea_offset.refs
    }
  }

  block "Expression" "spicea_offset" {
    expression = <<-EXPR
      lane = spicea_instances.t * 31.4159
      x = spicea_layout.controlPoints.x + 0.018 * sin(lane)
      y = spicea_layout.controlPoints.y + 0.018 * cos(lane * 1.3)
      vec2(x, y)
    EXPR
    outputs {
      out = spicea_render.controlPoints
    }
  }

  block "Const" "spicea_scale" {
    value = 0.38
    outputs {
      out = spicea_render.scale
    }
  }

  block "Const" "spicea_sat" {
    value = 0.84
    outputs {
      out = spicea_color.s
    }
  }

  block "Const" "spicea_light" {
    value = 0.72
    outputs {
      out = spicea_color.l
    }
  }

  block "Const" "spicea_alpha" {
    value = 0.7
    outputs {
      out = spicea_color.a
    }
  }

  block "MakeColorOKLCH" "spicea_color" {
    outputs {
      color = spicea_render.color
    }
  }

  block "RenderInstances2D" "spicea_render" {}

}
