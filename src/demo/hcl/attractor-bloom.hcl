# Attractor Bloom
#
# A fuller AttractorLayout composition with:
# - Smoothed mouse control for target position and strength
# - Two independent geometry layers (grid dots + ring shards)
# - Dual attractors (soft + hard) with different behavior
# - Animated hue phase and per-layer scale shaping
#
# How to play:
# - Move mouse: drags the bloom center
# - Move horizontally: increases/decreases attraction strength
# - Watch soft (cyan) and hard (magenta) layers react differently

patch "Attractor Bloom" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 12000
    periodBMs = 7000
    role = "timeRoot"
    outputs {
      phaseA = [hard_target.refs, soft_hue.b]
      phaseB = [circle_layout.phase, wobble.phase, hard_hue_phase.a]
    }
  }

  # Mouse IO (one-cardinality controls)
  block "ExternalInput" "mouse_x" {
    channel = "mouse.x"
    outputs {
      value = [mouse_x_smooth.target, strength_smooth.target]
    }
  }

  block "ExternalInput" "mouse_y" {
    channel = "mouse.y"
    outputs {
      value = mouse_y_smooth.target
    }
  }

  # Smooth controls for more musical motion
  block "Lag" "mouse_x_smooth" {
    smoothing = 0.22
    initialValue = 0.5
    outputs {
      out = [soft_target.refs, hard_target.refs]
    }
  }

  block "Lag" "mouse_y_smooth" {
    smoothing = 0.22
    initialValue = 0.5
    outputs {
      out = [soft_target.refs, hard_target.refs]
    }
  }

  block "Lag" "strength_smooth" {
    smoothing = 0.28
    initialValue = 0.5
    outputs {
      out = [soft_strength.in, hard_strength.in]
    }
  }

  block "ScaleBias" "soft_strength" {
    scale = 0.3
    bias = 0.08
    outputs {
      out = soft_attract.strength
    }
  }

  block "ScaleBias" "hard_strength" {
    scale = 0.75
    bias = 0.12
    outputs {
      out = hard_attract.strength
    }
  }

  # Targets:
  # - soft target follows smoothed mouse directly
  # - hard target orbits around mouse for richer motion
  block "Expression" "soft_target" {
    expression = "vec2(mouse_x_smooth.out, mouse_y_smooth.out)"
    outputs {
      out = soft_attract.target
    }
  }

  block "Expression" "hard_target" {
    expression = "vec2(mouse_x_smooth.out + 0.08 * cos(clock.phaseA * 6.2832), mouse_y_smooth.out + 0.08 * sin(clock.phaseA * 6.2832))"
    outputs {
      out = hard_attract.target
    }
  }

  # Layer A shape: dots
  block "Ellipse" "dot" {
    rx = 0.0048
    ry = 0.0048
    outputs {
      shape = grid_instances.element
    }
  }

  block "Array" "grid_instances" {
    count = 256
    outputs {
      elements = [grid_layout.elements, base_color.elements]
      t = [soft_hue.a, soft_scale.in]
    }
  }

  block "GridLayoutUV" "grid_layout" {
    rows = 16
    cols = 16
    outputs {
      position = base_render.pos
      controlPoints = soft_attract.points
    }
  }

  block "AttractorLayout" "soft_attract" {
    outputs {
      position = soft_render.pos
    }
  }

  block "ScaleBias" "soft_scale" {
    scale = 0.35
    bias = 0.35
    outputs {
      out = soft_render.scale
    }
  }

  block "Add" "soft_hue" {
    outputs {
      out = soft_color.h
    }
  }

  block "MakeColorHSL" "soft_color" {
    s = 0.88
    l = 0.56
    a = 0.62
    outputs {
      color = soft_render.color
    }
  }

  block "FieldConstColor" "base_color" {
    r = 0.08
    g = 0.24
    b = 0.95
    a = 0.2
    outputs {
      color = base_render.color
    }
  }

  # Layer B shape: wobbled rect shards
  block "Rect" "shard" {
    width = 0.01
    height = 0.003
    cornerRadius = 0
    resolution = 24
    outputs {
      controlPoints = wobble.controlPoints
    }
  }

  block "ShapeWobble2D" "wobble" {
    amount = 0.0025
    frequency = 7
    outputs {
      points = shard_shape.controlPoints
    }
  }

  block "MakeShape2D" "shard_shape" {
    closed = 1
    outputs {
      shape = ring_instances.element
    }
  }

  block "Array" "ring_instances" {
    count = 120
    outputs {
      elements = circle_layout.elements
      t = [hard_hue.a, hard_scale.in]
    }
  }

  block "CircleLayoutUV" "circle_layout" {
    radius = 0.35
    outputs {
      controlPoints = hard_attract.points
    }
  }

  block "AttractorLayout" "hard_attract" {
    outputs {
      position = hard_render.pos
    }
  }

  block "ScaleBias" "hard_scale" {
    scale = 0.6
    bias = 0.45
    outputs {
      out = hard_render.scale
    }
  }

  block "Const" "hard_hue_offset" {
    value = 0.28
    outputs {
      out = hard_hue_phase.b
    }
  }

  block "Add" "hard_hue_phase" {
    outputs {
      out = hard_hue.b
    }
  }

  block "Add" "hard_hue" {
    outputs {
      out = hard_color.h
    }
  }

  block "MakeColorHSL" "hard_color" {
    s = 0.82
    l = 0.6
    a = 0.78
    outputs {
      color = hard_render.color
    }
  }

  block "RenderInstances2D" "base_render" {}
  block "RenderInstances2D" "soft_render" {}
  block "RenderInstances2D" "hard_render" {}
}
