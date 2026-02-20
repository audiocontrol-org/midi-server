# Product Requirements: Virtual MIDI Port Routing

## Problem Statement

Users cannot route MIDI from software applications (DAWs, soft synths) through the midi-server to physical MIDI ports on remote machines. The current routing system only works with existing physical/software MIDI ports. Software that generates MIDI has no virtual port to connect to for routing through the server.

## Solution

Integrate virtual MIDI ports into the routing system. The C++ binary already supports virtual ports via JUCE's `createNewDevice()` API. This feature exposes virtual port management through the dashboard and enables routes to use virtual ports as sources or destinations.

## Use Cases

### Use Case 1: DAW → Remote Hardware Synth
A musician wants to send MIDI from their DAW on Machine A to a hardware synthesizer connected to Machine B.

**Flow:**
1. Create virtual INPUT on Machine A (appears as "MIDI Destination" to DAW)
2. DAW sends MIDI to the virtual input
3. Routing engine polls virtual input for messages
4. Messages forwarded to Machine B's physical output
5. Hardware synth receives MIDI

### Use Case 2: Remote Controller → Local Soft Synth
A musician wants to play a software synthesizer on Machine B using a MIDI controller connected to Machine A.

**Flow:**
1. Create virtual OUTPUT on Machine B (appears as "MIDI Source" to soft synth)
2. Routing engine polls Machine A's physical input (controller)
3. Messages forwarded to Machine B's virtual output
4. Soft synth receives MIDI from virtual output

## Requirements

### Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| F1 | Dashboard can create/delete virtual MIDI ports | Must |
| F2 | Virtual ports appear in port lists (distinguished from physical) | Must |
| F3 | Routes can use virtual ports as source or destination | Must |
| F4 | Virtual ports persist across server restarts | Must |
| F5 | Virtual ports appear in system MIDI setup (visible to other apps) | Must |
| F6 | UI shows virtual ports distinctly in route graph | Should |
| F7 | Auto-create virtual ports when creating routes (optional) | Nice |
| F8 | Clean up auto-created virtual ports when route deleted | Nice |

### Non-Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| N1 | Virtual port creation completes in < 1 second | Should |
| N2 | Polling latency same as physical ports (50ms) | Must |
| N3 | Works on macOS (CoreMIDI) and Linux (ALSA) | Must |

## Technical Approach

### C++ API (Already Implemented)

The C++ binary already has virtual port support in `VirtualMidiPort.h`:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/virtual` | GET | List virtual ports `{inputs: [], outputs: []}` |
| `/virtual/:portId` | POST | Create virtual port `{name, type}` |
| `/virtual/:portId` | DELETE | Delete virtual port |
| `/virtual/:portId/messages` | GET | Get messages from virtual input |
| `/virtual/:portId/send` | POST | Send via virtual output |

### Virtual Port Semantics

| Type | System Visibility | Server Role |
|------|-------------------|-------------|
| Virtual INPUT | Appears as MIDI Destination | Receives messages from other apps |
| Virtual OUTPUT | Appears as MIDI Source | Sends messages to other apps |

### Port ID Convention

| Port Type | ID Format | Example |
|-----------|-----------|---------|
| Physical Input | `input-{index}` | `input-0` |
| Physical Output | `output-{index}` | `output-1` |
| Virtual Port | `virtual:{id}` | `virtual:daw-out` |

## Success Criteria

1. Virtual port created via dashboard appears in system MIDI setup
2. Route from virtual input to remote physical output forwards messages correctly
3. Route from remote physical input to virtual output forwards messages correctly
4. Virtual ports are recreated after server restart
5. Deleting a route cleans up associated auto-created virtual ports
6. UI clearly distinguishes virtual from physical ports

## Out of Scope

- Virtual port creation via CLI (future)
- Virtual port latency optimization beyond current polling interval
- Windows support for virtual ports (JUCE limitation)
- Multi-client virtual ports (single owner per port)

## Prerequisites

1. C++ virtual port implementation complete (done)
2. Routing engine functional (done)
3. Dashboard UI for route management (done)

## References

- [JUCE MidiInput::createNewDevice](https://docs.juce.com/master/classMidiInput.html)
- [JUCE MidiOutput::createNewDevice](https://docs.juce.com/master/classMidiOutput.html)
- macOS: Uses CoreMIDI virtual endpoints
- Linux: Uses ALSA sequencer virtual ports
