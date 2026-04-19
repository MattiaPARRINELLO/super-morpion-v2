# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install       # Install dependencies (express, socket.io)
npm start         # Production: creates logs/ dir, starts server with logging
npm run dev       # Development: direct node server.js launch
```

No build step, no transpilation — runs as plain Node.js.

To test locally with two players: open two browser tabs at `http://localhost:3000`.

## Architecture

Single-file-per-layer architecture, no bundler:

- **`server.js`** — Express + Socket.IO server. All game logic lives here: move validation, win detection, room lifecycle, session reconnection, state persistence to `rooms.json`. Server is authoritative.
- **`createPage.js`** — Runs on `DOMContentLoaded`, dynamically builds the entire DOM (board, controls, toasts). Injects `script.js` via a dynamic `<script>` tag at the end — this is how `script.js` loads after the DOM is ready.
- **`script.js`** — Socket.IO client, event listeners, UI rendering, localStorage (session/nickname/theme). Mirrors server state after each `stateUpdate` event.
- **`styles.css`** — CSS variables for light/dark themes, CSS grid for the 9×9 board.
- **`index.html`** — Shell only: loads `createPage.js` and `styles.css`. Body is empty at parse time.

## Key Data Structures

Room state (in-memory + `rooms.json`):
```js
{
  players: { X: socketId|null, O: socketId|null },
  nicknames: { [socketId]: nickname },
  state: {
    turn: 'X'|'O',
    lastPlayed: number,      // 0-8, which sub-board the next move must go in
    jokerMode: boolean,      // true when target board is already won (free choice)
    completedCells: number[], // indices of won small boards
    smallBoards: string[9][9], // per sub-board cells: 'X'|'O'|''
    bigBoard: string[9],      // big board cells: 'X'|'O'|''
    score: { X: number, O: number }
  },
  createdAt, lastActivity    // for TTL cleanup
}
```

## Socket Events

Client → Server: `createRoom`, `joinRoom`, `resumeRoom`, `playMove`, `cursorMove`, `leaveRoom`, `listRooms`

Server → Client: `stateUpdate`, `roomInfo`, `playerJoined`, `playerLeft`, `peerCursor`, `roomClosed`, `roomsUpdated`

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3000` | HTTP listen port |
| `ROOM_TTL_MS` | `1800000` | Room inactivity TTL (ms) |
| `LOG_FILE` | — | If set, appends logs to this file path |

## Language

UI labels and code comments are in French.
