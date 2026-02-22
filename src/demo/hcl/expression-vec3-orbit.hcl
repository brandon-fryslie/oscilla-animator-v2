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
    expression = "vec3((0.2 + 0.3 * points.t) * cos(points.t * 18.8496 + mapField(clock.phaseA * 6.2832, points.t)), (0.2 + 0.3 * points.t) * sin(points.t * 18.8496 + mapField(clock.phaseA * 6.2832, points.t)), 0.0)"
    outputs {
      out = render.pos
    }
  }

  block "Expression" "scale_expr" {
    expression = "0.65 + 0.25 * sin(points.t * 12.5664 + mapField(clock.phaseA * 6.2832, points.t))"
    outputs {
      out = render.scale
    }
  }

  block "MakeColorHSL" "color" {
    outputs {
      color = render.color
    }
  }

  block "RenderInstances2D" "render" {}
}
