# Expression Vec3 Orbit
#
# A dense spiral of bodies with positions computed entirely in Expression
# as vec3 values.  Three concentric bands orbit at different speeds with
# eccentricity, wobbling shapes, and per-element rainbow color drift.
#
# Demonstrates: Expression vec3 output, floor/fract band decomposition,
#               mapField, ShapeWobble2D, OKLCH color.

patch "Expression Vec3 Orbit" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 9000
    periodBMs = 6000
    role = "timeRoot"
    outputs {
      phaseA = [pos_expr.refs, scale_expr.refs, wobble.phase]
      phaseB = [pos_expr.refs, hue_drift.b]
    }
  }

  block "Ellipse" "body" {
    rx = 0.010
    ry = 0.007
    outputs {
      controlPoints = wobble.controlPoints
    }
  }

  block "ShapeWobble2D" "wobble" {
    amount = 0.0016
    frequency = 6
    outputs {
      points = shape_build.controlPoints
    }
  }

  block "MakeShape2D" "shape_build" {
    closed = true
    outputs {
      shape = points.element
    }
  }

  block "Array" "points" {
    count = 120
    outputs {
      t = [pos_expr.refs, scale_expr.refs, hue_drift.a]
    }
  }

  # Position as vec3: three orbital bands with different speeds.
  block "Expression" "pos_expr" {
    expression = <<-EXPR
      lane = points.t
      pa = mapField(clock.phaseA * 6.2832, points.t)
      pb = mapField(clock.phaseB * 6.2832, points.t)

      band = floor(lane * 3.0)
      bn = band * 0.333
      lt = fract(lane * 3.0)

      radius = 0.10 + bn * 0.25
      speed = 3.0 - bn * 2.0
      ecc = 0.05 + 0.03 * sin(bn * 7.0)

      angle = lt * 6.2832 + pa * speed + bn * 4.7

      r = radius * (1.0 + ecc * cos(angle))
      breathe = 0.008 * sin(pb + lane * 13.0)

      x = 0.5 + r * cos(angle)
      y = 0.5 + r * sin(angle) + breathe

      vec3(x, y, 0.0)
    EXPR
    outputs {
      out = render.controlPoints
    }
  }

  # Scale: inner bodies larger, with traveling pulse waves.
  block "Expression" "scale_expr" {
    expression = <<-EXPR
      lane = points.t
      pa = mapField(clock.phaseA * 6.2832, points.t)

      bn = floor(lane * 3.0) * 0.333
      base = 0.7 + (1.0 - bn) * 0.6
      pulse = 0.88 + 0.12 * sin(pa * 2.0 + lane * 25.0)

      base * pulse
    EXPR
    outputs {
      out = render.scale
    }
  }

  block "Add" "hue_drift" {
    outputs {
      out = color.h
    }
  }

  block "MakeColorOKLCH" "color" {
    s = 0.92
    l = 0.76
    a = 0.95
    outputs {
      color = render.color
    }
  }

  block "RenderInstances2D" "render" {}
}
