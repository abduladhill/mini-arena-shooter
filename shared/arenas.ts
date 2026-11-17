import type { Arena, Rect } from './types';

const spawns = [{ x: 85, y: 85 }, { x: 915, y: 555 }, { x: 915, y: 85 }, { x: 85, y: 555 }];
const pickups = [{ x: 500, y: 90 }, { x: 500, y: 550 }, { x: 80, y: 320 }, { x: 920, y: 320 }];
const walls = (items: number[][]): Rect[] => items.map(([x, y, w, h]) => ({ x, y, w, h }));

export const ARENAS: Arena[] = [
  { id: 'training', name: 'Training Ground', subtitle: 'Clean sightlines. Quick decisions.', accent: '#a9ef62', spawns, pickups,
    walls: walls([[230, 170, 110, 70], [660, 400, 110, 70], [230, 400, 110, 70], [660, 170, 110, 70], [460, 260, 80, 120]]) },
  { id: 'maze', name: 'Neon Maze', subtitle: 'Every corner is a possibility.', accent: '#b395ff', spawns, pickups,
    walls: walls([[200, 140, 30, 250], [200, 430, 220, 30], [370, 140, 230, 30], [570, 170, 30, 240], [770, 250, 30, 250], [410, 470, 220, 30]]) },
  { id: 'desert', name: 'Desert Outpost', subtitle: 'Wide open. Stay on your toes.', accent: '#ffbf66', spawns, pickups,
    walls: walls([[210, 160, 75, 75], [710, 410, 75, 75], [350, 400, 80, 80], [570, 160, 80, 80], [460, 290, 80, 60], [750, 160, 55, 55], [190, 440, 55, 55]]) },
  { id: 'lab', name: 'Cyber Lab', subtitle: 'Tight angles. Electric encounters.', accent: '#64c9ff', spawns, pickups,
    walls: walls([[180, 160, 250, 35], [570, 445, 250, 35], [180, 350, 35, 130], [785, 160, 35, 130], [330, 280, 340, 35], [330, 350, 340, 35]]) },
  { id: 'final', name: 'Final Arena', subtitle: 'Four corners. One champion.', accent: '#ff92c6', spawns, pickups,
    walls: walls([[210, 150, 130, 45], [660, 445, 130, 45], [210, 445, 130, 45], [660, 150, 130, 45], [430, 250, 140, 140], [180, 270, 40, 100], [780, 270, 40, 100]]) }
];
export function getArena(id: string): Arena { return ARENAS.find(arena => arena.id === id) ?? ARENAS[0]; }
