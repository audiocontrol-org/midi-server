# Product Requirements: MIDI Server Dashboard

## Problem Statement

Users need a visual interface to control the MIDI HTTP Server. Currently, the server must be started from the command line and configured via arguments. There's no way to:

- Start/stop the server without terminal access
- Visually browse available MIDI ports
- Monitor server status in real-time
- Use the server from a remote machine via web browser

## Solution

Build a dashboard application that:

1. **Runs in two modes** from the same codebase:
   - **Web mode**: Deployed as a static web app, connects to a remote MIDI server
   - **Electron mode**: Desktop app that manages a local MIDI server process

2. **Provides server management**:
   - Start the MIDI HTTP Server with configurable port
   - Stop the server gracefully
   - View server status (running/stopped, uptime, URL)

3. **Displays MIDI port information**:
   - List all available MIDI inputs and outputs
   - Show port names and IDs
   - Open/close ports for communication

4. **Offers a modern UI**:
   - Dark theme suitable for studio environments
   - Responsive layout for different screen sizes
   - Real-time status updates

## User Stories

### As a local user (Electron mode)
- I want to launch the dashboard and have it automatically start the MIDI server
- I want to click a button to stop/restart the server
- I want to see all my MIDI devices listed

### As a remote user (Web mode)
- I want to open a URL in my browser to access the dashboard
- I want to connect to a MIDI server running on another machine
- I want to see the same interface as the desktop app

## Functional Requirements

### FR-1: Platform Abstraction
The application must detect its runtime environment (web vs Electron) and provide appropriate implementations for platform-specific features.

### FR-2: Server Management (Electron only)
- Start the `midi-http-server` binary with configurable port
- Stop the server process gracefully
- Detect if server is already running
- Handle server crashes and show error state

### FR-3: Server Connection
- Connect to a MIDI HTTP Server at a configurable URL
- Poll for health status at regular intervals
- Display connection state (connected/disconnected/error)
- Auto-reconnect on connection loss

### FR-4: Port Display
- Fetch and display list of MIDI inputs
- Fetch and display list of MIDI outputs
- Show port ID and name for each port
- Refresh port list on demand

### FR-5: Configuration Persistence
- Remember last used server URL (web mode)
- Remember server port preference (Electron mode)
- Store settings in localStorage (web) or electron-store (Electron)

## Non-Functional Requirements

### NFR-1: Security
- Electron windows must use contextIsolation and sandbox
- No Node.js APIs exposed directly to renderer
- All IPC communication through typed preload bridge

### NFR-2: Performance
- Dashboard should load in under 2 seconds
- Status polling should not impact UI responsiveness
- Efficient re-rendering (no unnecessary updates)

### NFR-3: Compatibility
- Web mode: Modern browsers (Chrome, Firefox, Safari, Edge)
- Electron mode: macOS 12+, Windows 10+, Linux (Ubuntu 20.04+)

## Out of Scope (v1)

- MIDI message visualization/monitoring
- Sending MIDI messages from the dashboard
- Multiple server connections
- Auto-update mechanism
- Custom themes/appearance settings
