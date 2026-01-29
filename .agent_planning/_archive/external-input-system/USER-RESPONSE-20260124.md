# User Response: External Input System Plan

**Date:** 2026-01-24
**Status:** PENDING APPROVAL

## Decisions Made

1. **Architecture:** Option D — Channel Map with commit step
2. **Camera:** Normal/standard block with `isActive` boolean input
3. **Default Camera:** Default patch includes Camera block + ExternalInput('camera.isActive') wired together. Users can remove or modify it.

## Sprints

1. `channel-map` — External Input Channel Map Infrastructure (all HIGH confidence)
2. `camera-block` — Camera as Standard Block (all HIGH after default-patch decision resolved)

## Approval Status

Awaiting final approval on both sprints.
