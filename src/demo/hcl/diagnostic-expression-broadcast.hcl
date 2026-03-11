# Diagnostic: Expression Broadcast
#
# Purpose:
# - Validates one->many broadcasting via mapField(...)
# - Validates trig math in Expression blocks on GPU path
# - Validates coupled position+scale animation from the same time source

patch "Diagnostic - Expression Broadcast" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 6000
    role = "timeRoot"
    outputs {
      phaseA = [position.refs, scale.refs]
    }
  }

  block "Ellipse" "dot" {
    rx = 0.01
    ry = 0.01
    outputs {
      shape = instances.element
    }
  }

  block "Array" "instances" {
    count = 96
    outputs {
      elements = grid.elements
      t = [position.refs, scale.refs, color.h]
    }
  }

  block "GridLayoutUV" "grid" {
    rows = 12
    cols = 8
    outputs {
      controlPoints = position.refs
    }
  }

  block "Expression" "position" {
    expression = <<-EXPR
      phase = mapField(clock.phaseA * 6.2832, instances.t)
      lane = instances.t * 18.8496
      wobble = phase + lane
      x = grid.controlPoints.x + 0.04 * sin(wobble)
      y = grid.controlPoints.y + 0.04 * cos(wobble)
      vec2(x, y)
    EXPR
    outputs {
      out = render.controlPoints
    }
  }

  block "Expression" "scale" {
    expression = <<-EXPR
      phase = mapField(clock.phaseA * 6.2832, instances.t)
      0.7 + 0.22 * sin(phase + instances.t * 12.5664)
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
}
