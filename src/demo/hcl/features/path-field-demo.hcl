# Path Field Demo
#
# Star path rendered with flowing instances while PathField derivatives are used
# as live data. The star radii are animated, so PathField.arcLength changes over
# time and modulates render scale.
#
# Demonstrates:
# - PathField extraction from ProceduralStar control points
# - PathLayout distribution along the animated shape path
# - PathField.arcLength -> Reduce -> scale modulation
# - Expression-based recentering from origin-authored path space into render UV space

patch "Path Field Demo" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 7000
    periodBMs = 5000
    role = "timeRoot"
    outputs {
      phaseA = hue-shift.b
      phaseB = star-breath.phase
    }
  }

  # Animated star source path
  block "Oscillator" "star-breath" {
    outputs {
      out = [star-outer.in, star-inner.in, scale-map.in]
    }
  }

  block "Const" "outer-amt" {
    value = 0.07
    outputs {
      out = star-outer.scale
    }
  }

  block "Const" "outer-base" {
    value = 0.30
    outputs {
      out = star-outer.bias
    }
  }

  block "ScaleBias" "star-outer" {
    outputs {
      out = star.outerRadius
    }
  }

  block "Const" "inner-amt" {
    value = 0.035
    outputs {
      out = star-inner.scale
    }
  }

  block "Const" "inner-base" {
    value = 0.13
    outputs {
      out = star-inner.bias
    }
  }

  block "ScaleBias" "star-inner" {
    outputs {
      out = star.innerRadius
    }
  }

  block "ProceduralStar" "star" {
    points = 5
    outputs {
      controlPoints = path-field.controlPoints
      shape = path-layout.shape
    }
  }

  # Extract dynamic path properties; arc length is used as live modulation data.
  block "PathField" "path-field" {
    outputs {
      arcLength = path-length.field
    }
  }

  block "Reduce" "path-length" {
    op = "max"
    outputs {
      one = length-scale.a
    }
  }

  block "Const" "length-scale-amt" {
    value = 0.6
    outputs {
      out = length-scale.b
    }
  }

  block "Multiply" "length-scale" {
    outputs {
      out = scale-map.bias
    }
  }

  # Render instances distributed along the star path
  block "Ellipse" "marker" {
    rx = 0.032
    ry = 0.032
    outputs {
      shape = instances.element
    }
  }

  block "Array" "instances" {
    count = 80
    outputs {
      elements = path-layout.elements
      t = hue-shift.a
    }
  }

  block "PathLayout" "path-layout" {
    spacing = 1.0
    outputs {
      controlPoints = center-path.refs
    }
  }

  block "Expression" "center-path" {
    expression = <<-EXPR
      // Path producers author around the origin.
      // Visual: move the sampled star field into viewport UV space so the animated path is visible.
      x = path_layout.controlPoints.x + 0.5
      y = path_layout.controlPoints.y + 0.5
      vec2(x, y)
    EXPR
    outputs {
      out = render.controlPoints
    }
  }

  block "Add" "hue-shift" {
    outputs {
      out = color.h
    }
  }

  block "Const" "scale-amt" {
    value = 0.3
    outputs {
      out = scale-map.scale
    }
  }

  block "ScaleBias" "scale-map" {
    outputs {
      out = render.scale
    }
  }

  block "MakeColorOKLCH" "color" {
    s = 0.95
    l = 0.78
    a = 0.95
    outputs {
      color = render.color
    }
  }

  block "RenderInstances2D" "render" {}
}
