# Ambiguities / Open Decisions

This file lists unresolved details that should be decided early in the rewrite. Everything not listed here is considered defined by the unified spec.

1) **Custom combine mode registry**
   - Where do custom combine reducers live (block registry vs global combine registry)?
   - How are they validated against TypeDesc?

1 answers:
write this unto the docs as an UNKNOWN we must resolve still

2) **Stateful primitive world coverage**
   - Should UnitDelay/Lag/SampleAndHold operate on all worlds (signal, field, event), or only on signal?
   - If fields are supported, define element identity rules for state storage.

2 Answer:
- Stateful primitives should operate on signal and field worlds only to start. can add more later if needed
- TBD

3) **Default source catalog**
   - Standard default values per TypeDesc (e.g., color, vec2, phase) are not yet enumerated.
   - Decide where these defaults live and how they are surfaced in UI.

3 Answer:
- Default sources can be set to any standard block that takes 0 inputs and satisfies the type constraints
- For now, we will implement a few blocks to make this easy:
  - We will need to implement polymorphic blocks before we can fully do this, for now implement separate types if needed
  - ConstantSignal - provides a constant signal value
    - Fields can use this if we automatically insert a Signal->Field broadcast adapter when it's set
    - No such thing as constant event or scalar
  - Time
    - How time blocks will work is that the graph normalizer collapses them all to a single time source with many connections
    - Users and other blocks can put as many time blocks on the board as they want, but there is only ONE global time and only ONE time block makes it to the compiler
    - Time blocks also provide phase and other various phase related stuff
    - Time blocks take 0 inputs and thus can be used directly as a default source
  - DefaultColorField will be a Field type
    - it should generate a rainbow pattern of some sort, something basic but obvious.  time is the only input.  we can improve/replace this later


4) **Event semantics**
   - Precise event payload shape and edge-detection behavior remain unspecified.

   - Combine semantics for event payloads (beyond boolean fired) need explicit rules.

4 Answers:

- Event payloads are not fully unspecified
- They contain at minimum these fields:
  - meta:
    - version <- the version
    - schema <- the schema for the event data.  there must be some sort of simple global event metadata schema registry. schema is the name of the schema, version is which version of the schema
  - data: {} <- the actual data

Combine semantics:
- For MVP, the combine semantics are "send all events to all listeners/outputs".  KISS
in the future (DEFERRED, but document/add to roadmap):
- We need a 'Filter' block that operates on the 'Event' world first
- We need a transform block that can transform the shape of the JSON data
- Filter and Transform, while being 'blocks' internally, will be added as lenses in the UI to make it easy for users