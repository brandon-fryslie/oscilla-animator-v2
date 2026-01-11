# Oscilla Animator Tutorial

Learn the fundamentals of Oscilla Animator by building an animation from scratch. This tutorial uses the **Tutorial** macro which provides all the blocks you need, pre-arranged but mostly unconnected.

## Getting Started

1. Open Oscilla Animator
2. Click on the block palette (left side)
3. Find and click **📚 Tutorial** in the Quick Start section
4. The macro loads with 13 numbered blocks spread across the lanes

You should see blocks numbered ①-⑬ arranged in lanes, but the canvas is blank because the render block has no data to display yet.

---

## Part 1: Make Something Appear

**Goal:** Get dots on screen by connecting the essential data flow.

### Step 1: Connect the Domain

The **Grid Domain** (⑧) creates a grid of elements. The **Render** block (⑬) draws them. We need to tell Render what elements to draw.

1. Find **⑧ Grid Domain** in the Fields lane
2. Find its **domain** output (right side of the block)
3. Drag from **domain** → **⑬ Render**'s **domain** input

> **Concept:** The *domain* defines "what elements exist". Without a domain, Render has nothing to draw.

### Step 2: Connect Positions

Now Render knows *what* to draw, but not *where*.

1. Find **⑧ Grid Domain**'s **pos0** output (base positions)
2. Drag from **pos0** → **⑬ Render**'s **positions** input

**You should now see a grid of dots on the canvas!**

> **Concept:** Field outputs (like pos0) carry per-element data. Each element in the domain gets its own position.

---

## Part 2: Add Animation

The dots are static. Let's make them breathe.

### Step 3: Understand the Time System

Look at the **Phase lane** at the top. The **① Time Root** is already publishing to the **phaseA** bus (shown in the bus panel). This creates a cycling phase value from 0 to 1 every 2 seconds.

### Step 4: Connect the Oscillator

The **② Oscillator** is already receiving phase from the phaseA bus (thanks to auto-bus subscription). It converts phase into a smooth wave.

1. Find **② Oscillator**'s **out** output
2. Connect it to **⑬ Render**'s **radius** input

**The dots should now pulse in size!**

> **Concept:** Signals are time-varying values. The Oscillator takes phase (0→1) and outputs a sine wave that goes -1→1→-1.

But wait - the dots disappear! That's because the sine wave goes negative. Let's fix it.

### Step 5: Use the Shaper

The **③ Shaper** transforms signals. It's already receiving the Oscillator's output... wait, it's not connected! Let's fix that:

1. Connect **② Oscillator**'s **out** → **③ Shaper**'s **in** input
2. Connect **③ Shaper**'s **out** → **⑬ Render**'s **radius** input

The Shaper with "smoothstep" will remap the values to 0→1, making the animation smoother.

> **Tip:** In the Inspector, you can change the Shaper's curve type to see different effects.

---

## Part 3: Add Color

### Step 6: Connect the Color LFO

The **⑥ Color LFO** generates cycling colors from phase. It's already receiving phase from the phaseA bus.

But wait - Color LFO outputs a **Signal** (single color for the whole scene), and Render's color input needs a **Field** (color per element).

We need to use the **⑪ Broadcast Signal** block to spread the signal across all elements:

1. Connect **⑥ Color LFO**'s **color** → **⑪ Broadcast Signal**'s **signal** input
2. Connect **⑧ Grid Domain**'s **domain** → **⑪ Broadcast Signal**'s **domain** input
3. Connect **⑪ Broadcast Signal**'s **out** → **⑬ Render**'s **color** input

**The dots should now cycle through colors!**

> **Concept:** The type system distinguishes between Signals (one value) and Fields (per-element values). Broadcast converts Signal → Field.

---

## Part 4: Per-Element Variation

Right now all dots look the same. Let's add per-element color variation.

### Step 7: Use the ID Hash

The **⑨ ID Hash (Random)** creates a unique random value for each element based on its stable ID.

1. Connect **⑧ Grid Domain**'s **domain** → **⑨ ID Hash**'s **domain** input

### Step 8: Colorize from Hash

The **⑩ Colorize** block creates colors from values.

1. Connect **⑨ ID Hash**'s **hash** → **⑩ Colorize**'s **values** input
2. Connect **⑩ Colorize**'s **color** → **⑬ Render**'s **color** input (replacing the broadcast)

**Each dot now has its own color!**

> **Concept:** ID Hash creates stable per-element randomness. The same element always gets the same hash, so colors don't flicker.

---

## Part 5: Rhythmic Accents (Advanced)

The **④ Pulse Divider** and **⑤ Envelope** work together to create rhythmic accents.

### How It Works

- **④ Pulse Divider** divides the phase cycle into beats (4 by default)
- **⑤ Envelope** responds to each beat with an attack/decay shape
- They're already connected (this connection is essential for Envelope to work)

### Step 9: Connect the Energy

1. Notice **⑤ Envelope**'s **value** is already published to the **energy** bus
2. In the Inspector for **⑬ Render**, you can add a bus listener on the **radius** input
3. Select the **energy** bus and add a **scale** lens to map the range

**The dots now pulse with rhythmic accents!**

> **Concept:** The bus system lets you route signals without direct wires. Lenses transform values as they travel through buses.

---

## Summary: The Data Flow

```
Time Root (①)
    │
    ├──→ phaseA bus ──→ Oscillator (②) ──→ Shaper (③) ──→ radius
    │                       │
    │                       └──→ ColorLFO (⑥) ──→ Broadcast (⑪) ──→ color
    │
    └──→ Pulse Divider (④) ──→ Envelope (⑤) ──→ energy bus ──→ radius

Grid Domain (⑧)
    │
    ├──→ domain ──→ Render (⑬)
    ├──→ positions ──→ Render (⑬)
    │
    └──→ ID Hash (⑨) ──→ Colorize (⑩) ──→ color
```

---

## Key Concepts Learned

| Concept | Description |
|---------|-------------|
| **Domain** | Defines what elements exist (the "what") |
| **Fields** | Per-element data (positions, colors, sizes) |
| **Signals** | Time-varying single values |
| **Broadcast** | Converts Signal → Field (spreads one value to all elements) |
| **Phase** | 0→1 cycle value from Time Root |
| **Buses** | Named channels for routing signals without wires |
| **Lenses** | Transform values as they travel through buses |

---

## Next Steps

- Change the Grid Domain parameters to make larger/smaller grids
- Try different Oscillator waveforms (triangle, saw)
- Adjust Envelope attack/decay for different rhythmic feels
- Add more blocks from the palette
- Explore the other macros to see complete working patches

Happy animating! 🎨
