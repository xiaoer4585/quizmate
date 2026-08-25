// 生成 icon.ico 与 AppX 图标资源 - Q 字图标
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

// 生成256x256的BMP数据（ICO格式包含BMP）
const size = 256;
const headerSize = 54;
const pixelDataSize = size * size * 4;
const totalSize = headerSize + pixelDataSize;

// BMP Header
const buffer = Buffer.alloc(6 + 16 + totalSize); // ICO header(6) + directory entry(16) + BMP data

// ICO Header
buffer.writeUInt16LE(0, 0); // Reserved
buffer.writeUInt16LE(1, 2); // Type: ICO
buffer.writeUInt16LE(1, 4); // Count: 1 image

// Directory Entry
buffer.writeUInt8(size === 256 ? 0 : size, 6); // Width (0 = 256)
buffer.writeUInt8(size === 256 ? 0 : size, 7); // Height
buffer.writeUInt8(0, 8); // Color palette
buffer.writeUInt8(0, 9); // Reserved
buffer.writeUInt16LE(1, 10); // Color planes
buffer.writeUInt16LE(32, 12); // Bits per pixel
buffer.writeUInt32LE(totalSize, 14); // Image data size
buffer.writeUInt32LE(6 + 16, 18); // Offset to image data

// BMP Info Header (starts at offset 22)
const bmpOffset = 22;
buffer.writeUInt32LE(40, bmpOffset); // Header size
buffer.writeInt32LE(size, bmpOffset + 4); // Width
buffer.writeInt32LE(size * 2, bmpOffset + 8); // Height (doubled for ICO: XOR + AND mask)
buffer.writeUInt16LE(1, bmpOffset + 12); // Color planes
buffer.writeUInt16LE(32, bmpOffset + 14); // Bits per pixel
buffer.writeUInt32LE(0, bmpOffset + 16); // Compression
buffer.writeUInt32LE(pixelDataSize, bmpOffset + 20); // Image size
buffer.writeInt32LE(0, bmpOffset + 24); // X pixels per meter
buffer.writeInt32LE(0, bmpOffset + 28); // Y pixels per meter
buffer.writeUInt32LE(0, bmpOffset + 32); // Colors in color table
buffer.writeUInt32LE(0, bmpOffset + 36); // Important colors

// Pixel data (BGRA, bottom-up)
const pixelOffset = bmpOffset + 40;
for (let y = size - 1; y >= 0; y--) {
  for (let x = 0; x < size; x++) {
    const i = ((size - 1 - y) * size + x) * 4 + pixelOffset;

    // 圆角矩形背景 #2268df
    const margin = 48;
    const inRect = x >= margin && x < size - margin && y >= margin && y < size - margin;
    const cornerDist = Math.min(
      Math.abs(x - margin), Math.abs(x - (size - margin - 1)),
      Math.abs(y - margin), Math.abs(y - (size - margin - 1))
    );

    let bgR = 0x22, bgG = 0x68, bgB = 0xdf, bgA = 0xff;

    // 简单圆角效果
    const dx = Math.max(margin - x, 0, x - (size - margin - 1));
    const dy = Math.max(margin - y, 0, y - (size - margin - 1));
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 48) {
      bgA = 0; // 透明
    }

    // Q字检测 (简化版: 中心区域+圆弧)
    const cx = size / 2, cy = size / 2;
    const dx2 = x - cx, dy2 = y - cy;
    const r = Math.sqrt(dx2 * dx2 + dy2 * dy2);
    // 外圆环 (Q的圆)
    const outerR = 75, innerR = 55;
    const inQRing = r >= innerR && r <= outerR && (x < cx + 20 || y > cy - 20);
    // Q的尾巴
    const inTail = x >= cx + 30 && x <= cx + 65 && y >= cy + 10 && y <= cy + 55;

    let isWhite = false;
    // 绘制 Q 字母
    if (inQRing || inTail) {
      isWhite = true;
    }
    // 内圆孔
    if (r < 45 && x < cx + 10) {
      isWhite = false;
    }

    if (isWhite) {
      buffer[i] = 0xff;     // B
      buffer[i + 1] = 0xff;  // G
      buffer[i + 2] = 0xff;  // R
      buffer[i + 3] = bgA;   // A
    } else {
      buffer[i] = bgB;       // B
      buffer[i + 1] = bgG;   // G
      buffer[i + 2] = bgR;   // R
      buffer[i + 3] = bgA;   // A
    }
  }
}

const outputPath = path.join(__dirname, 'icon.ico');
fs.writeFileSync(outputPath, buffer);
console.log('icon.ico generated:', outputPath, 'size:', buffer.length);

function sampleIconPixel(x, y, size) {
  const margin = Math.max(4, Math.round(size * 0.1875));
  const rectMax = size - margin - 1;
  const cx = size / 2;
  const cy = size / 2;
  const dx = Math.max(margin - x, 0, x - rectMax);
  const dy = Math.max(margin - y, 0, y - rectMax);
  const cornerRadius = Math.max(6, Math.round(size * 0.1875));
  const alpha = Math.sqrt(dx * dx + dy * dy) > cornerRadius ? 0 : 255;

  const dx2 = x - cx;
  const dy2 = y - cy;
  const radius = Math.sqrt(dx2 * dx2 + dy2 * dy2);
  const outerR = size * 0.293;
  const innerR = size * 0.215;
  const inQRing = radius >= innerR && radius <= outerR;
  const tailStartX = cx + size * 0.165;
  const tailStartY = cy + size * 0.145;
  const tailEndX = cx + size * 0.352;
  const tailEndY = cy + size * 0.332;
  const tailDx = tailEndX - tailStartX;
  const tailDy = tailEndY - tailStartY;
  const tailLenSq = tailDx * tailDx + tailDy * tailDy;
  const tailT = Math.max(0, Math.min(1, ((x - tailStartX) * tailDx + (y - tailStartY) * tailDy) / tailLenSq));
  const nearestX = tailStartX + tailT * tailDx;
  const nearestY = tailStartY + tailT * tailDy;
  const tailDistance = Math.sqrt((x - nearestX) ** 2 + (y - nearestY) ** 2);
  const inTail = tailDistance <= size * 0.05;
  const inHole = radius < size * 0.176;
  const isWhite = (inQRing || inTail) && !inHole;

  if (isWhite) return { r: 255, g: 255, b: 255, a: alpha };
  return { r: 34, g: 104, b: 223, a: alpha };
}

function writePng(filePath, width, height, draw) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = draw(x, y, width, height);
      const i = (width * y + x) << 2;
      png.data[i] = pixel.r;
      png.data[i + 1] = pixel.g;
      png.data[i + 2] = pixel.b;
      png.data[i + 3] = pixel.a;
    }
  }
  fs.writeFileSync(filePath, PNG.sync.write(png));
  console.log('png generated:', filePath, `${width}x${height}`);
}

function writeSquareLogo(filePath, size) {
  writePng(filePath, size, size, (x, y) => sampleIconPixel(x, y, size));
}

function writeWideLogo(filePath, width, height) {
  const iconSize = Math.round(height * 0.72);
  const iconX = Math.round(height * 0.18);
  const iconY = Math.round((height - iconSize) / 2);
  writePng(filePath, width, height, (x, y) => {
    if (x >= iconX && x < iconX + iconSize && y >= iconY && y < iconY + iconSize) {
      return sampleIconPixel(x - iconX, y - iconY, iconSize);
    }
    return { r: 34, g: 104, b: 223, a: 255 };
  });
}

const appxDir = path.join(__dirname, 'appx');
fs.mkdirSync(appxDir, { recursive: true });
writeSquareLogo(path.join(appxDir, 'StoreLogo.png'), 50);
writeSquareLogo(path.join(appxDir, 'Square44x44Logo.png'), 44);
writeSquareLogo(path.join(appxDir, 'Square150x150Logo.png'), 150);
writeWideLogo(path.join(appxDir, 'Wide310x150Logo.png'), 310, 150);
writeSquareLogo(path.join(appxDir, 'LargeTile.png'), 310);
writeSquareLogo(path.join(appxDir, 'SmallTile.png'), 71);
