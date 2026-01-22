In 3D you want the same pattern you just established for 2D paths:
•	Topology lives outside the value system (registry/asset, stable numeric IDs)
•	Values flowing through ports are fixed-width handles that reference dense buffers in slots
•	Modulation happens on numeric fields (points/vertices/normals/weights), not by mutating “objects”
•	Renderer consumes render-ready IR (sink only)

So the 3D equivalent of shape2d is not “a mesh object.” It’s a packed handle that points at geometry buffers plus material/style.

⸻

1) Types: add shape3d and mat4 now, even if you don’t render yet

PayloadType additions

type PayloadType =
| /* existing */
| 'shape2d'
| 'shape3d'
| 'mat4'      // optional but very useful for transforms
| 'vec3'      // you’ll need it anyway
| 'quat';     // optional convenience

Keep the same SignalType/Extent scheme: Signal<shape3d>, Field<shape3d>.

Combine constraints

Same rule as 2D: only first/last/layer for shape3d inputs.

This is the key “ready to go” part: it forces your graph semantics to support 3D shapes without introducing numeric-combine nonsense later.

⸻

2) Runtime representation: shape3d is a packed fixed-width record, just like shape2d

Define a second scalar bank for shape3d:

const SHAPE3D_WORDS = 12;

enum Shape3DWord {
TopologyId = 0,          // dispatch key (mesh topology / primitive kind)
VertexSlot = 1,          // FieldSlot id holding positions (vec3)
VertexCount = 2,         // number of vertices
IndexSlot = 3,           // FieldSlot id holding indices (u32) (0 if non-indexed)
IndexCount = 4,          // number of indices
NormalSlot = 5,          // optional normals (vec3), 0 if absent
UVSlot = 6,              // optional uvs (vec2), 0 if absent
TangentSlot = 7,         // optional tangents
MaterialRef = 8,         // style/material handle
Flags = 9,               // bitfield (winding, primitive type, etc.)
Reserved0 = 10,
Reserved1 = 11,
}

type Shape3DBank = Uint32Array;

And extend your scalar slot storage kinds:

type ScalarStorageKind = 'f32' | 'i32' | 'shape2d' | 'shape3d';

This is the main “future proofing”: once your runtime can store and move packed records, 3D is just “more records + more fields,” not a new architecture.

⸻

3) The 3D analogue of “path topology + control points”

2D path:
•	topology = verbs + point arity
•	geometry buffer = control points (vec2)

3D surface/mesh:
•	topology = primitive kind + index arity + attribute layout expectations
•	geometry buffers = vertex attributes

Canonical “arbitrary drawable” in 3D = Mesh-like

Represent everything drawable as either:
•	triangles (indexed triangle list)
•	lines (indexed lines)
•	points (point sprites)

That covers “arbitrary” the way your path model covers 2D.

So “random polygon” becomes “random polyhedron” or “random ribbon,” but the transport mechanism is identical: handle + buffers.

⸻

4) Modulation: keep it as field math from day one

Exactly as in 2D where you modulate Field<vec2> control points, in 3D you modulate:
•	Field<vec3> positions
•	optional Field<vec3> normals (or recompute)
•	optional Field<vec2> UVs
•	optional weights / per-vertex scalars

This means you should ensure your field system is payload-general enough:
•	Field<vec3> exists
•	kernels can map/zip fields with signals
•	your slot allocator supports vec3 fields (packed Float32Array with stride 3)

That’s the “middle” readiness requirement: nothing 3D-specific, just more payload sizes and strides.

⸻

5) Transform readiness: standardize on a transform pipeline now

Even if you don’t render 3D yet, decide that instances will carry transforms in a consistent way:
•	per-instance position: Field<vec3>
•	per-instance rotation: Field<quat> or Field<vec3> Euler (quat is safer)
•	per-instance scale: Field<float> or Field<vec3>
•	derived modelMatrix: Field<mat4> (optional)

In 2D you currently translate per particle and scale with size. In 3D, you’ll want the same conceptual split:
•	geometry is in local space
•	instance transform places it in world space
•	camera/projection happens in the renderer

This keeps 3D from leaking into your shape values.

⸻

6) Keep topology outside the value system in 3D too

Same rule: do not make “topology” a signal.
•	Mesh topology IDs refer to immutable registry entries (triangle list / line list, expected attributes, etc.)
•	Changing topology is compile-time or discrete rebuild (same as “sides” in polygon)

This avoids the worst 3D failure mode: topology churn and buffer reallocation every frame.

⸻

7) Render IR: make it dimension-agnostic in structure

You don’t need WebGL/3D renderer now, but you can structure IR so it extends cleanly:

Current:
•	instances2d pass with position/color/size/shape

Future:
•	instances3d pass with position/rotation/scale/material/shape3d

Same pattern: pass carries raw buffers + a shape handle (uniform or per-instance).

⸻

8) What to implement now to be “ready” later (without building 3D)

If you do only these, you won’t paint yourself into a corner:
1.	Add payload plumbing for vec3 (and optionally mat4, quat)
•	sizes/strides
•	field storage allocation
•	kernel support
2.	Generalize scalar storage banks
•	you already need shape2d as a packed bank
•	add the mechanism that easily extends to shape3d
3.	Define shape3d packed layout + slot meta (even unused)
•	no renderer required
•	just types + allocation + serialization/hotswap migration rules
4.	Define combine-mode restrictions for shape3d now
•	prevents bad graphs early

That’s it. If you do those, “3D later” becomes mostly: implement a 3D sink + a few primitive blocks that populate vertex/index slots.

This is the correct way to make the 2D path design naturally lift into 3D without re-architecting.