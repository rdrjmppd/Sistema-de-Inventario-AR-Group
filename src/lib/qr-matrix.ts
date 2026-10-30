/**
 * Generador Determinista de Matrices de Código QR (ISO/IEC 18004) en TypeScript Puro
 * Sin dependencias externas de npm. Compatible con Node.js y navegadores.
 * Produce matrices 2D, SVG puros y Data URIs escaneables por cámaras móviles y WhatsApp Web.
 */

// Tablas de Reed-Solomon en campo de Galois GF(256) con polinomio primitivo 0x11d (285)
const GF256_EXP = new Uint8Array(512);
const GF256_LOG = new Uint8Array(256);

(function initGaloisField() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF256_EXP[i] = x;
    GF256_EXP[i + 255] = x;
    GF256_LOG[x] = i;
    x <<= 1;
    if (x & 256) x ^= 0x11d;
  }
})();

function gfMul(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return GF256_EXP[GF256_LOG[x] + GF256_LOG[y]];
}

function rsCompute(data: Uint8Array, ecCount: number): Uint8Array {
  // Generador polinomial para ecCount símbolos
  let gen = new Uint8Array([1]);
  for (let i = 0; i < ecCount; i++) {
    const next = new Uint8Array(gen.length + 1);
    const root = GF256_EXP[i];
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gfMul(gen[j], root);
      next[j + 1] ^= gen[j];
    }
    gen = next;
  }

  const remainder = new Uint8Array(ecCount);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ remainder[0];
    remainder.copyWithin(0, 1);
    remainder[ecCount - 1] = 0;
    for (let j = 0; j < ecCount; j++) {
      remainder[j] ^= gfMul(gen[j], factor);
    }
  }
  return remainder;
}

export interface QrVersionConfig {
  version: number;
  size: number;
  dataCapacityBytesM: number;
  ecBytes: number;
  alignmentPatternCenters: number[];
}

// Configuraciones para Versión 1 a 6 con Corrección de Error Nivel M (15% recuperación)
const QR_VERSIONS_M: QrVersionConfig[] = [
  { version: 1, size: 21, dataCapacityBytesM: 14, ecBytes: 10, alignmentPatternCenters: [] },
  { version: 2, size: 25, dataCapacityBytesM: 26, ecBytes: 16, alignmentPatternCenters: [6, 18] },
  { version: 3, size: 29, dataCapacityBytesM: 42, ecBytes: 26, alignmentPatternCenters: [6, 22] },
  { version: 4, size: 33, dataCapacityBytesM: 62, ecBytes: 36, alignmentPatternCenters: [6, 26] },
  { version: 5, size: 37, dataCapacityBytesM: 84, ecBytes: 48, alignmentPatternCenters: [6, 30] },
  { version: 6, size: 41, dataCapacityBytesM: 106, ecBytes: 64, alignmentPatternCenters: [6, 34] },
];

function chooseVersion(byteCount: number): QrVersionConfig {
  for (const v of QR_VERSIONS_M) {
    // 4 bits modo + 8 bits longitud = 1.5 bytes de cabecera
    if (byteCount + 2 <= v.dataCapacityBytesM) {
      return v;
    }
  }
  // Fallback a versión 6
  return QR_VERSIONS_M[QR_VERSIONS_M.length - 1];
}

/**
 * Genera la matriz booleana 2D de un código QR (ISO/IEC 18004, Nivel M, Byte Mode)
 */
export function generateQrMatrix(text: string): boolean[][] {
  const encoder = new TextEncoder();
  const rawBytes = encoder.encode(text);
  const cfg = chooseVersion(rawBytes.length);
  const size = cfg.size;

  // Matriz de módulos y matriz de máscara de funciones reservadas
  const matrix: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const isFunction: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  function setFunction(r: number, c: number, val: boolean) {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      matrix[r][c] = val;
      isFunction[r][c] = true;
    }
  }

  // 1. Patrones de Detección de Posición (Finder Patterns 7x7) en las 3 esquinas
  function drawFinderPattern(row: number, col: number) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const nr = row + r;
        const nc = col + c;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        const inOuter = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        const inInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
        setFunction(nr, nc, inOuter && (isBorder || inInner));
      }
    }
  }

  drawFinderPattern(0, 0);
  drawFinderPattern(0, size - 7);
  drawFinderPattern(size - 7, 0);

  // 2. Patrones de Alineación (Alignment Patterns 5x5) para versiones > 1
  if (cfg.alignmentPatternCenters.length > 0) {
    const centers = cfg.alignmentPatternCenters;
    for (const cr of centers) {
      for (const cc of centers) {
        // Excluir si colisiona con finders
        if ((cr === 6 && cc === 6) || (cr === 6 && cc === size - 7) || (cr === size - 7 && cc === 6)) {
          continue;
        }
        for (let r = -2; r <= 2; r++) {
          for (let c = -2; c <= 2; c++) {
            const isBlack = Math.max(Math.abs(r), Math.abs(c)) !== 1;
            setFunction(cr + r, cc + c, isBlack);
          }
        }
      }
    }
  }

  // 3. Patrones de Temporización (Timing Patterns)
  for (let i = 8; i < size - 8; i++) {
    const bit = i % 2 === 0;
    if (!isFunction[6][i]) setFunction(6, i, bit);
    if (!isFunction[i][6]) setFunction(i, 6, bit);
  }

  // 4. Módulo Oscuro (Dark Module)
  setFunction(size - 8, 8, true);

  // 5. Reserva de Áreas de Información de Formato (15 bits)
  for (let i = 0; i < 9; i++) {
    if (i !== 6) {
      setFunction(8, i, false);
      setFunction(i, 8, false);
    }
  }
  for (let i = size - 8; i < size; i++) {
    setFunction(8, i, false);
    setFunction(i, 8, false);
  }

  // 6. Ensamblado del Payload de Datos (Modo Byte: 0100 + longitud de 8 bits + bytes + relleno)
  const bitBuffer: number[] = [];
  function pushBits(val: number, len: number) {
    for (let i = len - 1; i >= 0; i--) {
      bitBuffer.push((val >> i) & 1);
    }
  }

  // Modo Byte = 0100 (4)
  pushBits(4, 4);
  // Conteo de caracteres (8 bits para versiones 1-9)
  pushBits(rawBytes.length, 8);
  for (let i = 0; i < rawBytes.length; i++) {
    pushBits(rawBytes[i], 8);
  }

  // Terminador de 4 bits (o hasta completar capacidad de datos)
  const maxDataBits = cfg.dataCapacityBytesM * 8;
  const termBits = Math.min(4, maxDataBits - bitBuffer.length);
  for (let i = 0; i < termBits; i++) bitBuffer.push(0);

  // Relleno a múltiplo de 8 bits
  while (bitBuffer.length % 8 !== 0) bitBuffer.push(0);

  // Bytes de relleno alternados 0xEC (236) y 0x11 (17)
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (bitBuffer.length < maxDataBits) {
    pushBits(padBytes[padIdx % 2], 8);
    padIdx++;
  }

  // Conversión de bitBuffer a bytes
  const dataBytes = new Uint8Array(cfg.dataCapacityBytesM);
  for (let i = 0; i < dataBytes.length; i++) {
    let b = 0;
    for (let j = 0; j < 8; j++) {
      b = (b << 1) | bitBuffer[i * 8 + j];
    }
    dataBytes[i] = b;
  }

  // 7. Corrección de Errores Reed-Solomon (Nivel M)
  const ecBytes = rsCompute(dataBytes, cfg.ecBytes);

  // Combinar data + ec
  const allCodewords = new Uint8Array(dataBytes.length + ecBytes.length);
  allCodewords.set(dataBytes, 0);
  allCodewords.set(ecBytes, dataBytes.length);

  // 8. Colocación de Codewords en la Matriz (Zig-Zag de 2 columnas de derecha a izquierda)
  let bitIdx = 0;
  const totalBits = allCodewords.length * 8;
  let upwards = true;

  for (let rightCol = size - 1; rightCol > 0; rightCol -= 2) {
    if (rightCol === 6) rightCol--; // Saltear la columna de temporización vertical

    const cols = [rightCol, rightCol - 1];
    const rowRange = upwards
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (const r of rowRange) {
      for (const c of cols) {
        if (!isFunction[r][c]) {
          let bit = false;
          if (bitIdx < totalBits) {
            const byteIndex = Math.floor(bitIdx / 8);
            const bitOffset = 7 - (bitIdx % 8);
            bit = ((allCodewords[byteIndex] >> bitOffset) & 1) === 1;
            bitIdx++;
          }
          // Aplicar Máscara 0: (row + col) % 2 === 0
          const mask = (r + c) % 2 === 0;
          matrix[r][c] = mask ? !bit : bit;
        }
      }
    }
    upwards = !upwards;
  }

  // 9. Escribir Información de Formato (Nivel M = 00 + Máscara 0 = 000 -> Formato 00000 con BCH y XOR 0x5412)
  // Constante de formato para M-0 con BCH: 101010000010010 (0x5412 XOR 0x0000 = 0x5412)
  const formatBits = [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0];

  // Escribir alrededor del Finder superior izquierdo
  for (let i = 0; i < 6; i++) matrix[8][i] = formatBits[i] === 1;
  matrix[8][7] = formatBits[6] === 1;
  matrix[8][8] = formatBits[7] === 1;
  matrix[7][8] = formatBits[8] === 1;
  for (let i = 9; i < 15; i++) matrix[14 - i][8] = formatBits[i] === 1;

  // Escribir en los otros dos Finders
  for (let i = 0; i < 7; i++) matrix[size - 1 - i][8] = formatBits[i] === 1;
  for (let i = 7; i < 15; i++) matrix[8][size - 15 + i] = formatBits[i] === 1;

  return matrix;
}

/**
 * Produce una cadena SVG limpia y determinista del código QR
 */
export function generateQrSvgString(
  text: string,
  options?: {
    size?: number;
    margin?: number;
    darkColor?: string;
    lightColor?: string;
  }
): string {
  const matrix = generateQrMatrix(text);
  const matrixSize = matrix.length;
  const margin = options?.margin ?? 4;
  const viewSize = matrixSize + margin * 2;
  const sizePx = options?.size ?? 240;
  const dark = options?.darkColor ?? '#0f172a'; // slate-900
  const light = options?.lightColor ?? '#ffffff';

  let rects = '';
  for (let r = 0; r < matrixSize; r++) {
    for (let c = 0; c < matrixSize; c++) {
      if (matrix[r][c]) {
        rects += `<rect x="${c + margin}" y="${r + margin}" width="1" height="1" fill="${dark}" />`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewSize} ${viewSize}" width="${sizePx}" height="${sizePx}" shape-rendering="crispEdges">
  <rect width="${viewSize}" height="${viewSize}" fill="${light}" />
  ${rects}
</svg>`;
}

/**
 * Retorna un Data URI en formato SVG para insertar directamente en <img src={...} />
 */
export function generateQrDataUri(
  text: string,
  options?: {
    size?: number;
    margin?: number;
    darkColor?: string;
    lightColor?: string;
  }
): string {
  const svg = generateQrSvgString(text, options);
  const base64 = typeof Buffer !== 'undefined'
    ? Buffer.from(svg).toString('base64')
    : btoa(unescape(encodeURIComponent(svg)));
  return `data:image/svg+xml;base64,${base64}`;
}
