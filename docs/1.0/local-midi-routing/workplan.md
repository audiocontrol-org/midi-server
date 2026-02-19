# Local MIDI Port Routing - Workplan

**GitHub Milestone:** [Week of Feb 24-28](https://github.com/audiocontrol-org/midi-server/milestone/3)
**GitHub Issues:**

- [Parent: Local MIDI Port Routing (#41)](https://github.com/audiocontrol-org/midi-server/issues/41)
- [Create MidiClient interface (#42)](https://github.com/audiocontrol-org/midi-server/issues/42)
- [Implement LocalClient (#43)](https://github.com/audiocontrol-org/midi-server/issues/43)
- [Create client factory (#44)](https://github.com/audiocontrol-org/midi-server/issues/44)
- [Update RoutingEngine to use factory (#45)](https://github.com/audiocontrol-org/midi-server/issues/45)
- [Add /api/local/ports endpoint (#46)](https://github.com/audiocontrol-org/midi-server/issues/46)
- [Write integration tests (#47)](https://github.com/audiocontrol-org/midi-server/issues/47)

---

## Overview

Add support for routing MIDI messages between ports on the same server (local routing), using the same configuration and interface patterns as cross-server routing.

## Design Decisions

1. **Explicit "local" keyword** - Users select "local" as the server, not auto-detected
2. **Dedicated `/api/local/ports` endpoint** - Clear separation from remote server queries

---

## Phase 1: MidiClient Interface & LocalClient

**Objective:** Create shared interface and local implementation

### Tasks

- [x] Create `dashboard/src/api-server/midi-client.ts` with MidiClient interface
- [x] Create `dashboard/src/api-server/local-client.ts` implementing MidiClient
- [x] Update `dashboard/src/api-server/remote-client.ts` to implement MidiClient interface

### Interface Definition

```typescript
export interface PortInfo {
  id: number
  name: string
  type: 'input' | 'output'
}

export interface MidiClient {
  openPort(portId: string, name: string, type: 'input' | 'output'): Promise<{ success: boolean }>
  closePort(portId: string): Promise<{ success: boolean }>
  getMessages(portId: string): Promise<{ messages: number[][] }>
  sendMessage(portId: string, message: number[]): Promise<{ success: boolean }>
  getPorts(): Promise<{ inputs: PortInfo[], outputs: PortInfo[] }>
  health(): Promise<{ status: string }>
}
```

### LocalClient Details

- Constructor takes `midiServerPort: number`
- Makes HTTP calls to `http://localhost:${midiServerPort}`
- Reuses request pattern from RemoteClient but targets `/ports`, `/port/:id`, etc. (direct MIDI server endpoints, not `/midi/` prefixed API server endpoints)

### Verification

- TypeScript compiles with both implementations
- LocalClient makes correct HTTP calls to MIDI server endpoints

---

## Phase 2: Client Factory

**Objective:** Create factory for selecting appropriate client

### Tasks

- [x] Create `dashboard/src/api-server/client-factory.ts`
- [x] Implement `getMidiClient(serverUrl, localMidiServerPort)` function
- [x] Implement client caching for both local and remote clients

### Factory Logic

```typescript
export function getMidiClient(
  serverUrl: string,
  localMidiServerPort: number
): MidiClient {
  if (serverUrl === 'local') {
    return getLocalClient(localMidiServerPort)
  }
  return getRemoteClient(serverUrl)
}
```

### Verification

- Factory returns LocalClient for serverUrl="local"
- Factory returns RemoteClient for any other URL
- Clients are cached appropriately

---

## Phase 3: Update RoutingEngine

**Objective:** Modify RoutingEngine to support local routing

### Tasks

- [x] Add `midiServerPort: number` to RoutingEngine constructor
- [x] Import `getMidiClient` from client-factory
- [x] Replace all `getRemoteClient(serverUrl)` calls with `getMidiClient(serverUrl, this.midiServerPort)`

### Files Modified

- `dashboard/src/api-server/routing-engine.ts`

### Verification

- RoutingEngine compiles with new constructor signature
- Local routes are handled by LocalClient
- Remote routes continue to work

---

## Phase 4: Update Server Wiring

**Objective:** Wire midiServerPort through server initialization

### Tasks

- [x] Update `server.ts` to pass `midiServerPort` to RoutingEngine constructor

### Files Modified

- `dashboard/src/api-server/server.ts`

### Verification

- Server starts without errors
- midiServerPort is correctly passed to RoutingEngine

---

## Phase 5: Add Local Ports Endpoint

**Objective:** Add API endpoint for querying local MIDI ports

### Tasks

- [x] Add `handleLocalPorts` handler in routing-handlers.ts
- [x] Wire handler to `GET /api/local/ports` in server.ts

### Endpoint Specification

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/local/ports` | List available local MIDI ports |

### Response Format

```json
{
  "inputs": [
    { "id": 0, "name": "USB Keyboard", "type": "input" }
  ],
  "outputs": [
    { "id": 0, "name": "Software Synth", "type": "output" }
  ]
}
```

### Verification

- Endpoint returns 200 with port list when MIDI server is running
- Endpoint returns appropriate error when MIDI server is not running

---

## Phase 6: Testing

**Objective:** Verify local routing works end-to-end

### Tasks

- [x] Unit test: LocalClient makes correct HTTP calls
- [x] Unit test: Factory returns correct client type
- [x] Integration test: Create local route, verify message forwarding

### Integration Test Scenario

1. Start MIDI server
2. Create local route (input A → output B)
3. Inject MIDI message via virtual port
4. Verify message forwarded to output

---

## Files Summary

### New Files

| File | Purpose |
|------|---------|
| `dashboard/src/api-server/midi-client.ts` | Shared interface for MIDI clients |
| `dashboard/src/api-server/local-client.ts` | Local MIDI server client implementation |
| `dashboard/src/api-server/client-factory.ts` | Factory to get appropriate client |

### Modified Files

| File | Changes |
|------|---------|
| `dashboard/src/api-server/routing-engine.ts` | Accept midiServerPort, use getMidiClient |
| `dashboard/src/api-server/routing-handlers.ts` | Add handleLocalPorts handler |
| `dashboard/src/api-server/server.ts` | Wire midiServerPort, add /api/local/ports route |
| `dashboard/src/api-server/remote-client.ts` | Implement MidiClient interface (add implements clause) |

---

## Dependencies

```
Phase 1 (Interface + Clients)
    ↓
Phase 2 (Factory)
    ↓
Phase 3 (RoutingEngine)
    ↓
Phase 4 (Server Wiring)
    ↓
Phase 5 (Local Ports Endpoint)
    ↓
Phase 6 (Testing)
```
