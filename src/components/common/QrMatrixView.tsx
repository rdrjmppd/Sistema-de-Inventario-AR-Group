import React, { useMemo } from 'react';
import { generateQrMatrix } from '../../lib/qr-matrix';

export interface QrMatrixViewProps {
  value: string;
  size?: number;
  margin?: number;
  darkColor?: string;
  lightColor?: string;
  className?: string;
  alt?: string;
}

export const QrMatrixView: React.FC<QrMatrixViewProps> = ({
  value,
  size = 220,
  margin = 3,
  darkColor = '#090d16',
  lightColor = '#ffffff',
  className = '',
  alt = 'Código QR de Vinculación WhatsApp Web',
}) => {
  const { matrix, viewSize } = useMemo(() => {
    if (!value) return { matrix: [], viewSize: 0 };
    try {
      const m = generateQrMatrix(value);
      return { matrix: m, viewSize: m.length + margin * 2 };
    } catch (err) {
      console.warn('[QrMatrixView] Error generando matriz QR:', err);
      return { matrix: [], viewSize: 0 };
    }
  }, [value, margin]);

  if (!matrix.length) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`flex items-center justify-center bg-slate-100 text-slate-400 text-xs rounded-xl border border-slate-200 ${className}`}
        role="img"
        aria-label={alt}
      >
        <span>Sin datos QR</span>
      </div>
    );
  }

  const matrixSize = matrix.length;

  return (
    <div
      className={`inline-block p-2 rounded-2xl bg-white shadow-xl border-2 border-emerald-500/40 relative select-none ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={alt}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${viewSize} ${viewSize}`}
        className="w-full h-full"
        shapeRendering="crispEdges"
      >
        <rect width={viewSize} height={viewSize} fill={lightColor} />
        {matrix.map((row, r) =>
          row.map((isDark, c) =>
            isDark ? (
              <rect
                key={`${r}-${c}`}
                x={c + margin}
                y={r + margin}
                width={1}
                height={1}
                fill={darkColor}
              />
            ) : null
          )
        )}
      </svg>
    </div>
  );
};

export default QrMatrixView;
