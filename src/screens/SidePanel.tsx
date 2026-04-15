import { useAppState } from '../hooks/useAppState';
import { NODE_COLORS } from '../lib/constants';
import type { NodeLabel } from 'gitnexus-shared';
import { useT } from '../lib/i18n';

// Labels to show in legend (most useful ones)
const LEGEND_LABELS: NodeLabel[] = [
  'File', 'Folder', 'Class', 'Function', 'Method', 'Interface', 'Import',
];

export const SidePanel = () => {
  const {
    graph, setViewMode, setGraph, projectName,
    isSidebarCollapsed: collapsed, setSidebarCollapsed: setCollapsed,
    graphViewType, semanticClusterData,
  } = useAppState();
  const t = useT();

  const LABEL_I18N: Partial<Record<NodeLabel, string>> = {
    File: t.labelFile, Folder: t.labelFolder, Class: t.labelClass,
    Function: t.labelFunction, Method: t.labelMethod, Interface: t.labelInterface, Import: t.labelImport,
  };

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
      {/* Header: toggle + title */}
      <div className="flex h-10 items-center border-b border-border-subtle">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center text-text-muted transition-colors hover:text-text-primary"
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
          <span className="ml-1 text-sm font-semibold tracking-tight text-text-primary">
            GraphMy<span className="text-secondary">Code</span>
          </span>
        )}
      </div>

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
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-text-muted">{t.statsTitle}</p>
            <div className="space-y-1.5">
              {[
                { label: t.statNodes, value: stats.total },
                { label: t.statFiles, value: stats.files },
                { label: t.statFunctions, value: stats.functions },
                { label: t.statClasses, value: stats.classes },
                { label: t.statEdges, value: stats.edges },
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

          {/* Legend — cambia según la vista activa */}
          <section className="mb-5">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-text-muted">
              {graphViewType === 'semantic' ? 'Clusters' : graphViewType === 'city' ? 'Technical Debt' : graphViewType === 'heatmap' ? 'Acoplamiento' : t.legendTitle}
            </p>
            {graphViewType === 'semantic' ? (
              <div className="space-y-1.5">
                {semanticClusterData ? (
                  semanticClusterData.map((cluster, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 flex-shrink-0 rounded-full"
                          style={{ backgroundColor: cluster.color }}
                        />
                        <span className="text-xs text-text-secondary">Cluster {i + 1}</span>
                      </div>
                      <span className="font-mono text-xs font-medium text-text-primary">
                        {cluster.count}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-text-muted">Cargando clusters...</p>
                )}
              </div>
            ) : graphViewType === 'city' ? (
              <div className="space-y-3">
                {/* Altura */}
                <div>
                  <p className="mb-1.5 text-xs text-text-muted">Altura del edificio</p>
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col items-center gap-0.5">
                      <div className="w-3 rounded-sm bg-text-muted/30" style={{ height: '6px' }} />
                      <div className="w-3 rounded-sm bg-text-muted/30" style={{ height: '10px' }} />
                      <div className="w-3 rounded-sm bg-text-muted/30" style={{ height: '16px' }} />
                    </div>
                    <span className="text-xs text-text-secondary">Más alto = más conexiones<br />o mayor profundidad</span>
                  </div>
                </div>
                {/* Gradiente de calor */}
                <div>
                  <p className="mb-1.5 text-xs text-text-muted">Color (intensidad)</p>
                  <div className="flex flex-col gap-1">
                    <div
                      className="h-2.5 w-full rounded-full"
                      style={{ background: 'linear-gradient(to right, #3b82f6, #ff4444)' }}
                    />
                    <div className="flex justify-between">
                      <span className="text-xs text-text-muted">Bajo</span>
                      <span className="text-xs text-red-400">Alto</span>
                    </div>
                  </div>
                </div>
                {/* Distritos */}
                <div>
                  <p className="mb-1.5 text-xs text-text-muted">Distritos</p>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 flex-shrink-0 rounded-sm" style={{ backgroundColor: '#1a1a2e', border: '1px solid #2d2d4a' }} />
                    <span className="text-xs text-text-secondary">Cada plano = carpeta raíz</span>
                  </div>
                </div>
                {/* Tipos de nodo */}
                <div>
                  <p className="mb-1.5 text-xs text-text-muted">Tipos de nodo</p>
                  <div className="space-y-1">
                    {LEGEND_LABELS.slice(0, 4).map((label) => (
                      <div key={label} className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 flex-shrink-0 rounded-sm"
                          style={{ backgroundColor: NODE_COLORS[label] }}
                        />
                        <span className="text-xs text-text-secondary">{LABEL_I18N[label] ?? label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : graphViewType === 'heatmap' ? (
              <div className="space-y-3">
                {/* Gradiente de calor */}
                <div>
                  <p className="mb-1.5 text-xs text-text-muted">Nodos (color = grado)</p>
                  <div className="flex flex-col gap-1">
                    <div
                      className="h-2.5 w-full rounded-full"
                      style={{ background: 'linear-gradient(to right, #3b82f6, #22c55e, #f59e0b, #ef4444)' }}
                    />
                    <div className="flex justify-between">
                      <span className="text-xs text-text-muted">Bajo</span>
                      <span className="text-xs text-red-400">Alto</span>
                    </div>
                  </div>
                </div>
                {/* Aristas */}
                <div>
                  <p className="mb-1.5 text-xs text-text-muted">Aristas</p>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="h-0.5 w-5 flex-shrink-0 rounded" style={{ backgroundColor: '#334155' }} />
                      <span className="text-xs text-text-secondary">Unidireccional</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-1 w-5 flex-shrink-0 rounded" style={{ backgroundColor: '#f97316' }} />
                      <span className="text-xs text-text-secondary">Bidireccional ⇄</span>
                    </div>
                  </div>
                </div>
                {/* Stats */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-text-secondary">Ficheros</span>
                    <span className="font-mono text-xs font-medium text-text-primary">
                      {stats.files}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                {LEGEND_LABELS.map((label) => (
                  <div key={label} className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: NODE_COLORS[label] }}
                    />
                    <span className="text-xs text-text-secondary">{LABEL_I18N[label] ?? label}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Reset button */}
          <div className="mt-auto">
            <button
              onClick={handleReset}
              className="w-full rounded-lg border border-border-default px-3 py-2 text-xs text-text-secondary transition-colors hover:border-accent/40 hover:text-accent"
            >
              {t.newAnalysis}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
