# Feature: MIDI Server Dashboard

**Status:** Planning
**Branch:** `feature/macos-installer`

## Overview

A cross-platform control dashboard for the MIDI HTTP Server that runs both as a standard web app (deployed to a browser) and as a native desktop app via Electron — from a single codebase.

## Documents

| Document | Description |
|----------|-------------|
| [prd.md](./prd.md) | Product requirements |
| [architecture.md](./architecture.md) | Technical architecture spec |
| [workplan.md](./workplan.md) | Implementation phases |

## Progress

- [x] Architecture spec defined
- [ ] Project scaffolded with electron-vite
- [ ] Platform abstraction layer implemented
- [ ] Server management API implemented
- [ ] Dashboard UI components built
- [ ] Web build configured
- [ ] Electron packaging configured

## Key Features

- **Dual deployment**: Same codebase runs as web app or Electron desktop app
- **Server management**: Start, stop, and configure the MIDI HTTP Server
- **Port visualization**: View available MIDI inputs/outputs
- **Real-time status**: Monitor server health and connection state

## Technology Stack

- **Build tool**: electron-vite
- **Frontend**: React + TypeScript + Vite
- **Styling**: Tailwind CSS
- **Routing**: react-router-dom (HashRouter)
- **Packaging**: electron-builder
