# Oscilla V3 Architecture Plan (High Level)

## Purpose

This plan captures the V3 architecture direction with a focus on hard boundaries, undo/redo, and server-sequenced collaboration. It is intentionally high level and structural, meant to be enforceable and difficult to violate.

## Goals

- Single mutable, serializable authoring model
- Undo/redo as a first-class requirement
- Server-sequenced collaboration as the primary model
- Explicit boundaries that prevent cross-layer leaks
- Preserve the strongest parts of V2 with minimal rework

## Non-Goals

- Picking concrete libraries or APIs
- Detailed model schemas or command definitions
- UI redesign
- Runtime algorithm changes

## Architectural Layers

### Authoring Model (Serializable)

- Source of truth for graph, params, settings, and other patch-serializable data
- Designed for snapshots, patches, and deterministic replay
- Undo/redo applies to all data in this layer
- Layout data is allowed here when it becomes persistable

### Command Log (Mutation API)

- The only way to change the authoring model
- Commands are explicit operations, not state diffs
- Undo/redo is implemented as compensating commands
- Collaboration is built by ordering and replaying commands

### Runtime Services (Derived)

- Compiler, runtime, renderer, debug buffers, caches
- Consumes the authoring model and command log
- Not serialized and not undoable
- Must not mutate the authoring model

### UI Layer (Ephemeral)

- Reads authoring state and derived runtime data
- Dispatches commands only
- Ephemeral UI state is local and not undoable
- Selection and hover are intentionally outside undo/redo

## Boundary Enforcement (Structural)

- Physical separation of layers into distinct modules or packages
- Strict import graph rules
- Authoring model cannot import runtime or UI
- Runtime cannot import UI
- UI can import model and runtime
- Command-only mutation policy enforced by middleware
- Public model API is read-only except command entry points

## Undo/Redo Requirements

- Applies to all serializable authoring data
- Works through command inversion, not state rewind
- Compatible with server-sequenced collaboration
- Extensible to layout history when needed

## Collaboration Requirements

- Server-sequenced commands are the primary sync model
- Clients can apply optimistic commands with reconciliation
- Command log is canonical for sync and replay
- Model snapshots can be used for fast resync

## Migration and Reuse Strategy

### Keep

- Compiler pipeline and IR architecture
- Block registry and lowering system
- Patch DSL import and export
- Diagnostics types and tooling
- Most UI components with minimal adaptation

### Rebuild

- Authoring model as a serializable core
- Mutation API to be command-only
- Eventing to flow from commands rather than ad-hoc signals
- Boundary enforcement via module rules

## Open Decisions

- Single repo with multiple packages vs multi-repo split
- Specific state library for the authoring model
- Concrete command schema and versioning strategy
- Collaboration transport and server design

## Next Steps

- Define package boundaries and dependency rules
- Draft the command schema and naming conventions
- Define the authoring model scope and serialization versioning
- Establish a collaboration ordering protocol

## Decision Log

- Collaboration model: server-sequenced commands (primary)
- Undo/redo scope: all serializable authoring data (graph, params, settings; layouts when persistable)
- UI state: selection and hover are explicitly excluded from undo/redo
