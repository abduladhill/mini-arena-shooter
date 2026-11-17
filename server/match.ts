import { randomUUID } from 'node:crypto';
import { getArena } from '../shared/arenas';
import { blocked, movePlayer, parseInput } from '../shared/physics';
import { EMPTY_INPUT, type Input, type Player, type Bullet, type Pickup, type GameEvent, type Snapshot } from '../shared/types';

interface Control { input: Input; updated: number; lastShot: number }

export class Match {
  readonly id = randomUUID();
  readonly players: Player[];
  bullets: Bullet[] = [];
  pickups: Pickup[];
  events: GameEvent[] = [];
  time = 0;
  remaining: number;
  finished = false;
  winners: string[] = [];
  private sequence = 0;
  private controls = new Map<string, Control>();

  constructor(readonly arenaId: string, members: Player[], readonly duration = 180) {
    this.remaining = duration;
    const arena = getArena(arenaId);
    this.players = members.map((member, i) => ({ ...member, ...arena.spawns[i], hp: 100, kills: 0,
      deaths: 0, alive: true, respawnAt: 0, protectedUntil: 1, boostUntil: 0, angle: i % 2 ? Math.PI : 0 }));
    this.pickups = arena.pickups.map((point, i) => ({ ...point, id: i, kind: i % 2 ? 'speed' : 'health', availableAt: 0 }));
    this.players.forEach(player => this.controls.set(player.id, { input: { ...EMPTY_INPUT }, updated: 0, lastShot: -1 }));
  }

  input(id: string, raw: unknown): boolean {
    const input = parseInput(raw);
    const control = this.controls.get(id);
    if (!input || !control || this.finished) return false;
    control.input = input;
    control.updated = this.time;
    return true;
  }

  remove(id: string): void {
    const player = this.players.find(player => player.id === id);
    if (player) { player.alive = false; player.respawnAt = Infinity; }
    this.controls.delete(id);
    this.bullets = this.bullets.filter(bullet => bullet.owner !== id);
  }

  private emit(type: GameEvent['type'], player: Player, target?: string): void {
    this.events.push({ id: ++this.sequence, type, player: player.id, target, x: player.x, y: player.y });
    if (this.events.length > 70) this.events.shift();
  }

  private respawn(player: Player): void {
    const positions = getArena(this.arenaId).spawns;
    const enemies = this.players.filter(other => other.alive && other.id !== player.id);
    const safety = (point: { x: number; y: number }) => Math.min(...enemies.map(enemy => Math.hypot(enemy.x - point.x, enemy.y - point.y)), 2000);
    const point = [...positions].sort((a, b) => safety(b) - safety(a))[0];
    Object.assign(player, point, { hp: 100, alive: true, protectedUntil: this.time + 1, boostUntil: 0 });
    this.emit('respawn', player);
  }

  tick(dt: number): void {
    if (this.finished) return;
    this.time += dt;
    this.remaining = Math.max(0, this.duration - this.time);
    if (this.remaining === 0) {
      this.finished = true;
      const highest = Math.max(...this.players.map(player => player.kills));
      this.winners = this.players.filter(player => player.kills === highest).map(player => player.id);
      this.bullets = [];
      return;
    }
    const walls = getArena(this.arenaId).walls;
    for (const player of this.players) {
      const control = this.controls.get(player.id);
      if (!control) continue;
      if (!player.alive) {
        if (this.time >= player.respawnAt) this.respawn(player);
        continue;
      }
      const input = this.time - control.updated < .3 ? control.input : EMPTY_INPUT;
      Object.assign(player, movePlayer(player, input, dt, walls, player.boostUntil > this.time));
      player.angle = input.angle;
      if (input.fire && this.time - control.lastShot >= .22) {
        control.lastShot = this.time;
        // Start inside the player's circle so a muzzle cannot teleport through cover.
        this.bullets.push({ id: ++this.sequence, owner: player.id, x: player.x, y: player.y,
          vx: Math.cos(player.angle) * 660, vy: Math.sin(player.angle) * 660, life: 1.7 });
        this.emit('shot', player);
      }
      for (const pickup of this.pickups) {
        if (pickup.availableAt > this.time || Math.hypot(player.x - pickup.x, player.y - pickup.y) > 29) continue;
        if (pickup.kind === 'health' && player.hp >= 100) continue;
        if (pickup.kind === 'health') player.hp = Math.min(100, player.hp + 40);
        else player.boostUntil = this.time + 5;
        pickup.availableAt = this.time + 12;
        this.emit('pickup', player);
      }
    }
    this.bullets = this.bullets.filter(bullet => {
      bullet.life -= dt;
      const steps = Math.max(1, Math.ceil(660 * dt / 5));
      for (let i = 0; i < steps; i++) {
        bullet.x += bullet.vx * dt / steps;
        bullet.y += bullet.vy * dt / steps;
        if (blocked(bullet, walls, 4)) return false;
        const victim = this.players.find(player => player.id !== bullet.owner && player.alive &&
          Math.hypot(player.x - bullet.x, player.y - bullet.y) < 19);
        if (!victim) continue;
        if (victim.protectedUntil > this.time) return false;
        victim.hp = Math.max(0, victim.hp - 25);
        this.emit('hit', victim, bullet.owner);
        if (victim.hp === 0) {
          victim.alive = false;
          victim.deaths++;
          victim.respawnAt = this.time + 3;
          victim.boostUntil = 0;
          const attacker = this.players.find(player => player.id === bullet.owner);
          if (attacker) { attacker.kills++; this.emit('kill', attacker, victim.id); }
        }
        return false;
      }
      return bullet.life > 0;
    });
  }

  snapshot(): Pick<Snapshot, 'matchId' | 'time' | 'remaining' | 'players' | 'bullets' | 'pickups' | 'events' | 'winners'> {
    return { matchId: this.id, time: this.time, remaining: this.remaining, players: this.players,
      bullets: this.bullets, pickups: this.pickups, events: this.events, winners: this.winners };
  }
}

export function member(id: string, name: string, color: number): Player {
  return { id, name, color, ready: false, x: 0, y: 0, angle: 0, hp: 100, kills: 0,
    deaths: 0, alive: true, respawnAt: 0, protectedUntil: 0, boostUntil: 0 };
}
