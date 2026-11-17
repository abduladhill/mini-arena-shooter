import test from 'node:test';
import assert from 'node:assert/strict';
import { getArena } from '../shared/arenas';
import { movePlayer, blocked, parseInput } from '../shared/physics';
import { EMPTY_INPUT } from '../shared/types';
import { Match, member } from '../server/match';

test('movement is normalized, sprint is faster, and walls stop players', () => {
  const input = { ...EMPTY_INPUT, x: 1 };
  const walls = getArena('training').walls;
  const start = { x: 100, y: 200 };
  const normal = movePlayer(start, input, .1, walls);
  assert.equal(normal.x, 119);
  const diagonal = movePlayer(start, { ...input, y: 1 }, .1, walls);
  assert.ok(Math.abs(Math.hypot(diagonal.x - 100, diagonal.y - 200) - 19) < .001);
  assert.ok(movePlayer(start, { ...input, sprint: true }, .1, walls).x > normal.x);
  const stopped = movePlayer(start, input, 1, walls);
  assert.ok(stopped.x <= 215);
  assert.equal(blocked(stopped, walls), false);
  assert.equal(parseInput({ ...input, x: 1000 }), null);
  assert.equal(parseInput({ ...input, angle: NaN }), null);
});

test('laser hits cause 25 damage and cover blocks projectiles', () => {
  const match = new Match('training', [member('a', 'Alpha', 0), member('b', 'Bravo', 1)]);
  Object.assign(match.players[0], { x: 100, y: 100 });
  Object.assign(match.players[1], { x: 250, y: 100, protectedUntil: 0 });
  match.input('a', { ...EMPTY_INPUT, fire: true });
  match.tick(1 / 60);
  match.input('a', EMPTY_INPUT);
  for (let i = 0; i < 20; i++) match.tick(1 / 60);
  assert.equal(match.players[1].hp, 75);
  Object.assign(match.players[0], { x: 200, y: 200 });
  Object.assign(match.players[1], { x: 370, y: 200 });
  match.input('a', { ...EMPTY_INPUT, fire: true });
  match.tick(1 / 60);
  match.input('a', EMPTY_INPUT);
  for (let i = 0; i < 30; i++) match.tick(1 / 60);
  assert.equal(match.players[1].hp, 75);
});
