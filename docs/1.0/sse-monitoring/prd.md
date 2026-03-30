# Product Requirements: SSE MIDI Monitoring in Dashboard

**Created:** 2026-03-30
**Status:** Draft
**Owner:** Orion

## Problem Statement

The MIDI server now supports real-time Server-Sent Events streaming via `GET /port/:id/events`, but the dashboard doesn't use it. The dashboard currently polls `GET /port/:id/messages` every 100ms, which:

- Introduces up to 100ms latency on every message
- Generates constant HTTP traffic even when no messages are flowing
- Drains the message queue on each poll, so only one client can consume messages
- Limits monitoring to a single port at a time, embedded in the port detail view
- Caps history at 100 messages with no persistence across port close/reopen

Users need a dedicated monitoring experience that shows MIDI traffic in real time across multiple ports with filtering, timestamps, and history.

## User Stories

- As a user debugging a MIDI setup, I want to see messages arriving in real time so I can verify signal flow without latency
- As a user monitoring multiple devices, I want to watch several input ports simultaneously so I can correlate messages across ports
- As a user troubleshooting SysEx, I want to filter messages by type so I can isolate the traffic I care about
- As a user testing a route, I want to see message counts and activity indicators so I can confirm the route is forwarding

## Success Criteria

- [ ] Dashboard uses SSE (`EventSource`) instead of polling for MIDI message display
- [ ] Dedicated "Monitor" tab shows real-time messages from multiple ports
- [ ] Messages display with sub-second latency from the server
- [ ] Messages can be filtered by type (Note, CC, SysEx, etc.) and by port
- [ ] Message history persists across port selection changes
- [ ] Idle ports generate no HTTP traffic (SSE keepalive only)

## Scope

### In Scope

- Replace polling with SSE in existing PortDetail component
- New dedicated Monitor tab/view for multi-port monitoring
- Message filtering by MIDI message type and port
- Centralized message store that survives port selection changes
- SSE connection lifecycle management (connect, reconnect, cleanup)
- Proxy SSE through the dashboard API server to the C++ server

### Out of Scope

- Message recording/export to file
- MIDI message editing or replay
- Latency measurement or statistics
- Custom display formats or themes
- Changes to the C++ MIDI server (SSE endpoint already exists)

## Dependencies

- C++ MIDI server SSE endpoint (`GET /port/:id/events`) — already implemented in `feature/sse-events`
- Dashboard API server — needs SSE proxy endpoint
- `SseClientManager` in C++ server — already handles multiple concurrent clients

## Open Questions

- [ ] Should the Monitor tab auto-subscribe to all open input ports, or require manual selection?
- [ ] What is a reasonable maximum message history size before auto-pruning?
