import Phaser from 'phaser';
import type { Socket } from 'socket.io-client';
import { getArena } from '../shared/arenas';
import { COLORS, EMPTY_INPUT, WIDTH, HEIGHT, type Snapshot, type Input, type GameEvent } from '../shared/types';
import { playSound } from './audio';

export interface GameRuntime { state: Snapshot | null; socket: Socket; enabled: boolean }
interface VisualPlayer { x: number; y: number; label: Phaser.GameObjects.Text; wasAlive: boolean }
interface Spark { x: number; y: number; born: number; color: number; kind: string }
const colorNumber = (color: string) => Number.parseInt(color.slice(1), 16);

export function mountGame(parent: HTMLElement, runtime: GameRuntime): Phaser.Game {
  class ArenaScene extends Phaser.Scene {
    private surface!: Phaser.GameObjects.Graphics;
    private actors!: Phaser.GameObjects.Graphics;
    private keys!: Record<string, Phaser.Input.Keyboard.Key>;
    private players = new Map<string, VisualPlayer>();
    private sparks: Spark[] = [];
    private lastEvent = 0;
    private lastSend = 0;
    private matchId = '';
    private arenaId = '';
    private focused = true;
    private stopInput = () => { this.focused = false; this.input.keyboard?.resetKeys(); runtime.socket.emit('input', EMPTY_INPUT); };
    private resumeInput = () => { this.focused = true; };

    create() {
      this.surface = this.add.graphics();
      this.actors = this.add.graphics();
      this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT') as Record<string, Phaser.Input.Keyboard.Key>;
      this.input.mouse?.disableContextMenu();
      window.addEventListener('blur', this.stopInput);
      window.addEventListener('focus', this.resumeInput);
      this.events.once('shutdown', () => {
        window.removeEventListener('blur', this.stopInput);
        window.removeEventListener('focus', this.resumeInput);
      });
    }

    private drawArena(id: string) {
      const arena = getArena(id);
      const g = this.surface;
      const accent = colorNumber(arena.accent);
      g.clear();
      g.fillStyle(0x111827); g.fillRect(0, 0, WIDTH, HEIGHT);
      g.lineStyle(1, 0x253147, .5);
      for (let x = 24; x < WIDTH; x += 40) g.lineBetween(x, 24, x, HEIGHT - 24);
      for (let y = 24; y < HEIGHT; y += 40) g.lineBetween(24, y, WIDTH - 24, y);
      g.lineStyle(2, accent, .38); g.strokeRect(24, 24, WIDTH - 48, HEIGHT - 48);
      g.lineStyle(10, accent, .04); g.strokeRect(30, 30, WIDTH - 60, HEIGHT - 60);
      for (const spawn of arena.spawns) {
        g.fillStyle(accent, .04); g.fillCircle(spawn.x, spawn.y, 34);
        g.lineStyle(1, accent, .16); g.strokeCircle(spawn.x, spawn.y, 34);
        g.lineBetween(spawn.x - 10, spawn.y, spawn.x + 10, spawn.y);
        g.lineBetween(spawn.x, spawn.y - 10, spawn.x, spawn.y + 10);
      }
      for (const wall of arena.walls) {
        g.fillStyle(0x080e19, .7); g.fillRoundedRect(wall.x + 5, wall.y + 8, wall.w, wall.h, 4);
        g.fillStyle(id === 'desert' ? 0x534737 : 0x303c53); g.fillRoundedRect(wall.x, wall.y, wall.w, wall.h, 4);
        g.lineStyle(1, 0x64728d, .7); g.strokeRoundedRect(wall.x, wall.y, wall.w, wall.h, 4);
        g.fillStyle(accent, .6); g.fillRect(wall.x + 9, wall.y, Math.min(wall.w - 18, 30), 3);
        g.lineStyle(1, 0x72809a, .15);
        g.lineBetween(wall.x + 8, wall.y + 8, wall.x + wall.w - 8, wall.y + wall.h - 8);
        g.lineBetween(wall.x + wall.w - 8, wall.y + 8, wall.x + 8, wall.y + wall.h - 8);
      }
    }

    private effect(event: GameEvent, now: number) {
      const player = runtime.state?.players.find(player => player.id === event.player);
      this.sparks.push({ x: event.x, y: event.y, born: now, kind: event.type,
        color: event.type === 'hit' ? 0xffffff : colorNumber(COLORS[player?.color ?? 0]) });
      playSound(event.type);
      if (event.type === 'hit' && event.player === runtime.socket.id) this.cameras.main.shake(80, .002);
    }

    update(time: number, delta: number) {
      const state = runtime.state;
      if (!state) return;
      if (this.arenaId !== state.arenaId) { this.arenaId = state.arenaId; this.drawArena(state.arenaId); }
      if (this.matchId !== state.matchId) {
        this.matchId = state.matchId; this.lastEvent = 0; this.sparks = [];
        for (const visual of this.players.values()) visual.label.destroy();
        this.players.clear();
      }
      const active = runtime.enabled && this.focused && state.phase === 'playing';
      const pointer = this.input.activePointer;
      const me = state.players.find(player => player.id === runtime.socket.id);
      const visualMe = me && this.players.get(me.id);
      const aim = me ? Math.atan2(pointer.y - (visualMe?.y ?? me.y), pointer.x - (visualMe?.x ?? me.x)) : 0;
      if (time - this.lastSend > 1000 / 30) {
        const input: Input = active ? {
          x: Number(this.keys.D.isDown || this.keys.RIGHT.isDown) - Number(this.keys.A.isDown || this.keys.LEFT.isDown),
          y: Number(this.keys.S.isDown || this.keys.DOWN.isDown) - Number(this.keys.W.isDown || this.keys.UP.isDown),
          angle: aim, fire: pointer.leftButtonDown() && pointer.x >= 0 && pointer.x < WIDTH && pointer.y >= 0 && pointer.y < HEIGHT,
          sprint: this.keys.SHIFT.isDown
        } : { ...EMPTY_INPUT };
        runtime.socket.emit('input', input);
        this.lastSend = time;
      }
      for (const event of state.events) {
        if (event.id <= this.lastEvent) continue;
        this.lastEvent = event.id; this.effect(event, time);
      }
      const g = this.actors; g.clear();
      for (const pickup of state.pickups) {
        if (pickup.availableAt > state.time) continue;
        const tint = pickup.kind === 'health' ? 0xa9ef62 : 0x64c9ff;
        const bob = Math.sin(time / 350 + pickup.id) * 3;
        g.fillStyle(tint, .08); g.fillCircle(pickup.x, pickup.y, 24 + Math.sin(time / 350) * 3);
        g.fillStyle(0x1b2939); g.fillRoundedRect(pickup.x - 12, pickup.y - 12 + bob, 24, 24, 6);
        g.lineStyle(1.5, tint, .8); g.strokeRoundedRect(pickup.x - 12, pickup.y - 12 + bob, 24, 24, 6);
        g.fillStyle(tint);
        if (pickup.kind === 'health') {
          g.fillRect(pickup.x - 7, pickup.y - 2 + bob, 14, 4); g.fillRect(pickup.x - 2, pickup.y - 7 + bob, 4, 14);
        } else g.fillTriangle(pickup.x + 2, pickup.y - 9 + bob, pickup.x - 6, pickup.y + 2 + bob, pickup.x + 6, pickup.y + 1 + bob);
      }
      for (const bullet of state.bullets) {
        const owner = state.players.find(player => player.id === bullet.owner);
        const tint = colorNumber(COLORS[owner?.color ?? 0]);
        g.lineStyle(9, tint, .13); g.lineBetween(bullet.x, bullet.y, bullet.x - bullet.vx / 35, bullet.y - bullet.vy / 35);
        g.lineStyle(3, tint); g.lineBetween(bullet.x, bullet.y, bullet.x - bullet.vx / 55, bullet.y - bullet.vy / 55);
        g.fillStyle(0xffffff); g.fillCircle(bullet.x, bullet.y, 2);
      }
      for (const player of state.players) {
        let visual = this.players.get(player.id);
        if (!visual) {
          visual = { x: player.x, y: player.y, wasAlive: player.alive,
            label: this.add.text(0, 0, '', { fontFamily: 'Arial', fontSize: '12px', color: '#b9c6de' }).setOrigin(.5) };
          this.players.set(player.id, visual);
        }
        visual.label.setVisible(player.alive);
        if (!player.alive) { visual.wasAlive = false; continue; }
        const teleported = !visual.wasAlive || Math.hypot(player.x - visual.x, player.y - visual.y) > 150;
        const blend = teleported ? 1 : 1 - Math.exp(-Math.min(delta, 100) / 35);
        visual.x += (player.x - visual.x) * blend; visual.y += (player.y - visual.y) * blend; visual.wasAlive = true;
        const { x, y } = visual;
        const tint = colorNumber(COLORS[player.color]);
        const angle = player.id === me?.id && active ? aim : player.angle;
        visual.label.setPosition(x, y - 35).setText(player.name + (player.id === me?.id ? ' · YOU' : ''));
        g.fillStyle(0x050a12, .5); g.fillEllipse(x + 2, y + 12, 34, 16);
        if (player.protectedUntil > state.time || player.boostUntil > state.time) {
          g.lineStyle(2, player.boostUntil > state.time ? 0x64c9ff : tint, .6 + Math.sin(time / 100) * .2);
          g.strokeCircle(x, y, 23);
        }
        if (player.id === me?.id) { g.lineStyle(1, tint, .2); g.strokeCircle(x, y, 26); }
        g.lineStyle(10, 0x121b28); g.lineBetween(x, y, x + Math.cos(angle) * 28, y + Math.sin(angle) * 28);
        g.lineStyle(4, tint); g.lineBetween(x + Math.cos(angle) * 16, y + Math.sin(angle) * 16, x + Math.cos(angle) * 28, y + Math.sin(angle) * 28);
        g.fillStyle(tint); g.fillRoundedRect(x - 13, y - 13, 26, 26, 9);
        g.fillStyle(0xffffff, .18); g.fillRoundedRect(x - 10, y - 11, 20, 9, 4);
        g.lineStyle(7, 0x182139);
        const faceX = x + Math.cos(angle) * 6, faceY = y + Math.sin(angle) * 6;
        g.lineBetween(faceX - Math.sin(angle) * 6, faceY + Math.cos(angle) * 6, faceX + Math.sin(angle) * 6, faceY - Math.cos(angle) * 6);
        g.fillStyle(0x182139); g.fillRoundedRect(x - 18, y + 21, 36, 4, 2);
        g.fillStyle(player.hp <= 25 ? 0xff7185 : tint); g.fillRoundedRect(x - 18, y + 21, 36 * player.hp / 100, 4, 2);
      }
      this.sparks = this.sparks.filter(spark => time - spark.born < 350);
      for (const spark of this.sparks) {
        const progress = (time - spark.born) / 350;
        const size = spark.kind === 'kill' ? 45 : 23;
        g.lineStyle(2, spark.color, 1 - progress); g.strokeCircle(spark.x, spark.y, 4 + progress * size);
      }
      if (active) {
        g.lineStyle(1.5, 0xffffff, .8); g.strokeCircle(pointer.x, pointer.y, 7);
        g.lineBetween(pointer.x - 12, pointer.y, pointer.x - 9, pointer.y);
        g.lineBetween(pointer.x + 9, pointer.y, pointer.x + 12, pointer.y);
        g.lineBetween(pointer.x, pointer.y - 12, pointer.x, pointer.y - 9);
        g.lineBetween(pointer.x, pointer.y + 9, pointer.x, pointer.y + 12);
      }
    }
  }
  return new Phaser.Game({ type: Phaser.AUTO, parent, width: WIDTH, height: HEIGHT, backgroundColor: '#111827',
    antialias: true, scene: ArenaScene, audio: { noAudio: true },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { powerPreference: 'high-performance' } });
}
