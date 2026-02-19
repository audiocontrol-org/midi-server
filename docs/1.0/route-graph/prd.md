# Route Graph Visualization - Product Requirements Document

**Created:** 2026-02-18
**Status:** Approved
**Owner:** audiocontrol.org

## Problem Statement

The current MIDI routing interface displays routes as a flat list, making it difficult for users to visualize the relationship between servers, ports, and routes. Users cannot easily understand the topology of their MIDI routing configuration or see real-time data flow through the system.

## User Stories

- As a MIDI user, I want to see my routing configuration as a graph so that I can visually understand how MIDI data flows between servers and ports
- As a MIDI user, I want to drag and drop to create new routes so that route configuration is intuitive
- As a MIDI user, I want to see animated edges when MIDI messages flow so that I can verify my routing is working
- As a MIDI user, I want to drag nodes to customize my layout so that I can organize complex routing configurations

## Success Criteria

- [ ] Graph displays all discovered servers and their ports as nodes
- [ ] Routes are shown as edges connecting port nodes with correct status colors
- [ ] Nodes can be dragged and positions persist across page refresh
- [ ] New routes can be created by connecting port nodes via drag
- [ ] Routes can be deleted via graph interaction (selection + delete or context menu)
- [ ] Edge animation triggers when MIDI messages flow through routes

## Scope

### In Scope

- Static graph visualization of servers, ports, and routes
- Custom node components for servers and ports
- Custom edge component with status-based styling
- Node position persistence in localStorage
- Route creation via edge drawing between ports
- Route deletion via graph interaction
- MIDI data flow animation based on message activity
- Toggle between list view and graph view

### Out of Scope

- Route editing (changing source/destination) via graph - use modal
- Multi-route selection and batch operations
- Export/import of graph layouts
- Undo/redo for graph operations
- Server/port creation via graph

## Dependencies

- React Flow library (`@xyflow/react`)
- Existing `/api/routes` endpoint for route data
- Existing `/api/discovery/servers` endpoint for server data
- Existing route status data including `messagesRouted` and `lastMessageTime`

## Open Questions

*None - all questions resolved during planning*

## Appendix

### Research Summary

**React Flow** selected as the graph library:
- MIT License
- 35.3K GitHub stars, 4.42M weekly npm downloads
- TypeScript-first with hooks API
- Built-in drag, zoom, pan, multi-selection
- Custom node and edge component support
- Edge animation capabilities

### Existing Dashboard Patterns

- Routes polled every 5 seconds from `/api/routes`
- Route status includes: `messagesRouted`, `lastMessageTime`, `status` (active/error/disabled)
- `discoveredServers` array maps URLs to server names
- RoutingPanel currently displays routes as a list
- Dashboard.tsx orchestrates all state (no Redux/Context)
