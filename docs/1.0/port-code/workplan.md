# Work Plan: Port MIDI HTTP Server

## Milestone

Week of Feb 10-14

## Issues

| # | Title | Status |
|---|-------|--------|
| [#1](https://github.com/audiocontrol-org/midi-server/issues/1) | [midi-server] Port JUCE MIDI HTTP Server | Open |
| [#2](https://github.com/audiocontrol-org/midi-server/issues/2) | Initialize repository structure | Open |
| [#3](https://github.com/audiocontrol-org/midi-server/issues/3) | Port MidiHttpServer2 implementation | Open |
| [#4](https://github.com/audiocontrol-org/midi-server/issues/4) | Port MidiPort and JsonBuilder utilities | Open |
| [#5](https://github.com/audiocontrol-org/midi-server/issues/5) | Add cross-platform build support | Open |
| [#6](https://github.com/audiocontrol-org/midi-server/issues/6) | Add documentation and usage examples | Open |

## Phases

### Phase 1: Repository Setup (Issue #2)

**Objective:** Initialize repository with build infrastructure

**Tasks:**
- [x] Create GitHub repository
- [x] Set up worktree structure
- [x] Add CMakeLists.txt with JUCE FetchContent
- [x] Add GitHub Actions workflow
- [x] Add project documentation (README, LICENSE, CLAUDE.md)

**Verification:**
- Repository clones successfully
- CMake configures without errors (JUCE download)

### Phase 2: Core Implementation (Issues #3, #4)

**Objective:** Port the HTTP server and supporting utilities

**Tasks:**
- [x] Copy httplib.h to deps/
- [x] Port MidiHttpServer2.cpp to src/MidiHttpServer.cpp
- [x] Port MidiPort abstraction
- [x] Port JsonBuilder utilities
- [x] Remove ol_dsp-specific dependencies
- [x] Update includes for standalone build

**Verification:**
- [x] Compiles on macOS
- [x] Server starts and responds to /health

### Phase 3: Cross-Platform Builds (Issue #5)

**Objective:** Verify builds on all platforms

**Tasks:**
- [x] Test macOS build locally
- [x] Verify Linux build in CI
- [x] Verify Windows build in CI
- [x] Fix platform-specific issues (added missing Linux deps)

**Verification:**
- [x] CI green on all platforms
- [x] Artifacts uploaded successfully

### Phase 4: Documentation (Issue #6)

**Objective:** Complete documentation for users

**Tasks:**
- [x] Expand README with full usage guide
- [x] Add API documentation
- [x] Create example client code (curl, Node.js)
- [x] Document build requirements per platform

**Verification:**
- [x] New user can build and run from README alone

## Dependencies

```
Phase 1 (Setup)
    ↓
Phase 2 (Implementation)
    ↓
Phase 3 (Cross-Platform) ← Phase 4 (Docs) [parallel]
```

## Source Reference

Original files in `ol_dsp/modules/juce/midi-server/`:

| File | Lines | Notes |
|------|-------|-------|
| MidiHttpServer2.cpp | ~400 | Primary target |
| httplib.h | ~9000 | Vendor as-is |
| MidiServer.cpp | ~200 | Test utility, optional |
| CMakeLists.txt | ~50 | Reference for JUCE setup |
