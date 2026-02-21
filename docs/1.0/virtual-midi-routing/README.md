# Feature: Virtual MIDI Port Routing

**Status:** Planning
**Milestone:** [Week of Feb 24-28](https://github.com/audiocontrol-org/midi-server/milestone/3)
**Branch:** `feature/virtual-midi-routing`
**Parent Issue:** [#75](https://github.com/audiocontrol-org/midi-server/issues/75)

## Overview

Enable software applications (DAWs, soft synths) to send/receive MIDI through the midi-server to physical ports on remote machines by integrating virtual MIDI ports into the routing system.

## Documents

| Document | Description |
|----------|-------------|
| [prd.md](./prd.md) | Product requirements |
| [workplan.md](./workplan.md) | Implementation phases with issue links |
| [implementation-summary.md](./implementation-summary.md) | Post-completion report |

## Progress

- [x] Feature documentation created
- [x] GitHub milestone assigned
- [x] GitHub issues created
- [ ] Types and storage created
- [ ] LocalClient methods added
- [ ] Routing engine integration complete
- [ ] API endpoints added
- [ ] Startup persistence implemented
- [ ] UI components added
- [ ] Route graph updated

## GitHub Issues

| # | Title | Status |
|---|-------|--------|
| [#75](https://github.com/audiocontrol-org/midi-server/issues/75) | [routing] Virtual MIDI Port Routing | Open |
| [#76](https://github.com/audiocontrol-org/midi-server/issues/76) | Create virtual-ports-storage.ts | Open |
| [#77](https://github.com/audiocontrol-org/midi-server/issues/77) | Add virtual port methods to LocalClient | Open |
| [#78](https://github.com/audiocontrol-org/midi-server/issues/78) | Integrate virtual ports into routing engine | Open |
| [#79](https://github.com/audiocontrol-org/midi-server/issues/79) | Add virtual port API endpoints | Open |
| [#80](https://github.com/audiocontrol-org/midi-server/issues/80) | Add virtual port persistence on startup | Open |
| [#81](https://github.com/audiocontrol-org/midi-server/issues/81) | Add virtual port UI components | Open |
| [#82](https://github.com/audiocontrol-org/midi-server/issues/82) | Update route graph for virtual ports | Open |

## Use Cases

### DAW → Remote Synth
```
Machine A                          Machine B
┌─────────────┐                   ┌─────────────┐
│ DAW         │                   │ Synth       │
│   ↓         │                   │   ↑         │
│ Virtual IN  │ ──── route ────→  │ Physical OUT│
└─────────────┘                   └─────────────┘
```

### Remote Controller → Soft Synth
```
Machine A                          Machine B
┌─────────────┐                   ┌─────────────┐
│ Controller  │                   │ Soft Synth  │
│   ↓         │                   │   ↑         │
│ Physical IN │ ──── route ────→  │ Virtual OUT │
└─────────────┘                   └─────────────┘
```

## Virtual Port Semantics

| Type | System Visibility | Server Role |
|------|-------------------|-------------|
| Virtual INPUT | MIDI Destination | Receives from other apps |
| Virtual OUTPUT | MIDI Source | Sends to other apps |

## Prerequisites

- C++ virtual port implementation (done in `VirtualMidiPort.h`)
- Routing engine functional (done)
- Dashboard UI for routes (done)

## Platform Support

| Platform | Virtual Ports | API |
|----------|---------------|-----|
| macOS | Yes | CoreMIDI virtual endpoints |
| Linux | Yes | ALSA sequencer |
| Windows | Limited | JUCE limitation |
