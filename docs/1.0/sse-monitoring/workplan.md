# SSE MIDI Monitoring - Workplan

**GitHub Milestone:** TBD
**GitHub Issues:** TBD

## Phases

### Phase 1: SSE Proxy in Dashboard API Server

**Objective:** Proxy SSE streams from the C++ MIDI server through the dashboard's API server so the browser can connect without CORS issues.

**Tasks:**
- [ ] Add SSE proxy endpoint `GET /api/port/:id/events` in the API server
- [ ] Forward SSE stream from C++ server's `GET /port/:id/events`
- [ ] Pass through `event: midi` events and keepalive comments
- [ ] Handle upstream disconnect with automatic cleanup

**Verification:**
- `curl -N http://localhost:<dashboard-port>/api/port/<id>/events` streams MIDI events
- Keepalive comments pass through
- Closing the client connection cleans up the upstream connection

---

### Phase 2: Message Store

**Objective:** Create a centralized message store that holds MIDI messages independent of component lifecycle.

**Tasks:**
- [ ] Create `src/renderer/src/stores/midi-message-store.ts`
- [ ] Store messages per port with configurable max history (e.g., 1000 messages)
- [ ] Support subscribing to message updates (React-compatible)
- [ ] Include timestamp and source port ID on each message
- [ ] Provide clear/filter operations

**Verification:**
- Messages persist when switching between tabs
- Old messages are pruned when history limit is reached
- Multiple components can subscribe to the same store

---

### Phase 3: SSE Hook

**Objective:** Create a React hook that manages EventSource connections to the SSE proxy.

**Tasks:**
- [ ] Create `src/renderer/src/hooks/useMidiStream.ts`
- [ ] Manage EventSource lifecycle (open, error, reconnect, close)
- [ ] Parse `event: midi` data and push to message store
- [ ] Support connecting to multiple ports simultaneously
- [ ] Clean up connections on unmount

**Verification:**
- Hook establishes SSE connection and receives messages
- Automatic reconnect on connection loss
- No leaked EventSource connections after unmount

---

### Phase 4: Replace Polling in PortDetail

**Objective:** Swap the 100ms polling interval in PortDetail for the SSE hook.

**Tasks:**
- [ ] Replace `setInterval` polling in PortDetail with `useMidiStream`
- [ ] Read messages from the message store instead of the poll response
- [ ] Remove the `getMessages` polling code path for real ports
- [ ] Keep polling as fallback for virtual ports if they don't support SSE

**Verification:**
- PortDetail displays messages in real time via SSE
- No polling HTTP requests visible in network tab for real ports
- Existing message formatting (`formatMidiMessage`) still works
- Virtual ports continue to work

---

### Phase 5: Monitor Tab

**Objective:** Add a dedicated "Monitor" tab that shows real-time MIDI messages from multiple input ports.

**Tasks:**
- [ ] Add "Monitor" entry to navigation in `SiteHeader.tsx`
- [ ] Create `src/renderer/src/components/MidiMonitor.tsx`
- [ ] Show port selector to choose which input ports to monitor
- [ ] Display unified message stream with port labels and timestamps
- [ ] Add filter controls for message type (Note, CC, SysEx, System, All)
- [ ] Add filter by port
- [ ] Add clear button to reset message history
- [ ] Auto-scroll with scroll-lock behavior (stop auto-scroll when user scrolls up)

**Verification:**
- Monitor tab appears in navigation
- Can subscribe to multiple input ports
- Messages from different ports are visually distinguished
- Filters reduce visible messages without losing history
- Auto-scroll pauses when user scrolls up, resumes at bottom

---

## Dependencies

```
Phase 1 (SSE Proxy)
    ↓
Phase 2 (Message Store)
    ↓
Phase 3 (SSE Hook)
    ↓
Phase 4 (Replace Polling) ──→ Phase 5 (Monitor Tab)
```

Phase 4 and Phase 5 can proceed in parallel once Phase 3 is complete.

## Files to Create/Modify

```
dashboard/
├── src/
│   ├── api-server/
│   │   └── server.ts                          # Modified: add SSE proxy endpoint
│   └── renderer/src/
│       ├── stores/
│       │   └── midi-message-store.ts           # New: centralized message store
│       ├── hooks/
│       │   └── useMidiStream.ts                # New: SSE connection hook
│       ├── components/
│       │   ├── PortDetail.tsx                  # Modified: replace polling with SSE
│       │   ├── MidiMonitor.tsx                 # New: multi-port monitor view
│       │   └── layout/
│       │       └── SiteHeader.tsx              # Modified: add Monitor nav entry
│       └── types/
│           └── api.ts                          # Modified: add SSE message types
```
