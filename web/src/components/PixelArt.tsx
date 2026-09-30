interface Pixel {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  opacity?: number;
}

function PixelGrid({ pixels, cols, rows, size }: { pixels: Pixel[]; cols: number; rows: number; size: number }) {
  return (
    <svg
      width={size * (cols / rows)}
      height={size}
      viewBox={`0 0 ${cols} ${rows}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {pixels.map((pixel, index) => (
        <rect
          key={index}
          x={pixel.x}
          y={pixel.y}
          width={pixel.w}
          height={pixel.h}
          fill={pixel.fill}
          opacity={pixel.opacity}
        />
      ))}
    </svg>
  );
}

const GOLD = '#ffb000';
const GOLD_DARK = '#d89400';
const INK = '#000';

const LOGO: Pixel[] = [
  { x: 0, y: 3, w: 2, h: 6, fill: INK },
  { x: 2, y: 1, w: 3, h: 10, fill: INK },
  { x: 3, y: 2, w: 1, h: 8, fill: GOLD },
  { x: 5, y: 2, w: 3, h: 8, fill: INK },
  { x: 6, y: 3, w: 1, h: 6, fill: GOLD_DARK },
  { x: 8, y: 5, w: 14, h: 2, fill: INK },
  { x: 8, y: 5, w: 14, h: 1, fill: '#b3a58c' },
  { x: 22, y: 2, w: 3, h: 8, fill: INK },
  { x: 23, y: 3, w: 1, h: 6, fill: GOLD_DARK },
  { x: 25, y: 1, w: 3, h: 10, fill: INK },
  { x: 26, y: 2, w: 1, h: 8, fill: GOLD },
  { x: 28, y: 3, w: 2, h: 6, fill: INK },
];

export function LogoMark({ size = 48 }: { size?: number }) {
  return <PixelGrid pixels={LOGO} cols={30} rows={12} size={size} />;
}

const TROPHY: Pixel[] = [
  { x: 2, y: 1, w: 8, h: 1, fill: INK },
  { x: 2, y: 2, w: 8, h: 4, fill: GOLD },
  { x: 0, y: 2, w: 2, h: 1, fill: GOLD },
  { x: 10, y: 2, w: 2, h: 1, fill: GOLD },
  { x: 0, y: 3, w: 1, h: 2, fill: GOLD },
  { x: 11, y: 3, w: 1, h: 2, fill: GOLD },
  { x: 3, y: 6, w: 6, h: 1, fill: GOLD_DARK },
  { x: 5, y: 7, w: 2, h: 2, fill: GOLD_DARK },
  { x: 3, y: 9, w: 6, h: 2, fill: GOLD },
  { x: 3, y: 11, w: 6, h: 1, fill: INK },
  { x: 4, y: 3, w: 1, h: 2, fill: '#ffe27a' },
];

export function TrophyIcon({ size = 36 }: { size?: number }) {
  return <PixelGrid pixels={TROPHY} cols={12} rows={12} size={size} />;
}

export type ItemIconKind = 'belt' | 'chalk' | 'straps' | 'sleeves' | 'shoes' | 'scraps' | 'scroll' | 'locked';

function itemPixels(kind: ItemIconKind, color: string): Pixel[] {
  switch (kind) {
    case 'belt':
      return [
        { x: 1, y: 4, w: 10, h: 4, fill: color },
        { x: 1, y: 4, w: 10, h: 1, fill: INK, opacity: 0.25 },
        { x: 5, y: 3, w: 3, h: 6, fill: INK },
        { x: 6, y: 4, w: 1, h: 4, fill: '#d8c8a8' },
      ];
    case 'chalk':
      return [
        { x: 3, y: 3, w: 6, h: 7, fill: '#f0e6d0' },
        { x: 4, y: 2, w: 4, h: 1, fill: '#d8c8a8' },
        { x: 3, y: 5, w: 6, h: 2, fill: color },
        { x: 3, y: 10, w: 6, h: 1, fill: INK },
      ];
    case 'straps':
      return [
        { x: 2, y: 2, w: 2, h: 8, fill: color },
        { x: 5, y: 2, w: 2, h: 8, fill: color },
        { x: 8, y: 2, w: 2, h: 8, fill: color },
        { x: 2, y: 6, w: 8, h: 1, fill: INK, opacity: 0.4 },
      ];
    case 'sleeves':
      return [
        { x: 2, y: 2, w: 3, h: 8, fill: color },
        { x: 7, y: 2, w: 3, h: 8, fill: color },
        { x: 2, y: 2, w: 3, h: 1, fill: INK, opacity: 0.4 },
        { x: 7, y: 2, w: 3, h: 1, fill: INK, opacity: 0.4 },
      ];
    case 'shoes':
      return [
        { x: 2, y: 4, w: 4, h: 4, fill: color },
        { x: 2, y: 8, w: 9, h: 2, fill: color },
        { x: 2, y: 10, w: 9, h: 1, fill: INK },
      ];
    case 'scraps':
      return [
        { x: 2, y: 6, w: 3, h: 3, fill: color },
        { x: 5, y: 4, w: 3, h: 4, fill: color, opacity: 0.8 },
        { x: 7, y: 7, w: 3, h: 3, fill: color, opacity: 0.6 },
      ];
    case 'scroll':
      return [
        { x: 2, y: 2, w: 8, h: 8, fill: '#d8c8a8' },
        { x: 1, y: 2, w: 10, h: 1, fill: '#8a7d66' },
        { x: 1, y: 9, w: 10, h: 1, fill: '#8a7d66' },
        { x: 4, y: 4, w: 4, h: 1, fill: '#5c4f3d' },
        { x: 4, y: 6, w: 3, h: 1, fill: '#5c4f3d' },
      ];
    case 'locked':
      return [
        { x: 4, y: 2, w: 4, h: 1, fill: '#5c4f3d' },
        { x: 7, y: 3, w: 1, h: 2, fill: '#5c4f3d' },
        { x: 5, y: 5, w: 2, h: 1, fill: '#5c4f3d' },
        { x: 5, y: 6, w: 1, h: 2, fill: '#5c4f3d' },
        { x: 5, y: 9, w: 1, h: 1, fill: '#5c4f3d' },
      ];
  }
}

export function ItemIcon({ kind, color, size = 36 }: { kind: ItemIconKind; color: string; size?: number }) {
  return <PixelGrid pixels={itemPixels(kind, color)} cols={12} rows={12} size={size} />;
}
