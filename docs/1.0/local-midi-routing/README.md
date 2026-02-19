# Feature: Local MIDI Port Routing

**Status:** Planning
**Branch:** `feature/local-midi-routing`
**Milestone:** [Week of Feb 24-28](https://github.com/audiocontrol-org/midi-server/milestone/3)

## Overview

Add support for routing MIDI messages between ports on the same server (local routing), using the same configuration and interface patterns as cross-server routing.

## Documents

| Document | Description |
|----------|-------------|
| [prd.md](./prd.md) | Product requirements |
| [workplan.md](./workplan.md) | Implementation phases |
| [implementation-summary.md](./implementation-summary.md) | Post-completion report |

## Progress

- [x] PRD approved
- [x] Workplan defined
- [ ] MidiClient interface created
- [ ] LocalClient implemented
- [ ] Client factory created
- [ ] RoutingEngine updated
- [ ] Server wiring complete
- [ ] Local ports endpoint added
- [ ] Integration tests passing

## Key Features

- **Explicit "local" keyword**: Users select "local" as server, not auto-detected
- **Dedicated endpoint**: `/api/local/ports` for querying local ports
- **Unified interface**: Same MidiClient interface for local and remote
- **Factory pattern**: Clean selection of appropriate client

## API Additions

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/local/ports` | List available local MIDI ports |

## Route Schema Example

```typescript
{
  id: "route-123",
  enabled: true,
  source: { serverUrl: "local", portId: "input-0", portName: "USB Keyboard" },
  destination: { serverUrl: "local", portId: "output-1", portName: "Synth" }
}
```
