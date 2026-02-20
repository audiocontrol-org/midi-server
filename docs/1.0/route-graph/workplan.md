# Route Graph Visualization - Workplan

**GitHub Milestone:** [Week of Feb 24-28](https://github.com/audiocontrol-org/midi-server/milestone/3)

**GitHub Issues:**

- [Parent: Route Graph Visualization (#50)](https://github.com/audiocontrol-org/midi-server/issues/50)
- [Add React Flow dependency and basic graph container (#51)](https://github.com/audiocontrol-org/midi-server/issues/51)
- [Create ServerNode and PortNode custom components (#52)](https://github.com/audiocontrol-org/midi-server/issues/52)
- [Create RouteEdge custom component with status styling (#53)](https://github.com/audiocontrol-org/midi-server/issues/53)
- [Implement useRouteGraph hook for data transformation (#54)](https://github.com/audiocontrol-org/midi-server/issues/54)
- [Implement node position persistence (#55)](https://github.com/audiocontrol-org/midi-server/issues/55)
- [Add route creation via edge drawing (#56)](https://github.com/audiocontrol-org/midi-server/issues/56)
- [Add route deletion via graph interaction (#57)](https://github.com/audiocontrol-org/midi-server/issues/57)
- [Implement MIDI data flow animation (#58)](https://github.com/audiocontrol-org/midi-server/issues/58)
- [Add view toggle between list and graph views (#59)](https://github.com/audiocontrol-org/midi-server/issues/59)

---

## Implementation Phases

### Phase 1: Static Graph Visualization

**Goal:** Display servers, ports, and routes as a navigable graph

#### Tasks

1. **Add React Flow dependency and basic graph container** ([#51](https://github.com/audiocontrol-org/midi-server/issues/51))
   - Add `@xyflow/react` to package.json
   - Create RouteGraph.tsx with ReactFlow wrapper
   - Add basic styling for dark theme compatibility

2. **Create ServerNode and PortNode custom components** ([#52](https://github.com/audiocontrol-org/midi-server/issues/52))
   - ServerNode: Container with server name, connection status indicator
   - PortNode: Individual port with type indicator (input/output)
   - Style to match existing dashboard theme

3. **Create RouteEdge custom component with status styling** ([#53](https://github.com/audiocontrol-org/midi-server/issues/53))
   - Edge colors based on route status (active=green, error=red, disabled=gray)
   - Edge thickness/style for visual hierarchy

4. **Implement useRouteGraph hook for data transformation** ([#54](https://github.com/audiocontrol-org/midi-server/issues/54))
   - Transform Route[] + DiscoveredServer[] into React Flow nodes/edges
   - Calculate initial node positions (grid layout)
   - Handle port grouping under servers

5. **Implement node position persistence** ([#55](https://github.com/audiocontrol-org/midi-server/issues/55))
   - Create useNodePositions hook
   - Save positions to localStorage on drag end
   - Restore positions on component mount

### Phase 2: Route Management via Graph

**Goal:** Create and delete routes through graph interactions

#### Tasks

6. **Add route creation via edge drawing** ([#56](https://github.com/audiocontrol-org/midi-server/issues/56))
   - Enable connection mode between output and input ports
   - Validate connection rules (output→input only)
   - Call existing createRoute API on successful connection

7. **Add route deletion via graph interaction** ([#57](https://github.com/audiocontrol-org/midi-server/issues/57))
   - Enable edge selection
   - Delete on backspace/delete key press
   - Optional: right-click context menu

### Phase 3: MIDI Data Flow Visualization

**Goal:** Animate edges to show live message flow

#### Tasks

8. **Implement MIDI data flow animation** ([#58](https://github.com/audiocontrol-org/midi-server/issues/58))
   - Track `messagesRouted` count changes per route
   - Trigger edge animation on message activity
   - Visual intensity based on message frequency
   - Use `lastMessageTime` for animation timing

### Phase 4: View Integration

**Goal:** Integrate graph view into existing dashboard

#### Tasks

9. **Add view toggle between list and graph views** ([#59](https://github.com/audiocontrol-org/midi-server/issues/59))
   - Add toggle button to RoutingPanel header
   - Pass toggle state from Dashboard
   - Conditional rendering of RoutingPanel vs RouteGraph

---

## Graph Data Model

```typescript
interface GraphNode {
  id: string                    // "server:{url}" or "port:{url}:{portId}"
  type: 'server' | 'port'
  position: { x: number, y: number }
  data: {
    label: string
    serverUrl?: string
    portType?: 'input' | 'output'
    isLocal?: boolean
  }
  parentNode?: string           // For ports, reference to server node
}

interface GraphEdge {
  id: string                    // route.id
  source: string                // "port:{url}:{portId}"
  target: string                // "port:{url}:{portId}"
  data: {
    routeId: string
    enabled: boolean
    status: 'active' | 'error' | 'disabled'
    messagesRouted: number
    lastMessageTime: number | null
  }
  animated?: boolean            // True when messages flowing
}
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `dashboard/src/renderer/src/components/RouteGraph.tsx` | Main graph visualization component |
| `dashboard/src/renderer/src/components/graph/ServerNode.tsx` | Custom node for servers |
| `dashboard/src/renderer/src/components/graph/PortNode.tsx` | Custom node for ports |
| `dashboard/src/renderer/src/components/graph/RouteEdge.tsx` | Custom animated edge for routes |
| `dashboard/src/renderer/src/hooks/useRouteGraph.ts` | Transform routes to graph nodes/edges |
| `dashboard/src/renderer/src/hooks/useNodePositions.ts` | Persist/restore node positions |

## Files to Modify

| File | Changes |
|------|---------|
| `dashboard/src/renderer/src/components/Dashboard.tsx` | Add RouteGraph component, list/graph view toggle |
| `dashboard/src/renderer/src/components/RoutingPanel.tsx` | Add view toggle button prop |
| `dashboard/package.json` | Add `@xyflow/react` dependency |

---

## Verification Checklist

- [x] Graph displays all discovered servers and their ports
- [x] Routes shown as edges with correct status colors
- [x] Nodes can be dragged and positions persist across refresh
- [x] New routes can be created by connecting port nodes
- [x] Routes can be deleted via graph interaction
- [ ] Edge animation triggers when MIDI messages flow (deferred)
