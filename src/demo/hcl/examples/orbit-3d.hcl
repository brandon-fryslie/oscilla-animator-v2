# Orbit 3D
#
# The orbit demo with Z-depth modulation — instances spiral in 3D space.
# Z is computed from sin(theta + time) * radius, creating a helix that
# rotates when viewed in perspective mode (click the 3D button).
#
# Demonstrates: positionZ input on RenderInstances2D, 2.5D depth ordering.

patch "Orbit 3D" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 6000
    periodBMs = 12000
    role = "timeRoot"
    outputs {
      phaseA = time-scale.a
      phaseB = color-shift.b
    }
  }

  # --- Shape + instances ---

  block "Ellipse" "dot" {
    rx = 0.012
    ry = 0.012
    outputs {
      shape = instances.element
    }
  }

  block "InstanceDomain" "instances" {
    count = 200
    outputs {
      rank = [theta-scale.a, r-scale.a, color-shift.a, dot-scale.in]
    }
  }

  # --- Spiral angle: theta = t * 18.85 (3 turns) ---

  block "Const" "max-angle" {
    value = 18.8496
    outputs {
      out = theta-scale.b
    }
  }

  block "Multiply" "theta-scale" {
    outputs {
      out = theta.a
    }
  }

  # --- Add time-based rotation: theta + phaseA * 2pi ---

  block "Const" "two-pi" {
    value = 6.2832
    outputs {
      out = time-scale.b
    }
  }

  block "Multiply" "time-scale" {
    outputs {
      out = theta.b
    }
  }

  block "Add" "theta" {
    outputs {
      out = [cos-theta.input, sin-theta.input]
    }
  }

  # --- Radius: r = t * 0.4 ---

  block "Const" "expansion" {
    value = 0.4
    outputs {
      out = r-scale.b
    }
  }

  block "Multiply" "r-scale" {
    outputs {
      out = [make-x.a, make-y.a]
    }
  }

  # --- Trig: cos(theta), sin(theta) ---

  block "Cos" "cos-theta" {
    outputs {
      result = make-x.b
    }
  }

  block "Sin" "sin-theta" {
    outputs {
      result = make-y.b
    }
  }

  # --- Cartesian: x = r * cos(theta), y = r * sin(theta) ---

  block "Multiply" "make-x" {
    outputs {
      out = pos.x
    }
  }

  block "Multiply" "make-y" {
    outputs {
      out = pos.y
    }
  }

  # --- Construct vec3 position and project to centered UV control points ---

  block "Construct" "pos" {
    outputs {
      out = pos2.refs
    }
  }

  block "Expression" "pos2" {
    expression = <<-EXPR
      vec2(pos.out.x + 0.5, pos.out.y + 0.5)
    EXPR
    outputs {
      out = render.controlPoints
    }
  }

  # --- Z depth: sin(theta + time) * radius * 0.3 (helix!) ---

  block "Expression" "z-expr" {
    expression = <<-EXPR
      t = instances.rank
      theta = t * 18.8496
      time_offset = clock.phaseA * 6.2832
      r = t * 0.4
      helix = sin(theta + time_offset) * r * 0.5
      noise = sin(t * 137.5 + time_offset * 3.0) * 0.12
      wobble = cos(t * 89.3 - time_offset * 1.7) * 0.08
      helix + noise + wobble
    EXPR
    inputs {
      refs = [instances.rank, clock.phaseA]
    }
    outputs {
      out = render.positionZ
    }
  }

  # --- Per-element rainbow shifted by time ---

  block "Add" "color-shift" {
    outputs {
      out = color.h
    }
  }

  block "MakeColorOKLCH" "color" {
    outputs {
      color = render.color
    }
  }

  # --- Dots grow from center to edge: scale = t * 1.5 + 0.3 ---

  block "Const" "scale-amt" {
    value = 1.5
    outputs {
      out = dot-scale.scale
    }
  }

  block "Const" "scale-base" {
    value = 0.3
    outputs {
      out = dot-scale.bias
    }
  }

  block "ScaleBias" "dot-scale" {
    outputs {
      out = render.scale
    }
  }

  block "RenderInstances2D" "render" {}
}
