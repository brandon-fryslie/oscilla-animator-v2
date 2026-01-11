Here is the updated technical specification. It standardizes the terminology to match standard signal processing definitions:

* **Drive:** To control the *input parameters* of a generator.
* **Override:** To replace the *output signal* of a generator.
* **Instantaneous Feedback:** The forbidden loop.

---

# Technical Specification: Rail Architecture and Modulation

### 1. The Core Definition

To resolve the contradiction, we adhere to the standard definition of "driving" a signal generator.

**Definition:** To **drive** a component is to provide the control signals (inputs) that determine its behavior.

Therefore, **Rails are absolutely driven by the patch.**
However, they are driven exclusively through their **parameters**, never by forcing their **output**.

### 2. What a Rail Is

A Rail is a deterministic function of TimeRoot and a set of input parameters.

**Formal Definition:**


**Properties:**
Because Rails are time-bases, they must be:

* Rewindable
* Seekable
* Exportable
* Identical every time `t` is evaluated

### 3. Allowed Interaction: "Driving the Rail"

You drive a rail by binding patch signals to its **Parameters**.

**Mechanism:**

* **Target:** `Period`, `PhaseOffset`, `PaletteIndex`, `Tempo`, `Swing`, `WindowSize`.
* **Constraint:** All driving signals are implicitly **frame-latched** (sampled from `t-1`).
* **Logic:**



**Why this is "Driving":**
The patch actively controls the behavior of the generator. The rail is the source of truth, but the patch tells it *how* to generate. This allows for:

* Tempo modulation
* Clock warping
* Evolving cycles
* FM-style synthesis behavior

### 4. Allowed Interaction: "Overriding the Signal"

You may replace the final signal produced by a rail with a different signal from the patch.

**Mechanism:**

* **Target:** The Rail's Output Bus.
* **Constraint:** If the overriding source depends on the rail itself, it must be **frame-latched** to prevent loops.
* **Logic:**



*(Where UserBus effectively acts as an external oscillator)*

**Why this is not "Driving":**
This is a **Source Swap**. You are effectively unplugging the internal generator and plugging in an external signal.

### 5. Forbidden Interaction: "Instantaneous Feedback"

You cannot algebraically mix a bus into a rail's output *at the same instant* that the rail is being calculated.

**Mechanism:**

* **Logic:** `PhaseA(t) = f(t) + Bus(t)`
* **Result:** Algebraic Loop (Time Paradox).

This breaks scrubbing, seeking, and determinism. This is the only "red line."

### 6. The System Model: A Dynamical System

By defining "Driving" as **Latched Parameter Modulation**, Oscilla functions as a professional dynamical system rather than a toy timeline.

**The Flow:**

1. **Frame `n**`:
* `Params = Sample(Bus)`
* `RailOutput = f(Time, Params)`


2. **Processing**:
* Patch calculates new state based on `RailOutput`.


3. **Frame `n+1**`:
* Rail acts on new Params derived from Frame `n`.



**Capabilities:**
This architecture enables:

* Phase-locked tempo changes
* Morphing palettes
* Rhythmic accelerando
* Polyrhythms
* Live performance control

**Final Rule:**
Rails are **Driven** by the patch (via Parameters).
Rails are **Observed** by the patch (via Output).
The loop is closed by the **Frame Delay**.