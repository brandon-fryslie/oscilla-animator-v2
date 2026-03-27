# Gravitational Lensing
#
# A multi-layered particle vortex that could only exist with feedback:
# two independent feedback loops accumulate angular velocity at different
# rates, creating bodies that spiral, whirl, and breathe as they orbit
# an invisible attractor.  Inner particles accelerate faster than outer
# ones — mimicking conservation of angular momentum.
#
# Layer 1 (core):  64 fast-orbiting sparks with wobbling shapes
# Layer 2 (halo): 120 slow-drifting petals on a wider spiral
#
# Without feedback, these orbits would be simple sine waves.  With it,
# the accumulated phase creates non-repeating, history-dependent paths
# that feel gravitational rather than mechanical.
#
# Demonstrates: dual feedback loops, Expression field math, multi-layer
#               render, ShapeWobble2D, spiral layout, per-element color.

patch "Gravitational Lensing" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 9000
    periodBMs = 6000
    role = "timeRoot"
    outputs {
      phaseA = [
        core-speed-lfo.phase,
        halo-speed-lfo.phase,
        core-pos.refs,
        halo-pos.refs,
        core-wobble.phase,
        halo-wobble.phase,
      ]
      phaseB = [
        core-pos.refs,
        halo-pos.refs,
        core-hue.b,
        halo-hue.b,
        core-scale-expr.refs,
        halo-scale-expr.refs,
      ]
    }
  }

  # ===========================================================================
  # FEEDBACK LOOP 1 — Core vortex (fast accumulation)
  # ===========================================================================

  block "Const" "core-base-speed" {
    value = 0.012
    outputs {
      out = core-delta.a
    }
  }

  block "Const" "core-speed-range" {
    value = 0.014
    outputs {
      out = core-speed-mod.b
    }
  }

  block "Oscillator" "core-speed-lfo" {
    outputs {
      out = core-speed-ease.in
    }
  }

  block "Smoothstep" "core-speed-ease" {
    outputs {
      out = [core-speed-mod.a, core-pos.refs]
    }
  }

  block "Multiply" "core-speed-mod" {
    outputs {
      out = core-delta.b
    }
  }

  block "Add" "core-delta" {
    outputs {
      out = core-accum.b
    }
  }

  block "UnitDelay" "core-prev" {
    initialValue = 0
    outputs {
      out = core-accum.a
    }
  }

  block "Add" "core-accum" {
    outputs {
      out = core-wrap.a
    }
  }

  block "Const" "core-wrap-mod" {
    value = 1
    outputs {
      out = core-wrap.b
    }
  }

  block "Modulo" "core-wrap" {
    outputs {
      out = [core-prev.in, core-phase-adapt.in]
    }
  }

  block "Adapter_ScalarToPhase01" "core-phase-adapt" {
    outputs {
      out = core-pos.refs
    }
  }

  # ===========================================================================
  # FEEDBACK LOOP 2 — Halo drift (slow accumulation, different rate)
  # ===========================================================================

  block "Const" "halo-base-speed" {
    value = 0.004
    outputs {
      out = halo-delta.a
    }
  }

  block "Const" "halo-speed-range" {
    value = 0.006
    outputs {
      out = halo-speed-mod.b
    }
  }

  block "Oscillator" "halo-speed-lfo" {
    outputs {
      out = halo-speed-mod.a
    }
  }

  block "Multiply" "halo-speed-mod" {
    outputs {
      out = halo-delta.b
    }
  }

  block "Add" "halo-delta" {
    outputs {
      out = halo-accum.b
    }
  }

  block "UnitDelay" "halo-prev" {
    initialValue = 0
    outputs {
      out = halo-accum.a
    }
  }

  block "Add" "halo-accum" {
    outputs {
      out = halo-wrap.a
    }
  }

  block "Const" "halo-wrap-mod" {
    value = 1
    outputs {
      out = halo-wrap.b
    }
  }

  block "Modulo" "halo-wrap" {
    outputs {
      out = [halo-prev.in, halo-phase-adapt.in]
    }
  }

  block "Adapter_ScalarToPhase01" "halo-phase-adapt" {
    outputs {
      out = halo-pos.refs
    }
  }

  # ===========================================================================
  # LAYER 1 — Core sparks: 64 fast-orbiting wobbling bodies
  # ===========================================================================

  block "Ellipse" "core-shape" {
    rx = 0.008
    ry = 0.005
    outputs {
      controlPoints = core-wobble.controlPoints
    }
  }

  block "ShapeWobble2D" "core-wobble" {
    amount = 0.0018
    frequency = 7
    outputs {
      points = core-shape-build.controlPoints
    }
  }

  block "MakeShape2D" "core-shape-build" {
    closed = true
    outputs {
      shape = core-array.element
    }
  }

  block "Array" "core-array" {
    count = 64
    outputs {
      elements = core-spiral.elements
      t = [core-pos.refs, core-scale-expr.refs, core-hue.a]
    }
  }

  block "SpiralLayout" "core-spiral" {
    turns = 4
    expansion = 0.22
    outputs {
      controlPoints = core-pos.refs
    }
  }

  # Core positions: feedback phase drives orbital speed, inner = faster
  block "Expression" "core-pos" {
    expression = <<-EXPR
      lane = core_array.t
      fb_phase = core_phase_adapt.out
      vel = core_speed_ease.out
      pa = mapField(clock.phaseA * 6.2832, core_array.t)
      pb = mapField(clock.phaseB * 6.2832, core_array.t)
      fb = mapField(fb_phase * 6.2832, core_array.t)
      vel_f = mapField(vel, core_array.t)

      base_x = core_spiral.controlPoints.x - 0.5
      base_y = core_spiral.controlPoints.y - 0.5
      r = sqrt(max(base_x * base_x + base_y * base_y, 0.0001))

      speed = 3.0 - lane * 2.0
      angle = fb * speed + lane * 6.2832

      vel_boost = 1.0 + vel_f * 0.6
      orbit_r = r * vel_boost * (0.85 + 0.15 * sin(pa + lane * 19.0))
      breathe = 0.02 * sin(pb + lane * 11.0)

      x = 0.5 + orbit_r * cos(angle) + breathe * sin(angle)
      y = 0.5 + orbit_r * sin(angle) + breathe * cos(angle)

      vec2(x, y)
    EXPR
    outputs {
      out = core-render.controlPoints
    }
  }

  # Core scale: pulses with feedback phase, inner bodies glow brighter
  block "Expression" "core-scale-expr" {
    expression = <<-EXPR
      lane = core_array.t
      pb = mapField(clock.phaseB * 6.2832, core_array.t)

      pulse = 0.85 + 0.15 * sin(pb * 2.0 + lane * 31.0)
      base = 0.6 + (1.0 - lane) * 0.8

      base * pulse
    EXPR
    outputs {
      out = core-render.scale
    }
  }

  block "Add" "core-hue" {
    outputs {
      out = core-color.h
    }
  }

  block "MakeColorOKLCH" "core-color" {
    s = 0.95
    l = 0.82
    a = 0.92
    outputs {
      color = core-render.color
    }
  }

  block "RenderInstances2D" "core-render" {}

  # ===========================================================================
  # LAYER 2 — Halo petals: 120 slow-drifting elongated shapes
  # ===========================================================================

  block "Rect" "halo-shape" {
    width = 0.042
    height = 0.012
    cornerRadius = 0.003
    outputs {
      controlPoints = halo-wobble.controlPoints
    }
  }

  block "ShapeWobble2D" "halo-wobble" {
    amount = 0.0022
    frequency = 5
    outputs {
      points = halo-shape-build.controlPoints
    }
  }

  block "MakeShape2D" "halo-shape-build" {
    closed = true
    outputs {
      shape = halo-array.element
    }
  }

  block "Array" "halo-array" {
    count = 120
    outputs {
      elements = halo-spiral.elements
      t = [halo-pos.refs, halo-scale-expr.refs, halo-hue.a]
    }
  }

  block "SpiralLayout" "halo-spiral" {
    turns = 8
    expansion = 0.38
    outputs {
      controlPoints = halo-pos.refs
    }
  }

  # Halo positions: slower feedback, wider orbits, gentle warp
  block "Expression" "halo-pos" {
    expression = <<-EXPR
      lane = halo_array.t
      fb_phase = halo_phase_adapt.out
      pa = mapField(clock.phaseA * 6.2832, halo_array.t)
      pb = mapField(clock.phaseB * 6.2832, halo_array.t)
      fb = mapField(fb_phase * 6.2832, halo_array.t)

      base_x = halo_spiral.controlPoints.x - 0.5
      base_y = halo_spiral.controlPoints.y - 0.5
      r = sqrt(max(base_x * base_x + base_y * base_y, 0.0001))

      speed = 1.5 - lane * 0.8
      angle = fb * speed + lane * 6.2832

      warp = 0.03 * sin(pa * 0.7 + lane * 23.0)
      drift = 0.015 * cos(pb + lane * 17.0)

      orbit_r = r * (0.92 + 0.08 * cos(pa + lane * 13.0))

      x = 0.5 + orbit_r * cos(angle) + warp
      y = 0.5 + orbit_r * sin(angle) + drift

      vec2(x, y)
    EXPR
    outputs {
      out = halo-render.controlPoints
    }
  }

  # Halo scale: subtle radial breathing
  block "Expression" "halo-scale-expr" {
    expression = <<-EXPR
      lane = halo_array.t
      pb = mapField(clock.phaseB * 6.2832, halo_array.t)

      ripple = 0.9 + 0.1 * sin(pb + lane * 47.0)
      0.5 + 0.5 * ripple
    EXPR
    outputs {
      out = halo-render.scale
    }
  }

  block "Add" "halo-hue" {
    outputs {
      out = halo-color.h
    }
  }

  block "MakeColorOKLCH" "halo-color" {
    s = 0.88
    l = 0.65
    a = 0.72
    outputs {
      color = halo-render.color
    }
  }

  block "RenderInstances2D" "halo-render" {}
}
