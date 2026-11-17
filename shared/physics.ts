import { HEIGHT, WIDTH, PLAYER_RADIUS, type Point, type Rect, type Input } from './types';

export function circleRect(point: Point, radius: number, rect: Rect): boolean {
  const x = Math.max(rect.x, Math.min(point.x, rect.x + rect.w));
  const y = Math.max(rect.y, Math.min(point.y, rect.y + rect.h));
  return (point.x - x) ** 2 + (point.y - y) ** 2 < radius ** 2;
}
export function blocked(point: Point, walls: Rect[], radius = PLAYER_RADIUS): boolean {
  return point.x < 24 + radius || point.x > WIDTH - 24 - radius ||
    point.y < 24 + radius || point.y > HEIGHT - 24 - radius ||
    walls.some(wall => circleRect(point, radius, wall));
}
export function movePlayer(point: Point, input: Input, dt: number, walls: Rect[], boosted = false): Point {
  const magnitude = Math.hypot(input.x, input.y);
  if (!magnitude) return { ...point };
  const speed = 190 * (input.sprint ? 1.4 : 1) * (boosted ? 1.35 : 1);
  const distance = speed * dt;
  const dx = input.x / Math.max(1, magnitude) * distance;
  const dy = input.y / Math.max(1, magnitude) * distance;
  const steps = Math.max(1, Math.ceil(distance / 5));
  const result = { ...point };
  for (let i = 0; i < steps; i++) {
    const nextX = { x: result.x + dx / steps, y: result.y };
    if (!blocked(nextX, walls)) result.x = nextX.x;
    const nextY = { x: result.x, y: result.y + dy / steps };
    if (!blocked(nextY, walls)) result.y = nextY.y;
  }
  return result;
}
export function parseInput(raw: unknown): Input | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.x !== 'number' || !Number.isFinite(value.x) || Math.abs(value.x) > 1 ||
      typeof value.y !== 'number' || !Number.isFinite(value.y) || Math.abs(value.y) > 1 ||
      typeof value.angle !== 'number' || !Number.isFinite(value.angle) ||
      typeof value.fire !== 'boolean' || typeof value.sprint !== 'boolean') return null;
  return { x: value.x, y: value.y, angle: value.angle % (Math.PI * 2), fire: value.fire, sprint: value.sprint };
}
