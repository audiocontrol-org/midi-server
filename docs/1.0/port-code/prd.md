# Product Requirements: MIDI HTTP Server Port

## Problem Statement

Node.js MIDI libraries have unreliable SysEx (System Exclusive) message handling. This makes it difficult to build TypeScript applications that communicate with MIDI hardware requiring SysEx, such as synthesizers, effects processors, and audio interfaces with MIDI control.

## Solution

Extract the JUCE-based MIDI HTTP server from `ol_dsp` into a standalone repository. This server:

1. Provides HTTP endpoints for MIDI operations
2. Uses JUCE for reliable cross-platform MIDI (CoreMIDI, ALSA, WinMM)
3. Handles SysEx messages correctly
4. Enables any HTTP client to communicate with MIDI hardware

## Requirements

### Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| F1 | List available MIDI input/output ports | Must |
| F2 | Open/close MIDI ports by identifier | Must |
| F3 | Send MIDI messages including SysEx | Must |
| F4 | Receive and queue incoming MIDI messages | Must |
| F5 | Configurable server port | Should |
| F6 | Health check endpoint | Should |

### Non-Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| N1 | Cross-platform: macOS, Linux, Windows | Must |
| N2 | Thread-safe concurrent request handling | Must |
| N3 | Low latency message handling | Should |
| N4 | Single executable with no runtime dependencies | Should |

## HTTP API Specification

### GET /health

Returns server health status.

**Response:**
```json
{
  "status": "ok",
  "version": "1.0.0"
}
```

### GET /ports

Lists available MIDI ports.

**Response:**
```json
{
  "inputs": [
    {"id": 0, "name": "USB MIDI Interface"}
  ],
  "outputs": [
    {"id": 0, "name": "USB MIDI Interface"}
  ]
}
```

### POST /port/:id

Opens a MIDI port.

**Request Body:**
```json
{
  "type": "input" | "output"
}
```

**Response:**
```json
{
  "success": true,
  "portId": "output:0"
}
```

### POST /port/:id/send

Sends MIDI data to an open output port.

**Request Body:**
```json
{
  "data": [240, 126, 127, 6, 1, 247]
}
```

**Response:**
```json
{
  "success": true,
  "bytesSent": 6
}
```

### GET /port/:id/messages

Gets queued messages from an open input port.

**Response:**
```json
{
  "messages": [
    {
      "timestamp": 1234567890,
      "data": [240, 126, 127, 6, 2, 0, 1, 2, 247]
    }
  ]
}
```

### DELETE /port/:id

Closes an open MIDI port.

**Response:**
```json
{
  "success": true
}
```

## Success Criteria

1. Server builds on macOS, Linux, and Windows via CI
2. All HTTP endpoints functional
3. SysEx messages send and receive correctly
4. No memory leaks under continuous operation
5. Documentation sufficient for integration

## Out of Scope

- WebSocket support (future enhancement)
- MIDI routing between ports
- Virtual MIDI port creation
- GUI interface
