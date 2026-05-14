// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

import { useMemo } from 'react';
import { useAppState } from '../hooks/useAppState';
import { NODE_COLORS } from '../lib/constants';
import type { NodeLabel } from 'gitnexus-shared';
import { useT } from '../lib/i18n';
import { detectAgentCode } from '../lib/agent-detection';
import { exportAgentContext } from '../lib/agent-context-export';

// Labels to show in legend (most useful ones)
const LEGEND_LABELS: NodeLabel[] = [
  'File', 'Folder', 'Class', 'Function', 'Method', 'Interface', 'Import',
];

export const SidePanel = () => {
  const {
    graph, setViewMode, setGraph, projectName,
    isSidebarCollapsed: collapsed, setSidebarCollapsed: setCollapsed,
    graphViewType, semanticClusterData, externalDeps,
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

  const agentDetection = useMemo(() => {
    if (!graph) return { isAgent: false, confidence: 0 };
    return detectAgentCode(graph, externalDeps);
  }, [graph, externalDeps]);

  const handleExportAgentContext = () => {
    if (!graph) return;
    exportAgentContext(graph, projectName, externalDeps, agentDetection.isAgent);
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
          className="flex size-10 flex-shrink-0 items-center justify-center text-text-muted transition-colors hover:text-text-primary"
          title={collapsed ? 'Expandir panel' : 'Colapsar panel'}
        >
          <svg
            className={`size-4 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`}
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
              {graphViewType === 'semantic' ? 'Clusters' : graphViewType === 'city' ? 'Technical Debt' : graphViewType === 'heatmap' ? 'Acoplamiento' : graphViewType === 'codeflow' ? 'Code Flow' : t.legendTitle}
            </p>
            {graphViewType === 'semantic' ? (
              <div className="space-y-1.5">
                {semanticClusterData ? (
                  semanticClusterData.map((cluster, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="size-2 flex-shrink-0 rounded-full"
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
                    <span className="size-2 flex-shrink-0 rounded-sm" style={{ backgroundColor: '#1a1a2e', border: '1px solid #2d2d4a' }} />
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
                          className="size-2 flex-shrink-0 rounded-sm"
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
                      className="h-2.5 w-full rounded"
                      style={{ background: 'linear-gradient(to right, #1d4e89, #2e86de, #f39c12, #e74c3c, #8e1a1a)' }}
                    />
                    <div className="flex justify-between">
                      <span className="text-xs text-text-muted">Bajo</span>
                      <span className="text-xs" style={{ color: '#e74c3c' }}>Alto</span>
                    </div>
                  </div>
                </div>
                {/* Aristas */}
                <div>
                  <p className="mb-1.5 text-xs text-text-muted">Aristas</p>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="h-px w-5 flex-shrink-0" style={{ backgroundColor: 'rgba(255,255,255,0.3)' }} />
                      <span className="text-xs text-text-secondary">Unidireccional</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-5 flex-shrink-0"
                        style={{
                          height: 2,
                          backgroundImage: 'repeating-linear-gradient(to right, #e74c3c 0, #e74c3c 4px, transparent 4px, transparent 7px)',
                        }}
                      />
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
            ) : graphViewType === 'codeflow' ? (
              <div className="space-y-1.5">
                {([
                  { color: '#10b981', label: 'Función' },
                  { color: '#14b8a6', label: 'Método' },
                  { color: '#f59e0b', label: 'Clase' },
                  { color: '#fbbf24', label: 'Decisión (if)' },
                  { color: '#818cf8', label: 'Bucle (for/while)' },
                  { color: '#ef4444', label: 'Error (try/catch)' },
                  { color: '#06b6d4', label: 'Inicio' },
                  { color: '#5a5a70', label: 'Retorno' },
                ] as const).map(({ color, label }) => (
                  <div key={label} className="flex items-center gap-2">
                    <span className="size-2 flex-shrink-0 rounded-sm" style={{ backgroundColor: color }} />
                    <span className="text-xs text-text-secondary">{label}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-1.5">
                {LEGEND_LABELS.map((label) => (
                  <div key={label} className="flex items-center gap-2">
                    <span
                      className="size-2 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: NODE_COLORS[label] }}
                    />
                    <span className="text-xs text-text-secondary">{LABEL_I18N[label] ?? label}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Export section — always visible; badge only when agent patterns detected */}
          <hr className="mb-4 border-border-subtle" />
          <section className="mb-4">
            {agentDetection.isAgent && (
              <>
                <div className="mb-2 flex items-center gap-1.5 rounded-md border border-secondary/30 bg-secondary/10 px-2.5 py-1.5">
                  <span className="text-sm">⚡</span>
                  <span className="text-xs font-semibold text-secondary">Agent Mode Detected</span>
                </div>
                <p className="mb-3 text-xs text-text-muted">
                  AI agent patterns detected in this project.
                </p>
              </>
            )}
            <button
              onClick={handleExportAgentContext}
              className="w-full rounded-lg border border-border-default px-3 py-2 text-xs text-text-secondary transition-colors hover:border-accent/40 hover:text-accent"
            >
              ⬇ Export Project Context
            </button>
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
