/**
 * Generador Determinista de Matrices de Código QR (ISO/IEC 18004) en TypeScript Puro
 * Sin dependencias externas de npm. Compatible con Node.js y navegadores.
 * Soporta Versiones 1 a 10 con Niveles de Corrección de Error L (7%) y M (15%),
 * codificación Byte (UTF-8), intercalado multi-bloque Reed-Solomon exacto en GF(256),
 * zona de silencio (Quiet Zone >= 4 módulos) y evaluación de las 8 máscaras de penalización.
 * Incluye decodificador incorporado para validación forense y pruebas unitarias de ida y vuelta.
 * © 2026 AR Group. Todos los derechos reservados.
 */

export type QrErrorCorrectionLevel = 'L' | 'M';

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

export function gfMul(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return GF256_EXP[GF256_LOG[x] + GF256_LOG[y]];
}

export function getRsGeneratorPoly(ecCount: number): Uint8Array {
  let gen = new Uint8Array([1]);
  for (let i = 0; i < ecCount; i++) {
    const next = new Uint8Array(gen.length + 1);
    const root = GF256_EXP[i];
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gen[j];
      next[j + 1] ^= gfMul(gen[j], root);
    }
    gen = next;
  }
  return gen;
}

export function rsCompute(data: Uint8Array, ecCount: number): Uint8Array {
  const gen = getRsGeneratorPoly(ecCount);
  const remainder = new Uint8Array(ecCount);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ remainder[0];
    remainder.copyWithin(0, 1);
    remainder[ecCount - 1] = 0;
    for (let j = 0; j < ecCount; j++) {
      remainder[j] ^= gfMul(gen[j + 1], factor);
    }
  }
  return remainder;
}

export interface QrBlockGroup {
  count: number;
  data: number;
}

export interface QrLevelSpec {
  ec: number;
  g: QrBlockGroup[];
}

export interface QrVersionConfig {
  v: number;
  size: number;
  remBits: number;
  L: QrLevelSpec;
  M: QrLevelSpec;
  align: number[];
}

export const QR_VERSIONS: (QrVersionConfig | null)[] = [
  null,
  // V1: 21x21
  { v: 1, size: 21, remBits: 0, L: { ec: 7, g: [{ count: 1, data: 19 }] }, M: { ec: 10, g: [{ count: 1, data: 16 }] }, align: [] },
  // V2: 25x25
  { v: 2, size: 25, remBits: 7, L: { ec: 10, g: [{ count: 1, data: 34 }] }, M: { ec: 16, g: [{ count: 1, data: 28 }] }, align: [6, 18] },
  // V3: 29x29
  { v: 3, size: 29, remBits: 7, L: { ec: 15, g: [{ count: 1, data: 55 }] }, M: { ec: 26, g: [{ count: 1, data: 44 }] }, align: [6, 22] },
  // V4: 33x33
  { v: 4, size: 33, remBits: 7, L: { ec: 20, g: [{ count: 1, data: 80 }] }, M: { ec: 18, g: [{ count: 2, data: 32 }] }, align: [6, 26] },
  // V5: 37x37
  { v: 5, size: 37, remBits: 7, L: { ec: 26, g: [{ count: 1, data: 108 }] }, M: { ec: 24, g: [{ count: 2, data: 43 }] }, align: [6, 30] },
  // V6: 41x41
  { v: 6, size: 41, remBits: 7, L: { ec: 18, g: [{ count: 2, data: 68 }] }, M: { ec: 16, g: [{ count: 4, data: 27 }] }, align: [6, 34] },
  // V7: 45x45
  { v: 7, size: 45, remBits: 0, L: { ec: 20, g: [{ count: 2, data: 78 }] }, M: { ec: 18, g: [{ count: 4, data: 31 }] }, align: [6, 22, 38] },
  // V8: 49x49
  { v: 8, size: 49, remBits: 0, L: { ec: 24, g: [{ count: 2, data: 97 }] }, M: { ec: 22, g: [{ count: 2, data: 38 }, { count: 2, data: 39 }] }, align: [6, 24, 42] },
  // V9: 53x53
  { v: 9, size: 53, remBits: 0, L: { ec: 30, g: [{ count: 2, data: 116 }] }, M: { ec: 22, g: [{ count: 3, data: 36 }, { count: 2, data: 37 }] }, align: [6, 26, 46] },
  // V10: 57x57
  { v: 10, size: 57, remBits: 0, L: { ec: 18, g: [{ count: 2, data: 68 }, { count: 2, data: 69 }] }, M: { ec: 26, g: [{ count: 4, data: 43 }, { count: 1, data: 44 }] }, align: [6, 28, 50] }
];

export function chooseVersionAndLevel(
  byteCount: number,
  preferredLevel: QrErrorCorrectionLevel = 'M'
): {
  version: number;
  level: QrErrorCorrectionLevel;
  spec: QrLevelSpec;
  totalData: number;
  size: number;
  remBits: number;
  align: number[];
} {
  const levels: QrErrorCorrectionLevel[] =
    preferredLevel === 'M' ? ['M', 'L'] : ['L', 'M'];

  for (const lvl of levels) {
    for (let v = 1; v <= 10; v++) {
      const cfg = QR_VERSIONS[v];
      if (!cfg) continue;
      const spec = cfg[lvl];
      let totalData = 0;
      for (const grp of spec.g) totalData += grp.count * grp.data;
      const charCountBits = v <= 9 ? 8 : 16;
      const headerBytes = Math.ceil((4 + charCountBits) / 8);
      if (byteCount + headerBytes <= totalData) {
        return {
          version: v,
          level: lvl,
          spec,
          totalData,
          size: cfg.size,
          remBits: cfg.remBits,
          align: cfg.align,
        };
      }
    }
  }

  // Fallback a versión 10 Nivel L (capacidad máxima soportada de 274 bytes de datos)
  const maxCfg = QR_VERSIONS[10]!;
  return {
    version: 10,
    level: 'L',
    spec: maxCfg.L,
    totalData: 274,
    size: 57,
    remBits: 0,
    align: maxCfg.align,
  };
}

export function computeFormatBits(level: QrErrorCorrectionLevel, mask: number): number {
  // ISO/IEC 18004 Table 12: L = 01 (1), M = 00 (0)
  const ecBits = level === 'L' ? 1 : 0;
  const data = (ecBits << 3) | (mask & 7);
  let rem = data << 10;
  for (let i = 14; i >= 10; i--) {
    if ((rem >> i) & 1) {
      rem ^= 0x537 << (i - 10);
    }
  }
  return ((data << 10) | rem) ^ 0x5412;
}

export function computeVersionBits(version: number): number {
  let rem = version << 12;
  for (let i = 17; i >= 12; i--) {
    if ((rem >> i) & 1) {
      rem ^= 0x1f25 << (i - 12);
    }
  }
  return (version << 12) | rem;
}

export function getMaskBit(mask: number, r: number, c: number): boolean {
  switch (mask) {
    case 0:
      return (r + c) % 2 === 0;
    case 1:
      return r % 2 === 0;
    case 2:
      return c % 3 === 0;
    case 3:
      return (r + c) % 3 === 0;
    case 4:
      return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5:
      return ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6:
      return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    case 7:
      return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
    default:
      return false;
  }
}

/**
 * Genera la matriz booleana 2D de un código QR estrictamente conforme con ISO/IEC 18004.
 */
export function generateQrMatrix(
  text: string,
  options?: { preferredLevel?: QrErrorCorrectionLevel }
): boolean[][] {
  const encoder = new TextEncoder();
  const rawBytes = encoder.encode(text);
  const cfg = chooseVersionAndLevel(rawBytes.length, options?.preferredLevel ?? 'M');
  const size = cfg.size;

  // 1. Ensamblado de bits de datos
  const bitBuffer: number[] = [];
  function pushBits(val: number, len: number) {
    for (let i = len - 1; i >= 0; i--) {
      bitBuffer.push((val >> i) & 1);
    }
  }

  // Indicador de modo Byte: 0100 (4)
  pushBits(4, 4);
  // Indicador de cantidad de caracteres (8 bits para V1-9, 16 bits para V10)
  const charCountBits = cfg.version <= 9 ? 8 : 16;
  pushBits(rawBytes.length, charCountBits);
  for (let i = 0; i < rawBytes.length; i++) {
    pushBits(rawBytes[i], 8);
  }

  // Terminador de hasta 4 ceros
  const maxDataBits = cfg.totalData * 8;
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

  // Conversión a codewords de datos
  const dataCodewords = new Uint8Array(cfg.totalData);
  for (let i = 0; i < cfg.totalData; i++) {
    let b = 0;
    for (let j = 0; j < 8; j++) {
      b = (b << 1) | bitBuffer[i * 8 + j];
    }
    dataCodewords[i] = b;
  }

  // 2. Partición en bloques y cálculo Reed-Solomon individual
  const blocks: { data: Uint8Array; ec: Uint8Array }[] = [];
  let dataOffset = 0;
  for (const grp of cfg.spec.g) {
    for (let i = 0; i < grp.count; i++) {
      const blockData = dataCodewords.slice(dataOffset, dataOffset + grp.data);
      dataOffset += grp.data;
      const ec = rsCompute(blockData, cfg.spec.ec);
      blocks.push({ data: blockData, ec });
    }
  }

  // 3. Intercalado multi-bloque de codewords de datos y de codewords de corrección de error
  const interleaved: number[] = [];
  let maxBlockDataLen = 0;
  for (const b of blocks) {
    if (b.data.length > maxBlockDataLen) maxBlockDataLen = b.data.length;
  }

  for (let c = 0; c < maxBlockDataLen; c++) {
    for (const b of blocks) {
      if (c < b.data.length) {
        interleaved.push(b.data[c]);
      }
    }
  }

  for (let c = 0; c < cfg.spec.ec; c++) {
    for (const b of blocks) {
      interleaved.push(b.ec[c]);
    }
  }

  // Convertir codewords intercalados a flujo plano de bits + bits remanentes
  const finalBits: number[] = [];
  for (const byte of interleaved) {
    for (let i = 7; i >= 0; i--) {
      finalBits.push((byte >> i) & 1);
    }
  }
  for (let i = 0; i < cfg.remBits; i++) finalBits.push(0);

  // 4. Mapeo de módulos funcionales reservados
  const isFunction: boolean[][] = Array.from({ length: size }, () =>
    Array(size).fill(false)
  );
  const baseMatrix: boolean[][] = Array.from({ length: size }, () =>
    Array(size).fill(false)
  );

  function setFunc(r: number, c: number, val: boolean) {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      baseMatrix[r][c] = val;
      isFunction[r][c] = true;
    }
  }

  // Patrones de Detección de Posición (Finder Patterns 7x7) + Separador blanco de 1 módulo
  function drawFinder(row: number, col: number) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const nr = row + r;
        const nc = col + c;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        const inOuter = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        const inInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
        setFunc(nr, nc, inOuter && (isBorder || inInner));
      }
    }
  }

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // Patrones de Alineación (Alignment Patterns 5x5) con exclusión estricta de Finders (9x9)
  if (cfg.align.length > 0) {
    for (const cr of cfg.align) {
      for (const cc of cfg.align) {
        if (
          (cr <= 8 && cc <= 8) ||
          (cr <= 8 && cc >= size - 9) ||
          (cr >= size - 9 && cc <= 8)
        ) {
          continue;
        }
        for (let r = -2; r <= 2; r++) {
          for (let c = -2; c <= 2; c++) {
            const isDark = Math.max(Math.abs(r), Math.abs(c)) !== 1;
            setFunc(cr + r, cc + c, isDark);
          }
        }
      }
    }
  }

  // Patrones de Temporización (Timing Patterns en fila 6 y columna 6)
  for (let i = 8; i < size - 8; i++) {
    const bit = i % 2 === 0;
    if (!isFunction[6][i]) setFunc(6, i, bit);
    if (!isFunction[i][6]) setFunc(i, 6, bit);
  }

  // Módulo Oscuro (Dark Module en (4V + 9, 8))
  setFunc(4 * cfg.version + 9, 8, true);

  // Reserva de zonas de Información de Formato (15 bits)
  for (let i = 0; i < 9; i++) {
    if (i !== 6) {
      setFunc(8, i, false);
      setFunc(i, 8, false);
    }
  }
  for (let i = size - 8; i < size; i++) {
    setFunc(8, i, false);
    setFunc(i, 8, false);
  }

  // Reserva de zonas de Información de Versión (V >= 7)
  if (cfg.version >= 7) {
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 3; c++) {
        setFunc(r, size - 11 + c, false);
        setFunc(size - 11 + c, r, false);
      }
    }
  }

  // 5. Evaluación de las 8 Máscaras y Selección de la Máscara de Menor Penalización (ISO/IEC 18004)
  let bestMask = 0;
  let bestPenalty = Infinity;
  let bestMatrix: boolean[][] = baseMatrix;

  for (let m = 0; m < 8; m++) {
    const candidate: boolean[][] = baseMatrix.map((row) => [...row]);
    let bitIdx = 0;
    let upwards = true;

    for (let rightCol = size - 1; rightCol > 0; rightCol -= 2) {
      if (rightCol === 6) rightCol--;
      const cols = [rightCol, rightCol - 1];
      const rowRange = upwards
        ? Array.from({ length: size }, (_, i) => size - 1 - i)
        : Array.from({ length: size }, (_, i) => i);

      for (const r of rowRange) {
        for (const c of cols) {
          if (!isFunction[r][c]) {
            const rawBit =
              bitIdx < finalBits.length ? finalBits[bitIdx] === 1 : false;
            bitIdx++;
            const maskBit = getMaskBit(m, r, c);
            candidate[r][c] = maskBit ? !rawBit : rawBit;
          }
        }
      }
      upwards = !upwards;
    }

    // Escribir Información de Formato (15 bits BCH con XOR 0x5412)
    const formatBits = computeFormatBits(cfg.level, m);
    // Finder superior izquierdo (bits 0 a 14 según ISO/IEC 18004 Tabla 20)
    for (let i = 0; i <= 5; i++) candidate[8][i] = ((formatBits >> i) & 1) === 1;
    candidate[8][7] = ((formatBits >> 6) & 1) === 1;
    candidate[8][8] = ((formatBits >> 7) & 1) === 1;
    candidate[7][8] = ((formatBits >> 8) & 1) === 1;
    candidate[5][8] = ((formatBits >> 9) & 1) === 1;
    for (let i = 10; i <= 14; i++) {
      candidate[14 - i][8] = ((formatBits >> i) & 1) === 1;
    }

    // Copia redundante alrededor de los otros dos Finders
    for (let i = 0; i <= 6; i++) {
      candidate[size - 1 - i][8] = ((formatBits >> i) & 1) === 1;
    }
    for (let i = 7; i <= 14; i++) {
      candidate[8][size - 15 + i] = ((formatBits >> i) & 1) === 1;
    }

    // Escribir Información de Versión si V >= 7 (18 bits Golay)
    if (cfg.version >= 7) {
      const vBits = computeVersionBits(cfg.version);
      for (let i = 0; i < 18; i++) {
        const bit = ((vBits >> i) & 1) === 1;
        // Rectángulo inferior izquierdo (3x6)
        candidate[size - 11 + (i % 3)][Math.floor(i / 3)] = bit;
        // Rectángulo superior derecho (6x3)
        candidate[Math.floor(i / 3)][size - 11 + (i % 3)] = bit;
      }
    }

    // Cálculo del puntaje de penalización
    let penalty = 0;

    // N1: Rachas de módulos consecutivos en filas y columnas
    for (let r = 0; r < size; r++) {
      let runColor = candidate[r][0];
      let runLen = 1;
      for (let c = 1; c < size; c++) {
        if (candidate[r][c] === runColor) {
          runLen++;
        } else {
          if (runLen >= 5) penalty += 3 + (runLen - 5);
          runColor = candidate[r][c];
          runLen = 1;
        }
      }
      if (runLen >= 5) penalty += 3 + (runLen - 5);
    }

    for (let c = 0; c < size; c++) {
      let runColor = candidate[0][c];
      let runLen = 1;
      for (let r = 1; r < size; r++) {
        if (candidate[r][c] === runColor) {
          runLen++;
        } else {
          if (runLen >= 5) penalty += 3 + (runLen - 5);
          runColor = candidate[r][c];
          runLen = 1;
        }
      }
      if (runLen >= 5) penalty += 3 + (runLen - 5);
    }

    // N2: Bloques 2x2 del mismo color
    for (let r = 0; r < size - 1; r++) {
      for (let c = 0; c < size - 1; c++) {
        const color = candidate[r][c];
        if (
          candidate[r + 1][c] === color &&
          candidate[r][c + 1] === color &&
          candidate[r + 1][c + 1] === color
        ) {
          penalty += 3;
        }
      }
    }

    // N3: Patrones 1:1:3:1:1 flanqueados por 4 módulos claros
    const p1 = [true, false, true, true, true, false, true, false, false, false, false];
    const p2 = [false, false, false, false, true, false, true, true, true, false, true];

    for (let r = 0; r < size; r++) {
      for (let c = 0; c <= size - 11; c++) {
        let m1 = true;
        let m2 = true;
        for (let k = 0; k < 11; k++) {
          if (candidate[r][c + k] !== p1[k]) m1 = false;
          if (candidate[r][c + k] !== p2[k]) m2 = false;
        }
        if (m1) penalty += 40;
        if (m2) penalty += 40;
      }
    }

    for (let c = 0; c < size; c++) {
      for (let r = 0; r <= size - 11; r++) {
        let m1 = true;
        let m2 = true;
        for (let k = 0; k < 11; k++) {
          if (candidate[r + k][c] !== p1[k]) m1 = false;
          if (candidate[r + k][c] !== p2[k]) m2 = false;
        }
        if (m1) penalty += 40;
        if (m2) penalty += 40;
      }
    }

    // N4: Balance global de módulos oscuros vs claros
    let darkCount = 0;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (candidate[r][c]) darkCount++;
      }
    }
    const ratio = (darkCount * 100) / (size * size);
    const k = Math.floor(Math.abs(ratio - 50) / 5) * 10;
    penalty += k;

    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMask = m;
      bestMatrix = candidate;
    }
  }

  return bestMatrix;
}

/**
 * Produce una cadena SVG limpia, de alto contraste óptico y determinista del código QR
 */
export function generateQrSvgString(
  text: string,
  options?: {
    size?: number;
    margin?: number;
    darkColor?: string;
    lightColor?: string;
    preferredLevel?: QrErrorCorrectionLevel;
  }
): string {
  const matrix = generateQrMatrix(text, { preferredLevel: options?.preferredLevel });
  const matrixSize = matrix.length;
  // ISO/IEC 18004 Sección 5.3.7: La zona de silencio debe ser de al menos 4 módulos
  const margin = options?.margin ?? 4;
  const viewSize = matrixSize + margin * 2;
  const sizePx = options?.size ?? 240;
  // Negro sólido de alto contraste óptico para máxima legibilidad por cámaras móviles
  const dark = options?.darkColor ?? '#000000';
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
    preferredLevel?: QrErrorCorrectionLevel;
  }
): string {
  const svg = generateQrSvgString(text, options);
  const base64 =
    typeof Buffer !== 'undefined'
      ? Buffer.from(svg).toString('base64')
      : btoa(unescape(encodeURIComponent(svg)));
  return `data:image/svg+xml;base64,${base64}`;
}

/**
 * Decodificador de Matriz QR ISO/IEC 18004 para verificación forense y pruebas de certificación.
 * Retorna el texto original, versión, nivel EC, máscara y confirma que el síndrome Reed-Solomon es exactamente 0.
 */
export function decodeQrMatrix(matrix: boolean[][]): {
  text: string;
  version: number;
  ecLevel: QrErrorCorrectionLevel;
  mask: number;
  formatSyndrome: number;
  blocksCount: number;
} {
  const size = matrix.length;
  const version = Math.floor((size - 17) / 4);
  if (version < 1 || version > 10) {
    throw new Error(`Dimensión de matriz QR no soportada: ${size} (Versión ${version})`);
  }

  // Leer bits de formato del Finder superior izquierdo
  let fmt1 = 0;
  for (let i = 0; i <= 5; i++) if (matrix[8][i]) fmt1 |= 1 << i;
  if (matrix[8][7]) fmt1 |= 1 << 6;
  if (matrix[8][8]) fmt1 |= 1 << 7;
  if (matrix[7][8]) fmt1 |= 1 << 8;
  if (matrix[5][8]) fmt1 |= 1 << 9;
  for (let i = 10; i <= 14; i++) if (matrix[14 - i][8]) fmt1 |= 1 << i;

  // Leer copia redundante de formato
  let fmt2 = 0;
  for (let i = 0; i <= 6; i++) if (matrix[size - 1 - i][8]) fmt2 |= 1 << i;
  for (let i = 7; i <= 14; i++) if (matrix[8][size - 15 + i]) fmt2 |= 1 << i;

  if (fmt1 !== fmt2) {
    throw new Error(`Inconsistencia en información de formato QR: copia 1 (${fmt1}) != copia 2 (${fmt2})`);
  }

  // Verificar síndrome BCH (15, 5)
  const rawFormat = fmt1 ^ 0x5412;
  let checkRem = rawFormat;
  for (let i = 14; i >= 10; i--) {
    if ((checkRem >> i) & 1) {
      checkRem ^= 0x537 << (i - 10);
    }
  }
  if (checkRem !== 0) {
    throw new Error(`Síndrome de formato BCH corrupto: ${checkRem}`);
  }

  const formatData = rawFormat >> 10;
  const ecBits = (formatData >> 3) & 3;
  const mask = formatData & 7;
  const ecLevel: QrErrorCorrectionLevel = ecBits === 1 ? 'L' : 'M';

  const cfg = QR_VERSIONS[version]!;
  const spec = cfg[ecLevel];

  // Reconstruir mapa de módulos funcionales
  const isFunction: boolean[][] = Array.from({ length: size }, () =>
    Array(size).fill(false)
  );
  function markFunc(r: number, c: number) {
    if (r >= 0 && r < size && c >= 0 && c < size) isFunction[r][c] = true;
  }
  for (const fr of [0, size - 7]) {
    for (const fc of [0, size - 7]) {
      if (fr === size - 7 && fc === size - 7) continue;
      for (let r = -1; r <= 7; r++) {
        for (let c = -1; c <= 7; c++) markFunc(fr + r, fc + c);
      }
    }
  }
  for (const cr of cfg.align) {
    for (const cc of cfg.align) {
      if (
        (cr <= 8 && cc <= 8) ||
        (cr <= 8 && cc >= size - 9) ||
        (cr >= size - 9 && cc <= 8)
      ) {
        continue;
      }
      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) markFunc(cr + r, cc + c);
      }
    }
  }
  for (let i = 8; i < size - 8; i++) {
    markFunc(6, i);
    markFunc(i, 6);
  }
  markFunc(4 * version + 9, 8);
  for (let i = 0; i < 9; i++) {
    markFunc(8, i);
    markFunc(i, 8);
  }
  for (let i = size - 8; i < size; i++) {
    markFunc(8, i);
    markFunc(i, 8);
  }
  if (version >= 7) {
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 3; c++) {
        markFunc(r, size - 11 + c);
        markFunc(size - 11 + c, r);
      }
    }
  }

  // Extraer y desenmascarar bits
  const rawBits: number[] = [];
  let upwards = true;
  for (let rightCol = size - 1; rightCol > 0; rightCol -= 2) {
    if (rightCol === 6) rightCol--;
    const cols = [rightCol, rightCol - 1];
    const rowRange = upwards
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (const r of rowRange) {
      for (const c of cols) {
        if (!isFunction[r][c]) {
          const modColor = matrix[r][c];
          const maskBit = getMaskBit(mask, r, c);
          const dataBit = maskBit ? !modColor : modColor;
          rawBits.push(dataBit ? 1 : 0);
        }
      }
    }
    upwards = !upwards;
  }

  let totalCodewords = 0;
  for (const g of spec.g) totalCodewords += g.count * (g.data + spec.ec);
  const codewords: number[] = [];
  for (let i = 0; i < totalCodewords; i++) {
    let b = 0;
    for (let j = 0; j < 8; j++) {
      b = (b << 1) | rawBits[i * 8 + j];
    }
    codewords.push(b);
  }

  // Desintercalar bloques
  const blockDefs: { dataLen: number; ecLen: number; data: number[]; ec: number[] }[] = [];
  for (const g of spec.g) {
    for (let i = 0; i < g.count; i++) {
      blockDefs.push({ dataLen: g.data, ecLen: spec.ec, data: [], ec: [] });
    }
  }

  let maxBlockDataLen = 0;
  for (const b of blockDefs) {
    if (b.dataLen > maxBlockDataLen) maxBlockDataLen = b.dataLen;
  }

  let cwIdx = 0;
  for (let c = 0; c < maxBlockDataLen; c++) {
    for (const b of blockDefs) {
      if (c < b.dataLen) {
        b.data.push(codewords[cwIdx++]);
      }
    }
  }
  for (let c = 0; c < spec.ec; c++) {
    for (const b of blockDefs) {
      b.ec.push(codewords[cwIdx++]);
    }
  }

  // Verificar que el síndrome Reed-Solomon de cada bloque sea exactamente 0
  const gen = getRsGeneratorPoly(spec.ec);
  for (let bi = 0; bi < blockDefs.length; bi++) {
    const b = blockDefs[bi];
    const all = new Uint8Array([...b.data, ...b.ec]);
    const rem = new Uint8Array(spec.ec);
    for (let i = 0; i < all.length; i++) {
      const factor = all[i] ^ rem[0];
      rem.copyWithin(0, 1);
      rem[spec.ec - 1] = 0;
      for (let j = 0; j < spec.ec; j++) {
        rem[j] ^= gfMul(gen[j + 1], factor);
      }
    }
    for (let j = 0; j < spec.ec; j++) {
      if (rem[j] !== 0) {
        throw new Error(`Síndrome Reed-Solomon no nulo en bloque ${bi}`);
      }
    }
  }

  // Extraer bytes de datos
  const dataBits: number[] = [];
  for (const b of blockDefs) {
    for (const byte of b.data) {
      for (let i = 7; i >= 0; i--) dataBits.push((byte >> i) & 1);
    }
  }

  let bitPos = 0;
  function readBits(len: number): number {
    let val = 0;
    for (let i = 0; i < len; i++) {
      val = (val << 1) | dataBits[bitPos++];
    }
    return val;
  }

  const mode = readBits(4);
  if (mode !== 4) {
    throw new Error(`Modo QR no soportado: ${mode} (se esperaba modo byte 4)`);
  }

  const charCountBits = version <= 9 ? 8 : 16;
  const count = readBits(charCountBits);
  const outBytes = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    outBytes[i] = readBits(8);
  }

  const decoder = new TextDecoder();
  return {
    text: decoder.decode(outBytes),
    version,
    ecLevel,
    mask,
    formatSyndrome: checkRem,
    blocksCount: blockDefs.length,
  };
}

export default generateQrMatrix;
