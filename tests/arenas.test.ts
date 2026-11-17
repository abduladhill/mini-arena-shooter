import test from 'node:test';
import assert from 'node:assert/strict';
import { ARENAS } from '../shared/arenas';
import { blocked } from '../shared/physics';
import { EMPTY_INPUT } from '../shared/types';
import { Match, member } from '../server/match';

for (const arena of ARENAS) test(`${arena.name}: all walkable cells, spawns and pickups are connected`, () => {
  const cells = new Set<string>();
  for (let x = 40; x <= 960; x += 10) for (let y = 40; y <= 600; y += 10) {
    if (!blocked({ x, y }, arena.walls)) cells.add(`${x},${y}`);
  }
  const first = cells.values().next().value!;
  const reached = new Set([first]);
  const queue = [first];
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i].split(',').map(Number);
    for (const [dx, dy] of [[10, 0], [-10, 0], [0, 10], [0, -10]]) {
      const key = `${x + dx},${y + dy}`;
      if (!cells.has(key) || reached.has(key)) continue;
      reached.add(key); queue.push(key);
    }
  }
  assert.equal(reached.size, cells.size);
  for (const point of [...arena.spawns, ...arena.pickups]) assert.equal(blocked(point, arena.walls), false);
});

test('pickups are server-owned, health caps at 100, boost lasts five seconds and pickups return', () => {
  const match = new Match('training', [member('a', 'Alpha', 0), member('b', 'Bravo', 1)]);
  const player = match.players[0];
  Object.assign(player, { x: match.pickups[0].x, y: match.pickups[0].y, hp: 75 });
  match.tick(1 / 60);
  assert.equal(player.hp, 100);
  assert.ok(match.pickups[0].availableAt > match.time + 11.9);
  player.hp = 25;
  match.tick(1 / 60);
  assert.equal(player.hp, 25);
  Object.assign(player, { x: match.pickups[1].x, y: match.pickups[1].y });
  match.tick(1 / 60);
  assert.equal(player.boostUntil, match.time + 5);
  const boostedUntil = player.boostUntil;
  Object.assign(player, { x: 100, y: 100 });
  for (let i = 0; i < 301; i++) match.tick(1 / 60);
  assert.ok(boostedUntil < match.time);
  for (let i = 0; i < 430; i++) match.tick(1 / 60);
  Object.assign(player, { x: match.pickups[0].x, y: match.pickups[0].y });
  match.tick(1 / 60);
  assert.equal(player.hp, 65);
});

test('fire rate cannot be bypassed and invulnerability absorbs shots', () => {
  const match = new Match('training', [member('a', 'Alpha', 0), member('b', 'Bravo', 1)]);
  Object.assign(match.players[0], { x: 100, y: 100 });
  Object.assign(match.players[1], { x: 250, y: 100 });
  for (let i = 0; i < 30; i++) {
    for (let j = 0; j < 10; j++) match.input('a', { ...EMPTY_INPUT, fire: true });
    match.tick(1 / 60);
  }
  assert.equal(match.players[1].hp, 100);
  assert.ok(match.events.filter(event => event.type === 'shot').length <= 3);
});

test('ties declare joint winners and a finished match rejects input', () => {
  const match = new Match('training', [member('a', 'Alpha', 0), member('b', 'Bravo', 1)], .1);
  for (let i = 0; i < 8; i++) match.tick(1 / 60);
  assert.equal(match.finished, true);
  assert.deepEqual(match.winners, ['a', 'b']);
  assert.equal(match.input('a', { ...EMPTY_INPUT, fire: true }), false);
  assert.equal(match.remaining, 0);
});
