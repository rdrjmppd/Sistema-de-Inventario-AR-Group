import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { COPYRIGHT_NOTICE } from '../../lib/excel-exporter';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'Error inesperado de renderizado.',
    };
  }

  handleReset = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-between p-6">
          <div className="max-w-lg mx-auto my-auto bg-slate-900 border border-rose-500/40 rounded-xl p-6 shadow-xl">
            <div className="flex items-center gap-3 text-rose-400 mb-3">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h1 className="text-lg font-bold">
                Protección Activa de Contenedor (Anti-Pantalla Blanca)
              </h1>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              El escudo de resiliencia SDD interceptó una excepción en tiempo de ejecución. Sus
              datos transaccionales y de inventario están protegidos.
            </p>
            <div className="bg-slate-950 border border-slate-800 rounded p-3 font-mono text-xs text-rose-300 mb-4 overflow-x-auto">
              {this.state.errorMessage}
            </div>
            <button
              type="button"
              onClick={this.handleReset}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs transition"
            >
              <RotateCcw className="w-4 h-4" />
              Restaurar Vista Operativa
            </button>
          </div>
          <div className="text-center text-xs text-slate-400 font-mono">
            {COPYRIGHT_NOTICE}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
