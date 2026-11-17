import express from 'express';
import { createServer } from 'node:http';
import { randomInt } from 'node:crypto';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { Server } from 'socket.io';
import { ARENAS } from '../shared/arenas';
import type { Player, Reply, Snapshot } from '../shared/types';
import { Match, member } from './match';

interface Room {
  code: string; host: string; arenaId: string; members: Map<string, Player>;
  phase: Snapshot['phase']; public: boolean; match?: Match; touched: number;
}
interface ServerOptions { duration?: number; manual?: boolean }

export function createArenaServer(options: ServerOptions = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.get('/health', (_request, response) => response.json({ ok: true }));
  app.use(express.static(path.resolve('dist')));
  app.get('*', (_request, response) => response.sendFile(path.resolve('dist/index.html')));
  const http = createServer(app);
  const io = new Server(http, { maxHttpBufferSize: 4096, pingTimeout: 10000 });
  const rooms = new Map<string, Room>();

  function snapshot(room: Room): Snapshot {
    const base = { code: room.code, host: room.host, arenaId: room.arenaId, phase: room.phase };
    if (room.match) return { ...base, ...room.match.snapshot() };
    return { ...base, matchId: '', time: 0, remaining: 180, players: [...room.members.values()], bullets: [], pickups: [], events: [], winners: [] };
  }
  function broadcast(room: Room) { io.to(room.code).emit('state', snapshot(room)); }

  io.on('connection', socket => {
    let roomCode: string | undefined;
    let commandWindow = Date.now();
    let commands = 0;
    let inputWindow = Date.now();
    let inputs = 0;

    function leave() {
      if (!roomCode) return;
      const room = rooms.get(roomCode);
      socket.leave(roomCode);
      roomCode = undefined;
      if (!room) return;
      room.members.delete(socket.id);
      room.match?.remove(socket.id);
      if (room.members.size === 0) { rooms.delete(room.code); return; }
      if (room.host === socket.id) {
        room.host = room.members.keys().next().value!;
        room.members.get(room.host)!.ready = true;
      }
      room.touched = Date.now();
      broadcast(room);
    }

    function join(room: Room, name: string) {
      leave();
      const colors = new Set([...room.members.values()].map(player => player.color));
      const color = [0, 1, 2, 3].find(color => !colors.has(color))!;
      const player = member(socket.id, name, color);
      player.ready = room.members.size === 0;
      room.members.set(socket.id, player);
      roomCode = room.code;
      socket.join(room.code);
      room.touched = Date.now();
      broadcast(room);
    }

    function newRoom(isPublic: boolean): Room {
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let code: string;
      do { code = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join(''); } while (rooms.has(code));
      const room: Room = { code, host: socket.id, arenaId: 'training', members: new Map(), phase: 'lobby', public: isPublic, touched: Date.now() };
      rooms.set(code, room);
      return room;
    }

    socket.on('command', (data: unknown, callback: unknown) => {
      const reply = typeof callback === 'function' ? callback as (result: Reply) => void : () => {};
      if (Date.now() - commandWindow > 1000) { commandWindow = Date.now(); commands = 0; }
      if (++commands > 12) return reply({ ok: false, error: 'Slow down for a moment.' });
      if (!data || typeof data !== 'object') return reply({ ok: false, error: 'Invalid request.' });
      const request = data as Record<string, unknown>;
      const action = request.action;
      if (['create', 'join', 'quick'].includes(String(action))) {
        if (roomCode) return reply({ ok: false, error: 'Leave your current room first.' });
        const name = typeof request.name === 'string' ? request.name.trim().replace(/[\x00-\x1f\x7f]/g, '').slice(0, 16) : '';
        if (!name) return reply({ ok: false, error: 'Enter a nickname first.' });
        let room: Room | undefined;
        if (action === 'join') {
          const code = typeof request.code === 'string' ? request.code.trim().toUpperCase() : '';
          room = rooms.get(code);
          if (!room) return reply({ ok: false, error: 'Room not found. Check the six-character code.' });
          if (room.phase !== 'lobby') return reply({ ok: false, error: 'This room is in a match. Join after it returns to the lobby.' });
          if (room.members.size >= 4) return reply({ ok: false, error: 'This room is full (4/4).' });
        } else {
          if (action === 'quick') room = [...rooms.values()].find(room => room.public && room.phase === 'lobby' && room.members.size < 4);
          if (!room) {
            if (rooms.size >= 200) return reply({ ok: false, error: 'Server is full. Try again shortly.' });
            room = newRoom(action === 'quick');
          }
        }
        join(room, name);
        return reply({ ok: true, code: room.code });
      }
      const room = roomCode ? rooms.get(roomCode) : undefined;
      if (!room) return reply({ ok: false, error: 'Join a room first.' });
      room.touched = Date.now();
      if (action === 'leave') { leave(); return reply({ ok: true }); }
      if (action === 'ready' && room.phase === 'lobby') {
        const player = room.members.get(socket.id)!;
        player.ready = !player.ready;
      } else if (action === 'lobby' && room.phase === 'results') {
        room.phase = 'lobby';
        room.match = undefined;
        for (const player of room.members.values()) player.ready = player.id === room.host;
      } else if (action === 'arena' && room.phase === 'lobby' && socket.id === room.host) {
        if (!ARENAS.some(arena => arena.id === request.arenaId)) return reply({ ok: false, error: 'Unknown arena.' });
        room.arenaId = request.arenaId as string;
      } else if (action === 'start' && socket.id === room.host && room.phase !== 'playing') {
        if (room.members.size < 2) return reply({ ok: false, error: 'You need at least two players to start.' });
        if (room.phase === 'lobby' && [...room.members.values()].some(player => player.id !== room.host && !player.ready)) {
          return reply({ ok: false, error: 'Wait for everyone to ready up.' });
        }
        room.match = new Match(room.arenaId, [...room.members.values()], options.duration);
        room.phase = 'playing';
      } else return reply({ ok: false, error: 'That action is not available right now.' });
      broadcast(room);
      reply({ ok: true });
    });

    socket.on('input', (input: unknown) => {
      if (Date.now() - inputWindow > 1000) { inputWindow = Date.now(); inputs = 0; }
      if (++inputs > 90) return;
      const room = roomCode ? rooms.get(roomCode) : undefined;
      if (room?.phase === 'playing') room.match?.input(socket.id, input);
    });
    socket.on('disconnect', leave);
  });

  function advance(seconds: number) {
    // A fixed step keeps collision and fire cadence independent of client frequency.
    const steps = Math.ceil(seconds * 60);
    for (let i = 0; i < steps; i++) {
      for (const room of rooms.values()) {
        if (room.phase !== 'playing' || !room.match) continue;
        room.match.tick(seconds / steps);
        if (room.match.finished) room.phase = 'results';
      }
    }
    for (const room of rooms.values()) broadcast(room);
  }
  let previous = performance.now();
  let accumulator = 0;
  let broadcasts = 0;
  const timer = options.manual ? undefined : setInterval(() => {
    const now = performance.now();
    accumulator += Math.min((now - previous) / 1000, .25);
    previous = now;
    while (accumulator >= 1 / 60) {
      for (const room of rooms.values()) {
        if (room.phase === 'playing' && room.match) {
          room.match.tick(1 / 60);
          if (room.match.finished) room.phase = 'results';
        }
      }
      accumulator -= 1 / 60;
    }
    if (++broadcasts % 3 === 0) for (const room of rooms.values()) if (room.phase !== 'lobby') broadcast(room);
  }, 1000 / 60);
  const cleanup = setInterval(() => {
    for (const room of rooms.values()) {
      if (room.phase === 'playing' || Date.now() - room.touched < 30 * 60 * 1000) continue;
      io.to(room.code).emit('expired');
      io.in(room.code).disconnectSockets(true);
      rooms.delete(room.code);
    }
  }, 60000);
  cleanup.unref();
  return { app, http, io, rooms, advance,
    listen: (port = 3000, host = '0.0.0.0') => new Promise<number>(resolve => http.listen(port, host, () => {
      const address = http.address();
      resolve(typeof address === 'object' && address ? address.port : port);
    })),
    close: () => new Promise<void>(resolve => {
      if (timer) clearInterval(timer);
      clearInterval(cleanup);
      io.close(() => resolve());
    })
  };
}
