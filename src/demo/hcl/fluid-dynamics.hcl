# Fluid Dynamics
#
# Steel-thread demo patch for the fluid-first GPU pass bundle path:
# composable fluid blocks -> compile-generated fluid WGSL pass bundle -> Rust worker renderer.

patch "Fluid Dynamics" {
  block "InfiniteTimeRoot" "clock" {
    periodAMs = 3000
    role = "timeRoot"
  }

  block "Ellipse" "dot" {
    rx = 0.5
    ry = 0.5
    outputs {
      shape = fluid_splat.shape
    }
  }

  block "FluidSplat" "fluid_splat" {
    count = 8192
    simResolution = 128
    radius = 20
    strength = 1.0
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
    strength = 18.0
    outputs {
      state = fluid_divergence.stateIn
    }
  }

  block "FluidDivergence" "fluid_divergence" {
    damping = 0.24
    outputs {
      state = fluid_pressure.stateIn
    }
  }

  block "FluidPressureJacobi" "fluid_pressure" {
    iterations = 20
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
