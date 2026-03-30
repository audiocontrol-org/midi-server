# Feature: SSE MIDI Monitoring

**Status:** Planning
**Branch:** `feature/sse-events`

## Overview

Add real-time MIDI message monitoring to the dashboard using Server-Sent Events instead of HTTP polling. Includes a dedicated Monitor tab for watching multiple ports simultaneously with filtering.

## Documents

| Document | Description |
|----------|-------------|
| [prd.md](./prd.md) | Product requirements |
| [workplan.md](./workplan.md) | Implementation phases |
| [implementation-summary.md](./implementation-summary.md) | Post-completion report |

## Progress

- [ ] SSE proxy endpoint in API server
- [ ] Centralized message store
- [ ] SSE React hook
- [ ] Replace polling in PortDetail
- [ ] Dedicated Monitor tab
