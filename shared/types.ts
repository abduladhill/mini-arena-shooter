export interface Point { x: number; y: number }
export interface Rect extends Point { w: number; h: number }
export interface Arena {
  id: string; name: string; subtitle: string; accent: string; walls: Rect[];
  spawns: Point[]; pickups: Point[];
}
export interface Input { x: number; y: number; angle: number; fire: boolean; sprint: boolean }
export interface Player extends Point {
  id: string; name: string; color: number; ready: boolean; angle: number;
  hp: number; kills: number; deaths: number; alive: boolean;
  respawnAt: number; protectedUntil: number; boostUntil: number;
}
export interface Bullet extends Point { id: number; owner: string; vx: number; vy: number; life: number }
export interface Pickup extends Point { id: number; kind: 'health' | 'speed'; availableAt: number }
export interface GameEvent { id: number; type: 'shot' | 'hit' | 'kill' | 'respawn' | 'pickup'; player: string; target?: string; x: number; y: number }
export interface Snapshot {
  code: string; host: string; arenaId: string; phase: 'lobby' | 'playing' | 'results';
  matchId: string; time: number; remaining: number; players: Player[];
  bullets: Bullet[]; pickups: Pickup[]; events: GameEvent[]; winners: string[];
}
export interface Reply { ok: boolean; error?: string; code?: string }
export const WIDTH = 1000;
export const HEIGHT = 640;
export const PLAYER_RADIUS = 15;
export const COLORS = ['#a9ef62', '#64c9ff', '#ff92c6', '#ffbf66'];
export const EMPTY_INPUT: Input = { x: 0, y: 0, angle: 0, fire: false, sprint: false };
