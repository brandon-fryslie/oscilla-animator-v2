# Attractor Bloom
#
# Mouse-guided eclipse bloom with three readable layers:
# - a dim lattice scaffold that stays visible as reference
# - a cool mist of attracted dots that breathes around the cursor
# - a hot petal crown whose target orbits the cursor for asymmetry
#
# How to play:
# - Move mouse: steer the bloom center
# - Move horizontally: push the attractor strength from gentle drag to snap
# - Watch the cool mist and hot crown split around the orbiting satellite

patch "Attractor Bloom" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 12000
    periodBMs = 7500
    role = "timeRoot"
    outputs {
      phaseA = [hard_target.refs, mist_hue.b, crown_pulse.phase]
      phaseB = [crown_ring.phase, shard_wobble.phase, crown_hue_shift.b]
    }
  }

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

  block "Lag" "mouse_x_smooth" {
    smoothing = 0.18
    initialValue = 0.5
    outputs {
      out = [soft_target.refs, hard_target.refs]
    }
  }

  block "Lag" "mouse_y_smooth" {
    smoothing = 0.18
    initialValue = 0.5
    outputs {
      out = [soft_target.refs, hard_target.refs]
    }
  }

  block "Lag" "strength_smooth" {
    smoothing = 0.24
    initialValue = 0.5
    outputs {
      out = [mist_strength.in, crown_strength.in]
    }
  }

  block "ScaleBias" "mist_strength" {
    scale = 0.34
    bias = 0.18
    outputs {
      out = mist_attract.strength
    }
  }

  block "ScaleBias" "crown_strength" {
    scale = 0.58
    bias = 0.24
    outputs {
      out = crown_position.refs
    }
  }

  block "Expression" "soft_target" {
    expression = <<-EXPR
      vec2(mouse_x_smooth.out, mouse_y_smooth.out)
    EXPR
    outputs {
      out = mist_attract.target
    }
  }

  block "Expression" "hard_target" {
    expression = <<-EXPR
      base_x = mouse_x_smooth.out
      base_y = mouse_y_smooth.out
      orbit_radius = 0.14
      orbit_angle = clock.phaseA * 6.2832

      target_x = base_x + orbit_radius * cos(orbit_angle)
      target_y = base_y + orbit_radius * sin(orbit_angle)
      vec2(target_x, target_y)
    EXPR
    outputs {
      out = crown_position.refs
    }
  }

  # --- Reference scaffold ---

  block "Ellipse" "mist_dot" {
    rx = 0.0054
    ry = 0.0054
    outputs {
      shape = field_instances.element
    }
  }

  block "Array" "field_instances" {
    count = 324
    outputs {
      elements = [field_layout.elements, scaffold_color.elements]
      t = [mist_hue.a, mist_scale.in]
    }
  }

  block "GridLayoutUV" "field_layout" {
    rows = 18
    cols = 18
    outputs {
      controlPoints = [scaffold_render.controlPoints, mist_attract.points]
    }
  }

  block "FieldConstColor" "scaffold_color" {
    r = 0.07
    g = 0.18
    b = 0.52
    a = 0.18
    outputs {
      color = scaffold_render.color
    }
  }

  block "Const" "scaffold_scale" {
    value = 0.42
    outputs {
      out = scaffold_render.scale
    }
  }

  block "AttractorLayout" "mist_attract" {
    outputs {
      controlPoints = mist_render.controlPoints
    }
  }

  block "ScaleBias" "mist_scale" {
    scale = 0.62
    bias = 0.52
    outputs {
      out = mist_render.scale
    }
  }

  block "Add" "mist_hue" {
    outputs {
      out = mist_color.h
    }
  }

  block "MakeColorOKLCH" "mist_color" {
    s = 0.98
    l = 0.66
    a = 0.34
    outputs {
      color = mist_render.color
    }
  }

  # --- Crown petals ---

  block "Rect" "shard" {
    width = 0.026
    height = 0.007
    cornerRadius = 0.002
    resolution = 24
    outputs {
      controlPoints = shard_wobble.controlPoints
    }
  }

  block "ShapeWobble2D" "shard_wobble" {
    amount = 0.0044
    frequency = 8
    outputs {
      points = shard_shape.controlPoints
    }
  }

  block "MakeShape2D" "shard_shape" {
    closed = true
    outputs {
      shape = crown_instances.element
    }
  }

  block "Array" "crown_instances" {
    count = 112
    outputs {
      elements = crown_ring.elements
      t = [crown_hue_shift.a, crown_scale_base.in, crown_position.refs]
    }
  }

  block "CircleLayoutUV" "crown_ring" {
    radius = 0.4
    outputs {
      controlPoints = crown_position.refs
    }
  }

  block "Expression" "crown_position" {
    expression = <<-EXPR
      base_x = crown_ring.controlPoints.x
      base_y = crown_ring.controlPoints.y
      lane = crown_instances.t

      target_x = mapField(hard_target.out.x, crown_instances.t)
      target_y = mapField(hard_target.out.y, crown_instances.t)
      pull = mapField(crown_strength.out, crown_instances.t)

      sweep = lane * 18.0 + clock.phaseB * 6.2832
      x = base_x + (target_x - base_x) * pull + 0.028 * sin(sweep + base_y * 10.0)
      y = base_y + (target_y - base_y) * pull + 0.028 * cos(sweep - base_x * 10.0)
      vec2(x, y)
    EXPR
    outputs {
      out = crown_render.controlPoints
    }
  }

  block "Oscillator" "crown_pulse" {
    outputs {
      out = crown_pulse_shape.in
    }
  }

  block "ScaleBias" "crown_scale_base" {
    scale = 0.62
    bias = 0.76
    outputs {
      out = crown_scale_noise.value
    }
  }

  block "Const" "crown_pulse_amount" {
    value = 0.26
    outputs {
      out = crown_pulse_shape.scale
    }
  }

  block "Const" "crown_pulse_center" {
    value = 0.16
    outputs {
      out = crown_pulse_shape.bias
    }
  }

  block "ScaleBias" "crown_pulse_shape" {
    outputs {
      out = crown_scale_noise.amount
    }
  }

  block "Const" "crown_scale_seed" {
    value = 19
    outputs {
      out = crown_scale_noise.seed
    }
  }

  block "NoisyBroadcast" "crown_scale_noise" {
    outputs {
      out = crown_render.scale
    }
  }

  block "Const" "crown_hue_offset" {
    value = 0.08
    outputs {
      out = crown_hue_shift.b
    }
  }

  block "Add" "crown_hue_shift" {
    outputs {
      out = crown_color.h
    }
  }

  block "MakeColorOKLCH" "crown_color" {
    s = 1.0
    l = 0.78
    a = 0.9
    outputs {
      color = crown_render.color
    }
  }

  block "RenderInstances2D" "scaffold_render" {}
  block "RenderInstances2D" "mist_render" {}
  block "RenderInstances2D" "crown_render" {}
}
