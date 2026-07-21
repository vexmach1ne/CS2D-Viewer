# CS2 Demo Viewer

A focused Windows desktop application for opening Counter-Strike 2 `.dem` files and replaying them on a 2D tactical map. It retains match-local player and team statistics without maintaining a historical player, team, event, or benchmark database.

## Features

- Direct `.dem` file selection with background parsing and cache progress
- 2D player movement, aim direction, trails, shot tracers, utility, bomb events, kill feed, HUD, and scoreboard
- Follow-player and free-camera playback with seeking and round navigation
- Current-tick and full-match General, Performance, and Utility statistics
- Event-synchronized weapon, utility, bomb, damage, door, and round audio
- Single-active-demo restore across launches
- Bundled maps for Ancient, Anubis, Dust2, Inferno, Mirage, Nuke, and Overpass

## Development

Requirements: Windows x64, Node.js 22 or newer, and npm.

```powershell
npm install
npm run dev
```

Validation:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

Run a parser smoke check with a real demo that is not stored in this repository:

```powershell
npm run smoke:demo -- --demo "C:\path\to\match.dem"
```

Build the unsigned portable executable:

```powershell
npm run package:win
```

Artifacts are written to `release/`.

## Local data

The app stores only the active demo cache and viewer preferences under `%LOCALAPPDATA%\CS2DemoViewer`:

- `session.json`
- `preferences.json`
- `cache/<fingerprint>.viewer.json`

The original demo is never copied or modified. If it later becomes unavailable, the last valid cache remains viewable in read-only mode.

## Scope

This project intentionally excludes the source application's SQLite database, demo library, player/team profiles, cross-demo benchmarks, event reports, and coaching-analysis tabs.

