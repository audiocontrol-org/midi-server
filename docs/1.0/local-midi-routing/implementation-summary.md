# Local MIDI Port Routing - Implementation Summary

**Completed:** 2026-02-19
**Branch:** `feature/local-midi-routing`
**PR:** [TBD]

## Summary

Implemented local MIDI routing with explicit `"local"` server support via shared `MidiClient` abstraction and client factory selection. Added a dedicated local ports endpoint and routing engine support for local and remote routes through the same code path.

## What Was Built

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
| `dashboard/src/api-server/remote-client.ts` | Implement MidiClient interface |

## Key Decisions

1. **Explicit "local" keyword** - Users must explicitly select "local" as the server rather than auto-detection
2. **Dedicated endpoint** - `/api/local/ports` keeps local and remote port queries separate
3. **Interface-first design** - MidiClient interface allows easy testing and future extensions

## Testing

- `dashboard/tests/api-server/local-client.test.ts`
  - Verifies LocalClient endpoint mapping (`/health`, `/ports`, `/port/:id`, `/messages`, `/send`)
  - Verifies `input-<n>`/`output-<n>` index extraction behavior
  - Verifies local client cache behavior
- `dashboard/tests/api-server/client-factory.test.ts`
  - Verifies factory selection (`"local"` => LocalClient, URL => RemoteClient)
  - Verifies cache reuse behavior for local and remote clients
- `dashboard/tests/integration/local-routing-api.test.ts`
  - Starts API server + mock local MIDI server
  - Verifies `GET /api/local/ports`
  - Verifies local route creation and message forwarding (`local` source to `local` destination)

## Lessons Learned

- Keeping local and remote clients behind one interface simplified RoutingEngine changes and reduced branching logic.
- The dedicated `/api/local/ports` endpoint avoids ambiguity and keeps frontend behavior explicit.

## Future Considerations

- Add frontend tests to ensure route creation UI correctly offers and persists `"local"` selections.
- Add additional integration coverage for mixed routes (local -> remote and remote -> local).
