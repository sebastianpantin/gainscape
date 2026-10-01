import { crc32, inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { decodePng, encodePng, PNG_SIGNATURE, readChunks, scanlines } from '../../scripts/icons/png.ts';
import { APP_ICONS, MASKABLE_SAFE_RADIUS_FRACTION, parseColor, renderAppIcon } from '../../scripts/icons/render.ts';
import { APP_ICON_BACKGROUND } from '../../web/src/components/pixel-sprites.ts';

const image = {
  width: 3,
  height: 2,
  rgba: Uint8Array.from({ length: 3 * 2 * 4 }, (_, index) => (index * 37) % 256),
};

describe('png encoder', () => {
  it('starts with the PNG signature and ends with IEND', () => {
    const png = encodePng(image);
    expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
    expect(readChunks(png).map((chunk) => chunk.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
  });

  it('writes a correct CRC for every chunk', () => {
    for (const chunk of readChunks(encodePng(image)))
      expect(chunk.crc).toBe(crc32(Buffer.concat([Buffer.from(chunk.type, 'ascii'), chunk.data])));
  });

  it('inflates back to the input pixels', () => {
    const png = encodePng(image);
    const decoded = decodePng(png);
    expect([decoded.width, decoded.height]).toEqual([3, 2]);
    const idat = readChunks(png).find((chunk) => chunk.type === 'IDAT')!;
    const raw = inflateSync(idat.data);
    expect(raw.equals(scanlines(image))).toBe(true);
    const pixels = Buffer.concat([raw.subarray(1, 13), raw.subarray(14, 26)]);
    expect([...pixels]).toEqual([...image.rgba]);
  });
});

describe('app icon layout', () => {
  it('keeps every logo pixel of the maskable icon inside the safe zone', () => {
    const layout = APP_ICONS.find((candidate) => candidate.file === 'maskable-512.png')!;
    const rendered = renderAppIcon(layout);
    const background = parseColor(APP_ICON_BACKGROUND);
    const center = layout.size / 2;
    let painted = 0;
    for (let y = 0; y < rendered.height; y++) {
      for (let x = 0; x < rendered.width; x++) {
        const offset = (y * rendered.width + x) * 4;
        const isBackground = [0, 1, 2].every((channel) => rendered.rgba[offset + channel] === background[channel]);
        if (isBackground) continue;
        painted++;
        const distance = Math.hypot(x + 0.5 - center, y + 0.5 - center);
        expect(distance).toBeLessThanOrEqual(layout.size * MASKABLE_SAFE_RADIUS_FRACTION);
      }
    }
    expect(painted).toBeGreaterThan(0);
  });

  it('renders every icon at its declared size', () => {
    for (const layout of APP_ICONS) {
      const rendered = renderAppIcon(layout);
      expect([rendered.width, rendered.height]).toEqual([layout.size, layout.size]);
    }
  });
});
