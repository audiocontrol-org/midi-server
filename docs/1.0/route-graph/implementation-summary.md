# Route Graph Visualization - Implementation Summary

**Status:** Complete (v1)
**Completed:** February 2026

## Overview

Graph-based visualization for MIDI server routes using React Flow. Servers are displayed as resizable container nodes with their ports grouped inside. Routes appear as edges connecting port outlets to inlets. Users can create routes by drawing edges and delete them with keyboard shortcuts.

## What Was Built

- Interactive graph visualization with pan, zoom, and drag capabilities
- Server nodes as visual containers grouping their ports
- Port nodes with inlet (input) and outlet (output) handles
- Route edges with status-based styling (active/error/disabled)
- Route creation via edge drawing with connection validation
- Route deletion via Delete/Backspace keys
- Node position persistence in localStorage
- Resizable server containers with hover-activated resize handles

## Key Implementation Details

### Components Created

| Component | File | Purpose |
|-----------|------|---------|
| `RouteGraph` | `components/RouteGraph.tsx` | Main graph container with React Flow |
| `ServerNode` | `components/graph/ServerNode.tsx` | Resizable server container with status indicator |
| `PortNode` | `components/graph/PortNode.tsx` | Port node with inlet/outlet handles |
| `RouteEdge` | `components/graph/RouteEdge.tsx` | Route edge with status styling |

### Hooks Created

| Hook | File | Purpose |
|------|------|---------|
| `useRouteGraph` | `hooks/useRouteGraph.ts` | Transform routes/servers to React Flow nodes/edges |
| `useNodePositions` | `hooks/useNodePositions.ts` | Persist/restore node positions from localStorage |
| `useGraphGestures` | `hooks/useGraphGestures.ts` | Configure pan/zoom/scroll gestures |

### Data Flow

```
Routes + Servers
      ↓
useRouteGraph (transforms to nodes/edges)
      ↓
React Flow (renders graph)
      ↓
User interactions → onConnect (create route) / onKeyDown (delete route)
      ↓
API calls → routes refresh → graph updates
```

### Node Hierarchy

Ports are rendered as child nodes of their server using React Flow's parent-child relationship:
- Server nodes have `style: { width, height }` calculated from port count
- Port nodes have `parentId: serverNodeId` and `extent: 'parent'`
- Positions are relative to parent server node

### Connection Validation

Routes can only be created from outlet (output) handles to inlet (input) handles:
- Source handle must be `outlet`
- Target handle must be `inlet`
- Self-connections not allowed

## Known Limitations

1. **No MIDI flow animation** - Data structure exists (`isAnimating`, `messagesRouted`) but animation not implemented
2. **No list/graph toggle** - Graph view is the primary view; list view removed
3. **Server resize doesn't auto-adjust** - Users can resize servers but ports don't auto-reflow

## Future Enhancements

- MIDI data flow animation on edges when messages are routed
- Right-click context menu for route operations
- Edge labels showing message counts
- Keyboard shortcuts for common operations
- Multi-select for bulk operations
