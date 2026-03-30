# MIDI Server

HTTP-to-MIDI bridge server with full SysEx support, built with JUCE.

## Overview

MIDI Server provides a reliable HTTP API for MIDI communication, specifically designed to handle SysEx messages that Node.js MIDI libraries often struggle with. It uses cpp-httplib for concurrent request handling and JUCE for cross-platform MIDI support.

## Features

- **Full SysEx Support**: Reliable handling of System Exclusive messages with fragment buffering
- **Cross-Platform**: macOS (CoreMIDI), Linux (ALSA), Windows (WinMM)
- **Thread-Safe**: Concurrent request handling with proper synchronization
- **Real-Time Streaming**: Server-Sent Events (SSE) for live MIDI monitoring
- **Virtual Ports**: Create virtual MIDI ports for testing without hardware
- **Message Routing**: Route MIDI messages between ports, including across servers
- **Simple HTTP API**: JSON-based REST endpoints for MIDI operations

## Building

### Prerequisites

- CMake 3.22+
- C++17 compatible compiler

### macOS

No additional dependencies required (uses CoreMIDI).

```bash
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build
```

### Linux

```bash
# Install dependencies
sudo apt-get install -y \
  libasound2-dev \
  libfreetype6-dev \
  libfontconfig1-dev \
  libx11-dev \
  libxrandr-dev \
  libxcursor-dev \
  libxinerama-dev \
  libgl1-mesa-dev

# Build
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build
```

### Windows

Requires Visual Studio 2019+ or compatible compiler.

```bash
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release
```

## Usage

Start the server (default port 7777):

```bash
./build/MidiHttpServer_artefacts/Release/MidiHttpServer
```

Start on a custom port:

```bash
./build/MidiHttpServer_artefacts/Release/MidiHttpServer 8080
```

## API Reference

### Health Check

```
GET /health
```

**Response:**
```json
{"status":"ok"}
```

### List Ports

```
GET /ports
```

**Response:**
```json
{
  "inputs": ["IAC Driver Bus 1", "USB MIDI Device"],
  "outputs": ["IAC Driver Bus 1", "USB MIDI Device"]
}
```

### Open Port

```
POST /port/:id
Content-Type: application/json

{
  "name": "IAC Driver Bus 1",
  "type": "output"
}
```

- `:id` - Your chosen identifier for this port connection
- `name` - Partial or full name of the MIDI port (matched via substring)
- `type` - Either `"input"` or `"output"`

**Response:**
```json
{"success":true}
```

### Send Message

```
POST /port/:id/send
Content-Type: application/json

{
  "message": [144, 60, 127]
}
```

- `message` - Array of MIDI bytes

**Examples:**

Note On (channel 1, note 60, velocity 127):
```json
{"message": [144, 60, 127]}
```

SysEx Identity Request:
```json
{"message": [240, 126, 127, 6, 1, 247]}
```

**Response:**
```json
{"success":true}
```

### Get Messages

```
GET /port/:id/messages
```

Returns queued incoming MIDI messages from an input port.

**Response:**
```json
{
  "messages": [
    [144, 60, 127],
    [240, 126, 1, 6, 2, 0, 1, 2, 3, 247]
  ]
}
```

### Stream Messages (SSE)

```
GET /port/:id/events
```

Opens a persistent Server-Sent Events connection that streams MIDI messages in real time as they arrive on an input port. Multiple clients can subscribe to the same port simultaneously.

**Event format:**
```
event: midi
data: {"bytes":[144,60,127],"timestamp":12345}
```

The server sends `: keepalive` comments every second to detect disconnects. Response headers include `Cache-Control: no-cache`, `Connection: keep-alive`, and `X-Accel-Buffering: no` (to disable nginx buffering if proxied).

### Close Port

```
DELETE /port/:id
```

**Response:**
```json
{"success":true}
```

### Virtual Ports

Virtual ports let you test MIDI workflows without physical hardware.

**Create a virtual port:**
```
POST /virtual/:id
Content-Type: application/json

{"type": "input"}
```

**Inject a message into a virtual input port:**
```
POST /virtual/:id/inject
Content-Type: application/json

{"bytes": [144, 60, 127]}
```

**List virtual ports:**
```
GET /virtual
```

**Get queued messages from a virtual port:**
```
GET /virtual/:id/messages
```

**Send via a virtual output port:**
```
POST /virtual/:id/send
Content-Type: application/json

{"message": [144, 60, 127]}
```

### Routes

Routes forward MIDI messages from one port to another, including across remote servers.

**List routes:**
```
GET /routes
```

**Response:**
```json
{
  "routes": [{
    "id": "route-1",
    "enabled": true,
    "source": {"serverUrl": "local", "portId": "input-1", "portName": "IAC Driver"},
    "destination": {"serverUrl": "local", "portId": "output-1", "portName": "Synth"},
    "status": {
      "routeId": "route-1",
      "status": "active",
      "messagesRouted": 42
    }
  }]
}
```

**Create a route:**
```
POST /routes
Content-Type: application/json

{
  "source": {"portId": "input-1"},
  "destination": {"portId": "output-1"}
}
```

**Update a route:**
```
PUT /routes/:routeId
Content-Type: application/json

{"enabled": false}
```

## Monitoring MIDI Conversations

There are two approaches to monitoring MIDI traffic through the server.

### Real-Time Monitoring with SSE

SSE streaming is the recommended approach. It delivers every message as it happens, with timestamps, and handles SysEx reassembly automatically.

```bash
# 1. Open an input port
curl -X POST http://localhost:7777/port/monitor \
  -H "Content-Type: application/json" \
  -d '{"name":"IAC Driver","type":"input"}'

# 2. Stream messages in real time (in another terminal)
curl -N http://localhost:7777/port/monitor/events
```

The `-N` flag disables curl's output buffering so events appear immediately.

In Node.js/TypeScript, you can use the `EventSource` API:

```typescript
const MIDI_SERVER = 'http://localhost:7777';

// Open port first, then subscribe to events
const source = new EventSource(`${MIDI_SERVER}/port/monitor/events`);

source.addEventListener('midi', (event) => {
  const { bytes, timestamp } = JSON.parse(event.data);
  console.log(`[${timestamp}ms]`, bytes);
});

source.addEventListener('error', () => {
  console.log('Connection lost, reconnecting...');
});
```

### Polling

For simpler clients that don't support SSE, poll the messages endpoint. Note that each call drains the queue, so messages are only returned once.

```bash
# Poll for messages (returns and clears the queue)
curl http://localhost:7777/port/monitor/messages
```

### Monitoring Routes

If you have routes configured, check `GET /routes` to see per-route `messagesRouted` counters for traffic volume.

### Testing Without Hardware

Virtual ports let you simulate a full MIDI conversation for testing or development:

```bash
# Terminal 1: Create a virtual input port and subscribe to its events
curl -X POST http://localhost:7777/virtual/test-input \
  -H "Content-Type: application/json" \
  -d '{"type":"input"}'

curl -N http://localhost:7777/virtual/test-input/events

# Terminal 2: Inject test messages
curl -X POST http://localhost:7777/virtual/test-input/inject \
  -H "Content-Type: application/json" \
  -d '{"bytes":[144,60,127]}'

curl -X POST http://localhost:7777/virtual/test-input/inject \
  -H "Content-Type: application/json" \
  -d '{"bytes":[128,60,0]}'
```

## Examples

### curl

```bash
# Check server health
curl http://localhost:7777/health

# List available MIDI ports
curl http://localhost:7777/ports

# Open an output port
curl -X POST http://localhost:7777/port/synth \
  -H "Content-Type: application/json" \
  -d '{"name":"IAC Driver","type":"output"}'

# Send a Note On message
curl -X POST http://localhost:7777/port/synth/send \
  -H "Content-Type: application/json" \
  -d '{"message":[144,60,127]}'

# Send a SysEx message
curl -X POST http://localhost:7777/port/synth/send \
  -H "Content-Type: application/json" \
  -d '{"message":[240,126,127,6,1,247]}'

# Close the port
curl -X DELETE http://localhost:7777/port/synth
```

### Node.js / TypeScript

```typescript
const MIDI_SERVER = 'http://localhost:7777';

// List available ports
async function listPorts() {
  const res = await fetch(`${MIDI_SERVER}/ports`);
  return res.json();
}

// Open a MIDI output port
async function openPort(id: string, name: string, type: 'input' | 'output') {
  const res = await fetch(`${MIDI_SERVER}/port/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, type })
  });
  return res.json();
}

// Send MIDI message
async function sendMessage(portId: string, message: number[]) {
  const res = await fetch(`${MIDI_SERVER}/port/${portId}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message })
  });
  return res.json();
}

// Get incoming messages from an input port
async function getMessages(portId: string) {
  const res = await fetch(`${MIDI_SERVER}/port/${portId}/messages`);
  return res.json();
}

// Close a port
async function closePort(portId: string) {
  const res = await fetch(`${MIDI_SERVER}/port/${portId}`, {
    method: 'DELETE'
  });
  return res.json();
}

// Example usage
async function main() {
  const ports = await listPorts();
  console.log('Available ports:', ports);

  await openPort('synth', 'IAC Driver', 'output');

  // Send Note On
  await sendMessage('synth', [0x90, 60, 127]);

  // Send SysEx Identity Request
  await sendMessage('synth', [0xF0, 0x7E, 0x7F, 0x06, 0x01, 0xF7]);

  await closePort('synth');
}
```

## License

MIT License - See [LICENSE](LICENSE) for details.
