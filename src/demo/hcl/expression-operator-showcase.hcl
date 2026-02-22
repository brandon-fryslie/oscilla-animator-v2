# Expression Operator Showcase
#
# Demonstrates Expression syntax in stable many-cardinality usage:
# - one->many mapping via mapField(...)
# - ternary selection on field values
# - vec3 constructor
# - swizzle/component access from vec3 input (.x/.y)

patch "Expression Operator Showcase" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 9000
    role = "timeRoot"
    outputs {
      phaseA = [pos.refs, scale.refs]
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
    count = 160
    outputs {
      elements = layout.elements
      t = [pos.refs, scale.refs, color.h]
    }
  }

  block "GridLayoutUV" "layout" {
    rows = 16
    cols = 10
    outputs {
      position = pos.refs
    }
  }

  block "Expression" "pos" {
    expression = "vec3(layout.position.x + (points.t > 0.5 ? 0.15 : -0.15) * sin(points.t * 18.8496 + mapField(clock.phaseA * 6.2832, points.t)), layout.position.y + (points.t > 0.5 ? -0.15 : 0.15) * cos(points.t * 18.8496 + mapField(clock.phaseA * 6.2832, points.t)), 0.0)"
    outputs {
      out = render.pos
    }
  }

  block "Expression" "scale" {
    expression = "0.75 + 0.2 * sin(points.t * 12.5664 + mapField(clock.phaseA * 6.2832, points.t))"
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
