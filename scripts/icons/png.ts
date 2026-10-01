import { crc32, deflateSync, inflateSync } from 'node:zlib';

export const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const BIT_DEPTH = 8;
const COLOR_TYPE_RGBA = 6;
const BYTES_PER_PIXEL = 4;
const FILTER_NONE = 0;

export interface RgbaImage {
  width: number;
  height: number;
  rgba: Uint8Array;
}

export interface PngChunk {
  type: string;
  data: Buffer;
  crc: number;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

export function scanlines(image: RgbaImage): Buffer {
  const stride = image.width * BYTES_PER_PIXEL;
  const raw = Buffer.alloc((stride + 1) * image.height);
  for (let row = 0; row < image.height; row++) {
    raw[row * (stride + 1)] = FILTER_NONE;
    raw.set(image.rgba.subarray(row * stride, (row + 1) * stride), row * (stride + 1) + 1);
  }
  return raw;
}

function header(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(BIT_DEPTH, 8);
  ihdr.writeUInt8(COLOR_TYPE_RGBA, 9);
  return ihdr;
}

export function encodePng(image: RgbaImage): Buffer {
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', header(image.width, image.height)),
    chunk('IDAT', deflateSync(scanlines(image), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function readChunks(png: Buffer): PngChunk[] {
  if (!png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) throw new Error('Not a PNG file');
  const chunks: PngChunk[] = [];
  let offset = PNG_SIGNATURE.length;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    chunks.push({ type, data, crc: png.readUInt32BE(offset + 8 + length) });
    offset += 12 + length;
  }
  return chunks;
}

export interface DecodedPng {
  ihdr: Buffer;
  width: number;
  height: number;
  scanlines: Buffer;
}

export function decodePng(png: Buffer): DecodedPng {
  const chunks = readChunks(png);
  const ihdr = chunks.find((candidate) => candidate.type === 'IHDR');
  if (!ihdr) throw new Error('PNG has no IHDR chunk');
  const idat = Buffer.concat(chunks.filter((candidate) => candidate.type === 'IDAT').map((found) => found.data));
  return {
    ihdr: ihdr.data,
    width: ihdr.data.readUInt32BE(0),
    height: ihdr.data.readUInt32BE(4),
    scanlines: inflateSync(idat),
  };
}

export function samePixels(png: Buffer, image: RgbaImage): boolean {
  const decoded = decodePng(png);
  return decoded.ihdr.equals(header(image.width, image.height)) && decoded.scanlines.equals(scanlines(image));
}
