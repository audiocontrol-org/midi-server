# MIDI Server - Project Guidelines

This file is the single source of truth for both `CLAUDE.md` and `AGENTS.md`.

## Project Overview

This is a JUCE-based HTTP-to-MIDI bridge server that enables reliable MIDI communication (especially SysEx) from HTTP clients like Node.js/TypeScript applications.

## Build System

- Uses CMake with JUCE FetchContent
- C++17 standard required
- Cross-platform: macOS (CoreMIDI), Linux (ALSA), Windows (WinMM)

## Build Commands

```bash
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build
```

## Architecture

- **MidiHttpServer.cpp**: Main server using cpp-httplib with thread pool
- **MidiPort.h**: Thread-safe MIDI port abstraction with message queuing
- **JsonBuilder.h**: Simple JSON construction utilities
- **httplib.h**: cpp-httplib 0.14.3 single-header HTTP library (in deps/)

## HTTP API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Server health check |
| GET | `/ports` | List MIDI inputs/outputs |
| POST | `/port/:id` | Open MIDI port |
| GET | `/port/:id/messages` | Get queued messages |
| POST | `/port/:id/send` | Send MIDI/SysEx message |
| DELETE | `/port/:id` | Close MIDI port |

## Code Standards

- No class inheritance; use composition with interfaces
- Thread safety via mutex for all MIDI port operations
- JSON responses for all endpoints
- Proper error handling with HTTP status codes

## Dependencies

- JUCE 8.0.0 (fetched via CMake)
- cpp-httplib 0.14.3 (vendored in deps/)
