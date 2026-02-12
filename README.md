# MIDI Server

HTTP-to-MIDI bridge server with full SysEx support, built with JUCE.

## Overview

MIDI Server provides a reliable HTTP API for MIDI communication, specifically designed to handle SysEx messages that Node.js MIDI libraries often struggle with. It uses cpp-httplib for concurrent request handling and JUCE for cross-platform MIDI support.

## Features

- **Full SysEx Support**: Reliable handling of System Exclusive messages with fragment buffering
- **Cross-Platform**: macOS (CoreMIDI), Linux (ALSA), Windows (WinMM)
- **Thread-Safe**: Concurrent request handling with proper synchronization
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

### Close Port

```
DELETE /port/:id
```

**Response:**
```json
{"success":true}
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
