# MIDI Server

HTTP-to-MIDI bridge server with full SysEx support, built with JUCE.

## Overview

MIDI Server provides a reliable HTTP API for MIDI communication, specifically designed to handle SysEx messages that Node.js MIDI libraries often struggle with. It uses cpp-httplib for concurrent request handling and JUCE for cross-platform MIDI support.

## Features

- **Full SysEx Support**: Reliable handling of System Exclusive messages
- **Cross-Platform**: macOS (CoreMIDI), Linux (ALSA), Windows (WinMM)
- **Thread-Safe**: Concurrent request handling with proper synchronization
- **Simple HTTP API**: JSON-based REST endpoints for MIDI operations

## Building

### Prerequisites

- CMake 3.22+
- C++17 compatible compiler
- Platform MIDI SDK (CoreMIDI on macOS, ALSA dev on Linux)

### Build Steps

```bash
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build
```

### Linux Dependencies

```bash
sudo apt-get install libasound2-dev
```

## Usage

Start the server:

```bash
./build/MidiHttpServer_artefacts/Release/MidiHttpServer --port 8080
```

## API Reference

### Health Check

```
GET /health
```

Returns server status.

### List Ports

```
GET /ports
```

Returns available MIDI input and output ports.

### Open Port

```
POST /port/:id
```

Opens a MIDI port for communication.

### Send Message

```
POST /port/:id/send
Content-Type: application/json

{
  "data": [240, 126, 127, 6, 1, 247]
}
```

Sends MIDI data (including SysEx) to an open port.

### Get Messages

```
GET /port/:id/messages
```

Retrieves queued incoming MIDI messages.

### Close Port

```
DELETE /port/:id
```

Closes an open MIDI port.

## License

MIT License - See [LICENSE](LICENSE) for details.
