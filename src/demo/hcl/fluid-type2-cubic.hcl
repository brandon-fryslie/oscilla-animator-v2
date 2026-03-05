# Fluid Type2 Cubic
#
# Demonstrates fluid + Type 2 shape integration on the canonical GPU path.

patch "Fluid Type2 Cubic" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 3200
    role = "timeRoot"
  }

  block "CubicBezier2D" "curve" {
    resolution = 96
    p0x = -0.12
    p0y = -0.06
    p1x = -0.02
    p1y = 0.18
    p2x = 0.16
    p2y = -0.14
    p3x = 0.24
    p3y = 0.10
    outputs {
      shape = fluid_splat.shape
    }
  }

  block "FluidSplat" "fluid_splat" {
    count = 12288
    simResolution = 128
    radius = 18
    strength = 1.1
    centerX = 0.5
    centerY = 0.5
    outputs {
      state = fluid_curl.stateIn
    }
  }

  block "FluidCurl" "fluid_curl" {
    strength = 1.0
    outputs {
      state = fluid_vorticity.stateIn
    }
  }

  block "FluidVorticity" "fluid_vorticity" {
    strength = 20.0
    outputs {
      state = fluid_divergence.stateIn
    }
  }

  block "FluidDivergence" "fluid_divergence" {
    damping = 0.22
    outputs {
      state = fluid_pressure.stateIn
    }
  }

  block "FluidPressureJacobi" "fluid_pressure" {
    iterations = 24
    pressure = 1.0
    outputs {
      state = fluid_gradient.stateIn
    }
  }

  block "FluidGradientSubtract" "fluid_gradient" {
    strength = 1.0
    outputs {
      state = fluid_advect.stateIn
    }
  }

  block "FluidAdvect" "fluid_advect" {
    velocityDissipation = 0.992
    dyeDissipation = 0.996
    advection = 1.0
    outputs {
      state = fluid_present.state
    }
  }

  block "FluidPresent" "fluid_present" {
    particleScale = 0.02
    colorGain = 1.0
    outputs {
      controlPoints = render.controlPoints
      color = render.color
    }
  }

  block "RenderInstances2D" "render" {}
}
