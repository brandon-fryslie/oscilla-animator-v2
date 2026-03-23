# Orbit
#
# A miniature orrery: five concentric rings of luminous bodies
# tracing elliptical paths at Keplerian speeds.  Inner orbits
# blaze amber and whip fast around the center; outer rings drift
# cool cyan at a stately pace.  Eccentricity, breathing, and
# shared shape wobble give the whole system organic presence.
#
# Demonstrates: Expression (floor/fract band decomposition, mapField,
#               elliptical polar math), ShapeWobble2D, OKLCH gradients.

patch "Orbit" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 8000
    periodBMs = 13000
    role = "timeRoot"
    outputs {
      phaseA = [positions.refs, scales.refs, wobble.phase]
      phaseB = [positions.refs, hue_drift.b]
    }
  }

  # --- Shape: luminous body with organic wobble ---

  block "Ellipse" "body" {
    rx = 0.009
    ry = 0.009
    outputs {
      controlPoints = wobble.controlPoints
    }
  }

  block "ShapeWobble2D" "wobble" {
    amount = 0.0015
    frequency = 5
    outputs {
      points = shape_build.controlPoints
    }
  }

  block "MakeShape2D" "shape_build" {
    closed = true
    outputs {
      shape = elements.element
    }
  }

  # --- 100 bodies across 5 orbital bands (20 per ring) ---

  block "Array" "elements" {
    count = 100
    outputs {
      t = [positions.refs, scales.refs, hue_drift.a]
    }
  }

  # --- Orbital positions: the heart of the patch ---
  #
  # Each body's lane index (0..1) is split into a band (which ring)
  # and a local_t (where on that ring).  Inner bands orbit faster,
  # outer bands slower — a nod to Kepler's third law.  Slight
  # eccentricity makes each ring an ellipse, and a gentle vertical
  # breathing keeps things from feeling mechanical.

  block "Expression" "positions" {
    expression = <<-EXPR
      lane = elements.t
      pa = mapField(clock.phaseA * 6.2832, elements.t)
      pb = mapField(clock.phaseB * 6.2832, elements.t)

      band = floor(lane * 5.0)
      bn = band * 0.25
      lt = fract(lane * 5.0)

      radius = 0.06 + bn * 0.30
      speed = 5.0 - bn * 4.0
      ecc = 0.06 + 0.03 * sin(bn * 11.0)
      p_off = bn * 7.3

      angle = lt * 6.2832 + pa * speed + p_off
      r = radius * (1.0 + ecc * cos(angle))

      breathe = 0.006 * sin(pb + bn * 4.0)

      x = 0.5 + r * cos(angle)
      y = 0.5 + r * sin(angle) + breathe

      vec2(x, y)
    EXPR
    outputs {
      out = render.controlPoints
    }
  }

  # --- Scale: inner bodies small + fast pulse, outer large + slow ---

  block "Expression" "scales" {
    expression = <<-EXPR
      lane = elements.t
      pa = mapField(clock.phaseA * 6.2832, elements.t)
      bn = floor(lane * 5.0) * 0.25

      base_s = 0.55 + bn * 0.9
      pulse = 0.92 + 0.08 * sin(pa * 2.0 + lane * 42.0)

      base_s * pulse
    EXPR
    outputs {
      out = render.scale
    }
  }

  # --- Color: smooth rainbow from element index, drifting with time ---
  # Uses the breathing-ring pattern: Add(elements.t, clock.phaseB)
  # gives each body a unique hue that slowly cycles.

  block "Add" "hue_drift" {
    outputs {
      out = color.h
    }
  }

  block "MakeColorOKLCH" "color" {
    s = 0.92
    l = 0.78
    a = 0.95
    outputs {
      color = render.color
    }
  }

  block "RenderInstances2D" "render" {}
}
