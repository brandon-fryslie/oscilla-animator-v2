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
    value = 0.23
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
    value = 0.10
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
      controlPoints = [path-field.controlPoints, path-layout.controlPoints]
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
    value = 0.08
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
    rx = 0.013
    ry = 0.013
    outputs {
      shape = instances.element
    }
  }

  block "InstanceDomain" "instances" {
    count = 80
    outputs {
      rank = [path-layout.t, hue-shift.a]
    }
  }

  block "SamplePath" "path-layout" {
    outputs {
      position = center-path.refs
    }
  }

  block "Expression" "center-path" {
    expression = <<-EXPR
      // Path producers author around the origin.
      // Visual: move the sampled star field into viewport UV space so the animated path is visible.
      x = path_layout.position.x + 0.5
      y = path_layout.position.y + 0.5
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
    value = 0.14
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
    outputs {
      color = render.color
    }
  }

  block "RenderInstances2D" "render" {}
}
