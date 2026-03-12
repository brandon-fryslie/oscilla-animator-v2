# Expression Vec3 Orbit
#
# Demonstrates Expression block producing vec3 positions directly,
# with multiple Expression nodes sharing refs and explicit field mapping.

patch "Expression Vec3 Orbit" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 7000
    role = "timeRoot"
    outputs {
      phaseA = [pos_expr.refs, scale_expr.refs]
    }
  }

  block "Ellipse" "dot" {
    rx = 0.012
    ry = 0.012
    outputs {
      shape = points.element
    }
  }

  block "Array" "points" {
    count = 140
    outputs {
      t = [pos_expr.refs, scale_expr.refs, color.h]
    }
  }

  # Build position directly in Expression with vec3 constructor.
  block "Expression" "pos_expr" {
    expression = <<-EXPR
      // Base radius grows with lane index.
      // Visual: points farther along the field sit farther from center, creating a spiral spread.
      radial = 0.2 + 0.3 * points.t

      // Convert normalized time phase into radians.
      // Visual: drives a smooth full-circle rotation over time.
      global_phase = clock.phaseA * 6.2832

      // Broadcast one-cardinality phase to per-point lanes.
      // Visual: all points share the same time progression while retaining unique lane offsets.
      global_phase_field = mapField(global_phase, points.t)

      // Combine lane winding with global phase.
      // Visual: distributes points around orbit while spinning the whole structure.
      angle = points.t * 18.8496 + global_phase_field

      // Convert polar motion to Cartesian coordinates.
      // Visual: produces circular trajectories in x/y.
      x = radial * cos(angle)
      y = radial * sin(angle)

      // Emit vec3 position in the render plane.
      // Visual: keeps depth fixed so the motion reads as 2D orbiting dots.
      vec3(x, y, 0.0)
    EXPR
    outputs {
      out = render.controlPoints
    }
  }

  block "Expression" "scale_expr" {
    expression = <<-EXPR
      // Baseline per-instance size.
      // Visual: ensures dots remain visible even at pulse minima.
      base_scale = 0.65

      // Pulse amplitude around the baseline.
      // Visual: controls how dramatic the size breathing feels.
      pulse_amount = 0.25

      // Time phase in radians for periodic motion.
      // Visual: keeps pulsing synchronized to the global clock.
      global_phase = clock.phaseA * 6.2832

      // Map global phase across lanes.
      // Visual: lets each point combine shared time with lane-local phase.
      global_phase_field = mapField(global_phase, points.t)

      // Lane-local oscillator angle.
      // Visual: offsets pulse timing across the point set.
      pulse_angle = points.t * 12.5664 + global_phase_field

      // Final scale value.
      // Visual: produces traveling scale waves through the orbit.
      base_scale + pulse_amount * sin(pulse_angle)
    EXPR
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
