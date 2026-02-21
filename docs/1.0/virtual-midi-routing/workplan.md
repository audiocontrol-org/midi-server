# Work Plan: Virtual MIDI Port Routing

## Milestone

[Week of Feb 24-28](https://github.com/audiocontrol-org/midi-server/milestone/3)

## Issues

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

## Phases

### Phase 1: Types & Storage ([#76](https://github.com/audiocontrol-org/midi-server/issues/76))

**Objective:** Create type definitions and persistence layer for virtual ports

**Tasks:**
- [ ] Add `VirtualPortConfig` interface to `dashboard/src/api-server/types.ts`
- [ ] Add `isVirtual?: boolean` to `MidiPort` in `dashboard/src/renderer/src/types/api.ts`
- [ ] Create `dashboard/src/api-server/virtual-ports-storage.ts` (follow routes-storage.ts pattern)

**Type Definition:**
```typescript
export interface VirtualPortConfig {
  id: string
  name: string
  type: 'input' | 'output'
  createdAt: number
  isAutoCreated: boolean
  associatedRouteId?: string
}
```

**Storage Location:** `~/.config/audiocontrol.org/midi-server/virtual-ports.json`

**Verification:**
- Storage loads/saves correctly
- Types compile without errors

### Phase 2: LocalClient Methods ([#77](https://github.com/audiocontrol-org/midi-server/issues/77))

**Objective:** Add virtual port API methods to LocalClient

**File:** `dashboard/src/api-server/local-client.ts`

**Tasks:**
- [ ] Add `getVirtualPorts()` method
- [ ] Add `createVirtualPort(portId, name, type)` method
- [ ] Add `deleteVirtualPort(portId)` method
- [ ] Add `getVirtualMessages(portId)` method
- [ ] Add `sendVirtualMessage(portId, message)` method

**Verification:**
- Methods correctly call C++ `/virtual/*` endpoints
- Error handling matches existing patterns

### Phase 3: Routing Engine Integration ([#78](https://github.com/audiocontrol-org/midi-server/issues/78))

**Objective:** Enable routing engine to poll and forward via virtual ports

**File:** `dashboard/src/api-server/routing-engine.ts`

**Tasks:**
- [ ] Add `isVirtualPort(portId)` helper (checks `virtual:` prefix)
- [ ] Modify `pollSourceAndForward()` to use `getVirtualMessages()` for virtual sources
- [ ] Modify `forwardMessage()` to use `sendVirtualMessage()` for virtual destinations
- [ ] Virtual ports don't need "opening" like physical ports - handle in `openPort()`

**Verification:**
- Route with virtual source polls correctly
- Route with virtual destination forwards correctly
- Mixed routes (virtual → physical, physical → virtual) work

### Phase 4: API Endpoints ([#79](https://github.com/audiocontrol-org/midi-server/issues/79))

**Objective:** Expose virtual port management via HTTP API

**File:** `dashboard/src/api-server/server.ts`

**New Endpoints:**
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/virtual-ports` | List all virtual ports |
| POST | `/api/virtual-ports` | Create virtual port |
| DELETE | `/api/virtual-ports/:id` | Delete virtual port |

**File:** `dashboard/src/api-server/routing-handlers.ts`

**Tasks:**
- [ ] Add `handleGetVirtualPorts()` handler
- [ ] Add `handleCreateVirtualPort()` handler
- [ ] Add `handleDeleteVirtualPort()` handler

**Verification:**
- API endpoints respond correctly
- Virtual ports created via API appear in system MIDI

### Phase 5: Startup Persistence ([#80](https://github.com/audiocontrol-org/midi-server/issues/80))

**Objective:** Recreate virtual ports when server starts

**File:** `dashboard/src/api-server/server.ts`

**Tasks:**
- [ ] Load virtual-ports-storage on startup
- [ ] Call C++ API to recreate each persisted virtual port
- [ ] Handle errors gracefully (log and continue)

**Verification:**
- Restart server, virtual ports still exist
- Virtual ports appear in system MIDI after restart

### Phase 6: UI Components ([#81](https://github.com/audiocontrol-org/midi-server/issues/81))

**Objective:** Add virtual port management to dashboard

**Files to modify:**

1. `dashboard/src/renderer/src/api/client.ts`
   - [ ] Add `getVirtualPorts()` method
   - [ ] Add `createVirtualPort()` method
   - [ ] Add `deleteVirtualPort()` method

2. `dashboard/src/renderer/src/components/RoutingPanel.tsx`
   - [ ] Add "Virtual Ports" section
   - [ ] Add "Create Virtual Port" button/modal
   - [ ] Show list of virtual ports with delete option

3. `dashboard/src/renderer/src/components/AddRouteModal.tsx`
   - [ ] Include virtual ports in port dropdowns
   - [ ] Visual distinction for virtual ports (icon/badge)

**Verification:**
- Can create/delete virtual ports from UI
- Virtual ports appear in route creation dropdowns

### Phase 7: Route Graph ([#82](https://github.com/audiocontrol-org/midi-server/issues/82))

**Objective:** Display virtual ports distinctly in route graph

**Files to modify:**

1. `dashboard/src/renderer/src/hooks/useRouteGraph.ts`
   - [ ] Include virtual ports when building graph nodes
   - [ ] Add `isVirtual` flag to port nodes

2. `dashboard/src/renderer/src/components/graph/PortNode.tsx`
   - [ ] Visual distinction for virtual ports (dashed border, different color/icon)

**Verification:**
- Virtual ports appear in graph
- Visual distinction is clear

## Dependencies

```
Phase 1 (Types & Storage)
    ↓
Phase 2 (LocalClient) → Phase 3 (Routing Engine)
    ↓                         ↓
Phase 4 (API Endpoints) ← ────┘
    ↓
Phase 5 (Persistence)
    ↓
Phase 6 (UI) → Phase 7 (Graph)
```

## Files to Create

| File | Purpose |
|------|---------|
| `dashboard/src/api-server/virtual-ports-storage.ts` | Virtual port persistence |

## Files to Modify

| File | Changes |
|------|---------|
| `dashboard/src/api-server/types.ts` | Add VirtualPortConfig interface |
| `dashboard/src/api-server/local-client.ts` | Add virtual port methods |
| `dashboard/src/api-server/routing-engine.ts` | Virtual port polling/forwarding |
| `dashboard/src/api-server/server.ts` | API endpoints, startup persistence |
| `dashboard/src/api-server/routing-handlers.ts` | Virtual port handlers |
| `dashboard/src/renderer/src/types/api.ts` | Add isVirtual to MidiPort |
| `dashboard/src/renderer/src/api/client.ts` | Add virtual port API methods |
| `dashboard/src/renderer/src/components/RoutingPanel.tsx` | Virtual port management UI |
| `dashboard/src/renderer/src/components/AddRouteModal.tsx` | Virtual ports in dropdowns |
| `dashboard/src/renderer/src/hooks/useRouteGraph.ts` | Include virtual ports |
| `dashboard/src/renderer/src/components/graph/PortNode.tsx` | Virtual port styling |
