import test from 'node:test';
import assert from 'node:assert/strict';
import { io, type Socket } from 'socket.io-client';
import { createArenaServer } from '../server/app';
import { EMPTY_INPUT, type Reply, type Snapshot } from '../shared/types';

const command = (socket: Socket, action: string, data = {}): Promise<Reply> =>
  new Promise((resolve, reject) => socket.timeout(2000).emit('command', { action, ...data }, (error: Error | null, reply: Reply) => error ? reject(error) : resolve(reply)));
const settle = () => new Promise(resolve => setTimeout(resolve, 30));

test('four real sockets: room validation, movement, authoritative combat, results, rematch, disconnect cleanup', async () => {
  const server = createArenaServer({ manual: true, duration: 20 });
  const port = await server.listen(0, '127.0.0.1');
  const clients: Socket[] = [];
  try {
    for (let i = 0; i < 5; i++) {
      const socket = io(`http://127.0.0.1:${port}`, { forceNew: true, transports: ['websocket'] });
      await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
      clients.push(socket);
    }
    const [a, b, c, d, extra] = clients;
    const created = await command(a, 'create', { name: 'Alpha' });
    assert.match(created.code!, /^[A-Z2-9]{6}$/);
    assert.equal((await command(a, 'start')).ok, false);
    assert.equal((await command(b, 'join', { name: 'Bravo', code: 'BADBAD' })).ok, false);
    for (const [i, socket] of [b, c, d].entries()) {
      assert.equal((await command(socket, 'join', { name: `Guest ${i}`, code: created.code })).ok, true);
      assert.equal((await command(socket, 'ready')).ok, true);
    }
    assert.equal((await command(extra, 'join', { name: 'Extra', code: created.code })).ok, false);
    assert.equal((await command(b, 'start')).ok, false);
    assert.equal((await command(a, 'start')).ok, true);
    const room = server.rooms.get(created.code!)!;
    assert.equal(new Set(room.match!.players.map(player => player.color)).size, 4);
    let observed: Snapshot | undefined;
    b.on('state', state => { observed = state; });
    const oldX = room.match!.players[0].x;
    a.emit('input', { ...EMPTY_INPUT, x: 1 });
    await settle();
    server.advance(.2);
    await settle();
    assert.ok(observed!.players[0].x > oldX);
    const movedX = room.match!.players[0].x;
    a.emit('input', { ...EMPTY_INPUT, x: 9999, kills: 9999, hp: 9999 });
    await settle();
    server.advance(.5);
    assert.ok(room.match!.players[0].x < movedX + 60);
    assert.equal(room.match!.players[0].kills, 0);
    // Arrange a clear firing lane on the server, then exercise real input messages.
    Object.assign(room.match!.players[0], { x: 100, y: 100 });
    Object.assign(room.match!.players[1], { x: 250, y: 100, protectedUntil: 0 });
    for (let i = 0; i < 4; i++) {
      a.emit('input', { ...EMPTY_INPUT, fire: true });
      await settle(); server.advance(1 / 60);
      a.emit('input', EMPTY_INPUT);
      await settle(); server.advance(.3);
    }
    assert.equal(room.match!.players[1].hp, 0);
    assert.equal(room.match!.players[1].deaths, 1);
    assert.equal(room.match!.players[0].kills, 1);
    await settle();
    assert.equal(observed!.players[1].alive, false);
    server.advance(3.1);
    assert.equal(room.match!.players[1].hp, 100);
    assert.ok(room.match!.players[1].protectedUntil > room.match!.time);
    const matchId = room.match!.id;
    server.advance(20);
    assert.equal(room.phase, 'results');
    assert.deepEqual(room.match!.winners, [a.id]);
    assert.equal((await command(a, 'start')).ok, true);
    assert.notEqual(room.match!.id, matchId);
    assert.ok(room.match!.players.every(player => player.hp === 100 && player.kills === 0 && player.deaths === 0));
    assert.equal(room.match!.bullets.length, 0);
    a.disconnect(); await settle();
    assert.equal(room.host, b.id);
    assert.equal(room.members.size, 3);
    server.advance(.1);
    b.disconnect(); c.disconnect(); d.disconnect(); await settle();
    assert.equal(server.rooms.size, 0);
  } finally {
    clients.forEach(socket => socket.disconnect());
    await server.close();
  }
});
