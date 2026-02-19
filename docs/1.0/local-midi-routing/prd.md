# Local MIDI Port Routing - Product Requirements Document

**Created:** 2026-02-18
**Status:** Approved
**Owner:** Development Team

## Problem Statement

The current MIDI routing implementation only supports routing between remote servers. Users cannot route MIDI messages between ports on the same local server using the same configuration interface. This limits the utility of the dashboard for local MIDI workflows such as:

- Routing a USB MIDI keyboard to a software synth on the same machine
- Splitting one MIDI input to multiple local outputs
- Creating local MIDI processing chains

## User Stories

- As a musician, I want to route my USB MIDI keyboard to my software synth on the same computer so that I can use the dashboard's routing features locally
- As a studio engineer, I want to configure local MIDI routes alongside remote routes so that I have a unified interface for all MIDI routing
- As a developer, I want the local routing to use the same configuration schema as remote routing so that the UI and API remain consistent

## Success Criteria

- [ ] Users can select "local" as a server option when creating routes
- [ ] Routes with source and/or destination set to "local" work correctly
- [ ] `/api/local/ports` endpoint returns available local MIDI ports
- [ ] Local routing has the same latency characteristics as remote routing
- [ ] Integration tests verify local route message forwarding

## Scope

### In Scope

- MidiClient interface abstraction for MIDI server communication
- LocalClient implementation targeting local MIDI server
- Client factory pattern for selecting appropriate client
- `/api/local/ports` endpoint
- Updates to RoutingEngine to support local server designation
- Unit and integration tests

### Out of Scope

- UI changes (frontend will use existing server selection, just with "local" option)
- Auto-detection of local vs remote (explicit "local" keyword required)
- Changes to the MIDI server itself (only dashboard API server changes)
- MIDI message filtering or transformation

## Dependencies

- Existing RemoteClient implementation (will implement shared interface)
- Existing RoutingEngine (will be modified to use client factory)
- Local MIDI HTTP server must be running for local routing to work

## Open Questions

- [x] Should "local" be auto-detected or explicit? **Decision: Explicit "local" keyword**
- [x] Should local ports use the same endpoint as remote? **Decision: Dedicated `/api/local/ports` endpoint**

## Appendix

### Route Configuration Example

```typescript
{
  id: "route-123",
  enabled: true,
  source: { serverUrl: "local", portId: "input-0", portName: "USB Keyboard" },
  destination: { serverUrl: "local", portId: "output-1", portName: "Synth" }
}
```

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      RoutingEngine                          │
│                           │                                 │
│                    getMidiClient()                          │
│                      ┌────┴────┐                            │
│                      │ Factory │                            │
│                      └────┬────┘                            │
│              ┌────────────┼────────────┐                    │
│              ▼                         ▼                    │
│      ┌─────────────┐           ┌─────────────┐              │
│      │ LocalClient │           │RemoteClient │              │
│      └──────┬──────┘           └──────┬──────┘              │
│             │                         │                     │
└─────────────│─────────────────────────│─────────────────────┘
              ▼                         ▼
      ┌──────────────┐          ┌──────────────┐
      │ Local MIDI   │          │ Remote MIDI  │
      │ HTTP Server  │          │ HTTP Server  │
      └──────────────┘          └──────────────┘
```
