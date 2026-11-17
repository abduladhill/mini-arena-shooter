# MINI ARENA SHOOTER

A desktop browser arena shooter for 2–4 players. React, TypeScript, Vite and Tailwind provide the interface. Phaser 3 draws the game. Node.js and Socket.IO run authoritative combat.

## Run on Windows

Install Node.js 22.12+ or Node.js 24. Double-click `start-game.cmd` in this folder. It installs dependencies if necessary, builds the app and starts the game server.

Open **http://localhost:3000**. Keep the server window open while playing. Stop it with Ctrl+C.

Alternatively, run these commands from this directory:

```sh
npm ci
npm run build
npm start
```

The game requires the Node.js server. Open it at the server URL rather than opening `index.html` as a file.

## Play with friends

1. Enter a nickname and select **Create room**.
2. Share the six-character code or copy the invite link.
3. Other players open the same server URL, select **Join room**, and enter the code.
4. Challengers select **Ready up**. The host selects an arena and starts the match.
5. Play for three minutes. The highest elimination count wins. Tied leaders share the win.

**Play** finds an open public lobby on this server or creates one. A second player is required to start. Private rooms are joined using their room code.

On one computer, open two browser tabs or windows for two independent players. On your local network, friends use `http://YOUR-COMPUTER-LAN-IP:3000`. Windows may request permission to allow Node.js through its firewall on your private network. A `localhost` invite only works on the same computer. Create the invite from the LAN or public URL when sharing with other devices.

## Controls and rules

| Input | Action |
| --- | --- |
| WASD or arrow keys | Move |
| Mouse | Aim |
| Left mouse button, held | Shoot |
| Shift | Sprint |
| Escape | Match menu |

Online matches continue while menus are open. Your controls stop while a menu is open or the window loses focus.

- 100 HP per life, 25 damage per hit, four hits to eliminate.
- Respawn after 3 seconds with 1 second of invulnerability.
- Health packs restore 40 HP, capped at 100. Full-health players leave them available.
- Speed boosts last 5 seconds. Pickups return 12 seconds after collection.
- Walls stop movement and lasers. Sprinting changes speed, not damage.
- Every arena is unlocked. Local progression counts completed matches only.
- Room host transfers to a remaining player if the host disconnects.
- Reconnecting creates a fresh connection. Rejoin when the room returns to its lobby.

## Development and verification

```sh
npm run dev
npm run check
npm test
npm run build
```

Development uses Vite at http://localhost:5173 and proxies Socket.IO to port 3000. Production serves the interface and Socket.IO from the same Node.js process at port 3000, or the `PORT` environment variable.

The test suite checks normalized movement, collision, projectile damage, cover, all five arenas' connectivity, power-ups, invulnerability, fire-rate limits and joint winners. Integration tests use four independent Socket.IO clients plus a fifth rejected client, exercising room validation, readiness, host permissions, synchronized state, invalid input rejection, damage, elimination, respawn, match completion, rematch resets, host reassignment and disconnect cleanup. The integration test's controllable clock is available only to the imported test harness. The production server exposes no test or state-editing endpoint.

## Deploy to a public Node.js host

Use a host that supports a persistent Node.js process and WebSocket connections.

- Build command: `npm ci && npm run build`
- Start command: `npm start`
- Health-check path: `/health`
- Runtime: Node.js 22.12+ or 24
- Port: use the host-provided `PORT` environment variable
- HTTPS: terminate at the hosting platform's proxy, with WebSocket upgrades enabled
- Run **one server instance**. Rooms live in this process's memory and disappear on restart. This small version has no shared multi-instance room storage.

The frontend uses the page's origin for Socket.IO, so deploy frontend and server together. Static-only hosting cannot run this multiplayer server. The app needs no API keys, database, authentication or external assets. Hosting charges depend on the host you choose.

A Dockerfile is included:

```sh
docker build -t mini-arena-shooter .
docker run --rm -p 3000:3000 mini-arena-shooter
```

## Source layout

- `shared/arenas.ts` — five arenas, spawns and pickup locations.
- `shared/physics.ts` — collision, bounded movement and input validation.
- `server/match.ts` — authoritative simulation, damage, scoring, respawns and pickups.
- `server/app.ts` — room lifecycle, Socket.IO events and fixed-step loop.
- `src/main.tsx` — menus, lobby, HUD, settings and results.
- `src/game.ts` — Phaser rendering, interpolation and input transmission.
- `src/audio.ts` — original synthesized audio.
- `tests/` — simulation and actual Socket.IO integration tests.

No accounts, purchases, paid APIs, external art, telemetry or database are used. Browser storage contains only the nickname, audio preferences and local progression. Multiplayer state is owned by the server.
