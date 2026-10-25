import React from 'react';
import { ShieldCheck, Clock } from 'lucide-react';
import { COPYRIGHT_NOTICE } from '../../lib/excel-exporter';
import { useFinance } from '../../context/FinanceContext';

export const Footer: React.FC = () => {
  const { bcvState } = useFinance();

  return (
    <footer className="bg-slate-900 border-t border-slate-800 text-slate-300 px-6 py-3 text-xs select-none shrink-0">
      <div className="max-w-[1600px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-medium text-white">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{COPYRIGHT_NOTICE}</span>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-400 font-mono">
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <Clock className="w-3.5 h-3.5 text-sky-400" />
            VET (UTC-4): {bcvState.caracasDateFormatted} {bcvState.caracasTimeFormatted}
          </span>
          <span className="hidden md:inline text-slate-600">|</span>
          <span className="text-emerald-400 font-semibold whitespace-nowrap">
            Decimal.js (ROUND_HALF_UP) Activo
          </span>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
