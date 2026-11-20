import { deflateSync } from 'node:zlib';

const FONT = {
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111],
  '3': [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '5': [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  '6': [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  '9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100],
};

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  CRC_TABLE[i] = c;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  let c = 0 ^ (-1);
  const full = Buffer.concat([t, data]);
  for (let i = 0; i < full.length; i++) {
    c = (c >>> 8) ^ CRC_TABLE[(c ^ full[i]) & 0xff];
  }
  c = (c ^ (-1)) >>> 0;
  crc.writeUInt32BE(c, 0);
  return Buffer.concat([len, t, data, crc]);
}

/**
 * Generate a 100x36 base64 PNG captcha
 */
export function generateCaptcha(customCode) {
  const code = customCode || Math.floor(1000 + Math.random() * 9000).toString();
  const width = 100;
  const height = 36;
  const rowSize = 1 + width * 3;
  const raw = Buffer.alloc(height * rowSize);

  // Background gradient: light blue-grey
  for (let y = 0; y < height; y++) {
    raw[y * rowSize] = 0; // Filter byte: None
    for (let x = 0; x < width; x++) {
      const idx = y * rowSize + 1 + x * 3;
      raw[idx] = 238 + Math.floor((x / width) * 10);     // R: ~238-248
      raw[idx + 1] = 242 + Math.floor((y / height) * 8); // G: ~242-250
      raw[idx + 2] = 248;                                // B: 248
    }
  }

  // Draw 4 digits (scale 3x, 5x7 matrix -> 15x21 px)
  const colors = [
    [30, 60, 150],  // Dark blue
    [160, 30, 60],  // Wine red
    [20, 110, 80],  // Deep emerald
    [110, 40, 130]  // Violet
  ];

  const startX = 9;
  const startY = 7;
  const scale = 3;
  const spacing = 22;

  for (let d = 0; d < 4; d++) {
    const char = code[d] || '0';
    const glyph = FONT[char] || FONT['0'];
    const [cr, cg, cb] = colors[d % colors.length];
    const digitLeft = startX + d * spacing;

    for (let gy = 0; gy < 7; gy++) {
      const rowBits = glyph[gy];
      for (let gx = 0; gx < 5; gx++) {
        if ((rowBits >> (4 - gx)) & 1) {
          // Fill scaled pixel block
          for (let sy = 0; sy < scale; sy++) {
            const py = startY + gy * scale + sy;
            if (py >= height) continue;
            for (let sx = 0; sx < scale; sx++) {
              const px = digitLeft + gx * scale + sx;
              if (px >= width) continue;
              const idx = py * rowSize + 1 + px * 3;
              raw[idx] = cr;
              raw[idx + 1] = cg;
              raw[idx + 2] = cb;
            }
          }
        }
      }
    }
  }

  // Add subtle decorative noise line
  for (let x = 4; x < width - 4; x++) {
    const y = Math.floor(18 + Math.sin(x * 0.1) * 8);
    if (y >= 0 && y < height) {
      const idx = y * rowSize + 1 + x * 3;
      raw[idx] = Math.floor(raw[idx] * 0.75);
      raw[idx + 1] = Math.floor(raw[idx + 1] * 0.75);
      raw[idx + 2] = Math.floor(raw[idx + 2] * 0.75);
    }
  }

  const idat = deflateSync(raw);
  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit depth
  ihdr[9] = 2; // RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const pngBuffer = Buffer.concat([
    header,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0))
  ]);

  return {
    code,
    base64: pngBuffer.toString('base64')
  };
}
