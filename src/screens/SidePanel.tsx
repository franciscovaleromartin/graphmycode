import { useState } from 'react';
import { useAppState } from '../hooks/useAppState';
import { NODE_COLORS } from '../lib/constants';
import type { NodeLabel } from 'gitnexus-shared';

// Labels to show in legend (most useful ones)
const LEGEND_LABELS: NodeLabel[] = [
  'File', 'Folder', 'Class', 'Function', 'Method', 'Interface', 'Import',
];

const LABEL_ES: Partial<Record<NodeLabel, string>> = {
  File: 'Archivo', Folder: 'Carpeta', Class: 'Clase',
  Function: 'Función', Method: 'Método', Interface: 'Interfaz', Import: 'Import',
};

export const SidePanel = () => {
  const { graph, setViewMode, setGraph, projectName } = useAppState();
  const [collapsed, setCollapsed] = useState(false);

  // Compute stats
  const stats = {
    total: graph?.nodeCount ?? 0,
    files: graph?.nodes.filter((n) => n.label === 'File').length ?? 0,
    functions: graph?.nodes.filter((n) => n.label === 'Function' || n.label === 'Method').length ?? 0,
    classes: graph?.nodes.filter((n) => n.label === 'Class').length ?? 0,
    edges: graph?.relationshipCount ?? 0,
  };

  const handleReset = () => {
    setGraph(null);
    setViewMode('onboarding');
  };

  return (
    <div
      className={`absolute left-0 top-0 z-20 flex h-full flex-col border-r border-border-subtle bg-deep transition-all duration-300 ${
        collapsed ? 'w-10' : 'w-56'
      }`}
    >
      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex h-10 w-full items-center justify-center border-b border-border-subtle text-text-muted transition-colors hover:text-text-primary"
        title={collapsed ? 'Expandir panel' : 'Colapsar panel'}
      >
        <svg
          className={`h-4 w-4 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {!collapsed && (
        <div className="flex flex-1 flex-col overflow-y-auto px-3 py-4">
          {/* Project name */}
          {projectName && (
            <p className="mb-4 truncate text-xs font-semibold uppercase tracking-wider text-accent" title={projectName}>
              {projectName}
            </p>
          )}

          {/* Stats */}
          <section className="mb-5">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-text-muted">Stats</p>
            <div className="space-y-1.5">
              {[
                { label: 'Nodos', value: stats.total },
                { label: 'Archivos', value: stats.files },
                { label: 'Funciones', value: stats.functions },
                { label: 'Clases', value: stats.classes },
                { label: 'Relaciones', value: stats.edges },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-xs text-text-secondary">{label}</span>
                  <span className="font-mono text-xs font-medium text-text-primary">
                    {value.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Legend */}
          <section className="mb-5">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-text-muted">Leyenda</p>
            <div className="space-y-1.5">
              {LEGEND_LABELS.map((label) => (
                <div key={label} className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: NODE_COLORS[label] }}
                  />
                  <span className="text-xs text-text-secondary">{LABEL_ES[label] ?? label}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Reset button */}
          <div className="mt-auto">
            <button
              onClick={handleReset}
              className="w-full rounded-lg border border-border-default px-3 py-2 text-xs text-text-secondary transition-colors hover:border-accent/40 hover:text-accent"
            >
              Nuevo análisis
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
