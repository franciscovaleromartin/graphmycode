// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react';
import * as d3 from 'd3';
import type { graphlib } from '@dagrejs/dagre';
import { ChevronRight } from '@/lib/lucide-icons';
import { useAppState } from '../hooks/useAppState';
import { buildDagreGraph } from '../lib/codeflow/buildDagreGraph';
import { CodeFlowExplorer } from './CodeFlowExplorer';
import { getWorkerApi } from '../services/ingestion-worker';
import { readFile as backendReadFile } from '../services/backend-client';
import type { FlowNodeType } from '../lib/codeflow/types';

export interface CodeFlowViewHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  exportSvg: () => void;
}

const NODE_STYLE: Record<FlowNodeType, { fill: string; stroke: string }> = {
  function: { fill: '#0d2119', stroke: '#10b981' },
  method:   { fill: '#0d2221', stroke: '#14b8a6' },
  class:    { fill: '#1a1205', stroke: '#f59e0b' },
  decision: { fill: '#1c1000', stroke: '#fbbf24' },
  loop:     { fill: '#0d0f2b', stroke: '#818cf8' },
  error:    { fill: '#200a0a', stroke: '#ef4444' },
  start:    { fill: '#062020', stroke: '#06b6d4' },
  end:      { fill: '#101018', stroke: '#5a5a70' },
};

async function readFileContent(filePath: string): Promise<string> {
  try {
    const api = getWorkerApi();
    const content = await (api.readLocalFile as (p: string) => Promise<string>)(filePath);
    if (content) return content;
  } catch {}
  try {
    const result = await backendReadFile(filePath);
    return (result as any).content ?? '';
  } catch {}
  return '';
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

function renderGraph(
  svgEl: SVGSVGElement,
  g: graphlib.Graph,
  zoomRef: React.MutableRefObject<d3.ZoomBehavior<SVGSVGElement, unknown> | null>,
) {
  const width = svgEl.clientWidth || 900;
  const height = svgEl.clientHeight || 600;

  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();

  const defs = svg.append('defs');
  defs
    .append('marker')
    .attr('id', 'cf-arrow')
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', 10)
    .attr('refY', 0)
    .attr('markerWidth', 8)
    .attr('markerHeight', 8)
    .attr('orient', 'auto-start-reverse')
    .append('path')
    .attr('d', 'M0,-4L10,0L0,4Z')
    .attr('fill', '#5a5a80');

  const container = svg.append('g').attr('class', 'cf-container');

  const zoom = d3
    .zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.05, 4])
    .on('zoom', event => {
      container.attr('transform', event.transform.toString());
    });
  svg.call(zoom);
  zoomRef.current = zoom;

  // ── Interaction ──────────────────────────────────────────────────────────────
  const edgeList = g.edges() as Array<{ v: string; w: string }>;
  let activeNodeId: string | null = null;

  const DIM_NODE = 0.12;
  const DIM_EDGE = 0.08;
  const EDGE_ACTIVE_STROKE = '#7070a8';
  const EDGE_BASE_STROKE = '#3a3a58';

  function applySelection(clickedId: string | null) {
    activeNodeId = clickedId;

    if (!clickedId) {
      container.selectAll<SVGGElement, unknown>('.cf-node').each(function () {
        const sel = d3.select(this);
        const type = sel.attr('data-type') as FlowNodeType;
        sel.style('opacity', 1);
        sel.select('.cf-shape').attr('stroke-width', type === 'error' ? 2 : 1.5);
      });
      container.selectAll<SVGPathElement, unknown>('.cf-edge')
        .style('opacity', 1)
        .attr('stroke', EDGE_BASE_STROKE);
      return;
    }

    const neighborIds = new Set<string>();
    const connectedKeys = new Set<string>();
    for (const e of edgeList) {
      if (e.v === clickedId || e.w === clickedId) {
        connectedKeys.add(`${e.v}__${e.w}`);
        neighborIds.add(e.v === clickedId ? e.w : e.v);
      }
    }

    container.selectAll<SVGGElement, unknown>('.cf-node').each(function () {
      const sel = d3.select(this);
      const id = sel.attr('data-id');
      const type = sel.attr('data-type') as FlowNodeType;
      const isSelected = id === clickedId;
      const isNeighbor = neighborIds.has(id);
      sel.style('opacity', isSelected || isNeighbor ? 1 : DIM_NODE);
      sel.select('.cf-shape').attr('stroke-width', isSelected ? 3 : type === 'error' ? 2 : 1.5);
    });

    container.selectAll<SVGPathElement, unknown>('.cf-edge').each(function () {
      const sel = d3.select(this);
      const key = sel.attr('data-edge');
      const active = connectedKeys.has(key!);
      sel.style('opacity', active ? 1 : DIM_EDGE);
      sel.attr('stroke', active ? EDGE_ACTIVE_STROKE : EDGE_BASE_STROKE);
    });
  }

  // Click outside any node resets selection
  svg.on('click', () => applySelection(null));

  // ── Render edges ─────────────────────────────────────────────────────────────
  const edgeGroup = container.append('g');
  for (const e of edgeList) {
    const edge = g.edge(e) as { points: Array<{ x: number; y: number }> };
    if (!edge?.points?.length) continue;
    const line = d3.line<{ x: number; y: number }>().x(d => d.x).y(d => d.y);
    edgeGroup
      .append('path')
      .attr('class', 'cf-edge')
      .attr('data-edge', `${e.v}__${e.w}`)
      .attr('d', line(edge.points))
      .attr('fill', 'none')
      .attr('stroke', EDGE_BASE_STROKE)
      .attr('stroke-width', 1.5)
      .attr('marker-end', 'url(#cf-arrow)');
  }

  // ── Render nodes ─────────────────────────────────────────────────────────────
  const nodeGroup = container.append('g');
  const nodeIds = g.nodes() as string[];
  for (const nodeId of nodeIds) {
    const n = g.node(nodeId) as {
      x: number; y: number; width: number; height: number;
      label: string; nodeType: FlowNodeType;
    };
    if (!n) continue;
    const { x, y, width: w, height: h, label, nodeType } = n;
    const hw = w / 2;
    const hh = h / 2;
    const style = NODE_STYLE[nodeType] ?? NODE_STYLE.function;

    const gNode = nodeGroup
      .append('g')
      .attr('class', 'cf-node')
      .attr('data-id', nodeId)
      .attr('data-type', nodeType)
      .attr('transform', `translate(${x},${y})`)
      .style('cursor', 'pointer')
      .on('click', (event: MouseEvent) => {
        event.stopPropagation();
        applySelection(activeNodeId === nodeId ? null : nodeId);
      });

    if (nodeType === 'start' || nodeType === 'end') {
      gNode
        .append('ellipse')
        .attr('class', 'cf-shape')
        .attr('rx', hw).attr('ry', hh)
        .attr('fill', style.fill)
        .attr('stroke', style.stroke)
        .attr('stroke-width', 1.5);
    } else if (nodeType === 'decision') {
      gNode
        .append('polygon')
        .attr('class', 'cf-shape')
        .attr('points', `0,${-hh} ${hw},0 0,${hh} ${-hw},0`)
        .attr('fill', style.fill)
        .attr('stroke', style.stroke)
        .attr('stroke-width', 1.5);
    } else if (nodeType === 'loop') {
      const cut = 10;
      gNode
        .append('polygon')
        .attr('class', 'cf-shape')
        .attr('points',
          `${-hw + cut},${-hh} ${hw - cut},${-hh} ${hw},0 ${hw - cut},${hh} ${-hw + cut},${hh} ${-hw},0`,
        )
        .attr('fill', style.fill)
        .attr('stroke', style.stroke)
        .attr('stroke-width', 1.5);
    } else {
      gNode
        .append('rect')
        .attr('class', 'cf-shape')
        .attr('x', -hw).attr('y', -hh)
        .attr('width', w).attr('height', h)
        .attr('rx', 6)
        .attr('fill', style.fill)
        .attr('stroke', style.stroke)
        .attr('stroke-width', nodeType === 'error' ? 2 : 1.5);
    }

    gNode
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('fill', style.stroke)
      .attr('font-size', '11')
      .attr('font-family', 'JetBrains Mono, Fira Code, monospace')
      .attr('pointer-events', 'none')
      .text(label);
  }

  const bounds = (container.node() as SVGGElement | null)?.getBBox();
  if (bounds && bounds.width > 0 && bounds.height > 0) {
    const scale = Math.min((width * 0.85) / bounds.width, (height * 0.85) / bounds.height, 1.5);
    const tx = (width - bounds.width * scale) / 2 - bounds.x * scale;
    const ty = (height - bounds.height * scale) / 2 - bounds.y * scale;
    svg.call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  }
}

interface CodeFlowViewProps {
  depth?: 'high' | 'low';
}

export const CodeFlowView = forwardRef<CodeFlowViewHandle, CodeFlowViewProps>(
  ({ depth = 'high' }, ref) => {
  const { graph } = useAppState();
  const [mode, setMode] = useState<'explorer' | 'graph'>('explorer');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dagreGraph, setDagreGraph] = useState<graphlib.Graph | null>(null);
  const [nodeCount, setNodeCount] = useState(0);
  const [explorerExpandedPaths, setExplorerExpandedPaths] = useState<Set<string>>(new Set());
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const explorerInitialized = useRef(false);
  const savedTransformRef = useRef<d3.ZoomTransform | null>(null);

  // Keeps the latest depth accessible inside the stable handleFileSelect callback
  const depthRef = useRef(depth);
  useEffect(() => { depthRef.current = depth; }, [depth]);

  const handleExplorerToggle = useCallback((path: string) => {
    setExplorerExpandedPaths(prev => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  }, []);

  const fileNodes = useMemo(
    () => graph?.nodes.filter(n => n.label === 'File') ?? [],
    [graph],
  );

  // Auto-expande el primer nivel al activarse la vista por primera vez
  useEffect(() => {
    if (explorerInitialized.current || fileNodes.length === 0) return;
    explorerInitialized.current = true;
    const firstLevel = new Set<string>();
    for (const node of fileNodes) {
      const parts = node.properties.filePath.split('/').filter(Boolean);
      if (parts.length > 1) firstLevel.add(parts[0]);
    }
    if (firstLevel.size > 0) setExplorerExpandedPaths(firstLevel);
  }, [fileNodes]);

  useImperativeHandle(ref, () => ({
    zoomIn: () => {
      if (svgRef.current && zoomRef.current)
        d3.select(svgRef.current).call(zoomRef.current.scaleBy, 1.3);
    },
    zoomOut: () => {
      if (svgRef.current && zoomRef.current)
        d3.select(svgRef.current).call(zoomRef.current.scaleBy, 0.77);
    },
    resetZoom: () => {
      if (svgRef.current && dagreGraph) renderGraph(svgRef.current, dagreGraph, zoomRef);
    },
    exportSvg: () => {
      if (!svgRef.current || !dagreGraph) return;

      // 1 — Bounding box completa desde las posiciones dagre
      const MARGIN = 48;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const id of dagreGraph.nodes() as string[]) {
        const n = dagreGraph.node(id) as { x: number; y: number; width: number; height: number } | undefined;
        if (!n) continue;
        minX = Math.min(minX, n.x - n.width / 2);
        minY = Math.min(minY, n.y - n.height / 2);
        maxX = Math.max(maxX, n.x + n.width / 2);
        maxY = Math.max(maxY, n.y + n.height / 2);
      }
      const vbX = minX - MARGIN;
      const vbY = minY - MARGIN;
      const vbW = maxX - minX + MARGIN * 2;
      const vbH = maxY - minY + MARGIN * 2;

      // 2 — Clonar SVG y resetear transformación de pan/zoom
      const clone = svgRef.current.cloneNode(true) as SVGSVGElement;
      clone.setAttribute('viewBox', `${vbX} ${vbY} ${vbW} ${vbH}`);
      clone.setAttribute('width', String(Math.round(vbW)));
      clone.setAttribute('height', String(Math.round(vbH)));
      const containerEl = clone.querySelector('.cf-container');
      if (containerEl) containerEl.removeAttribute('transform');

      // 3 — Fondo blanco
      const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bg.setAttribute('x', String(vbX));
      bg.setAttribute('y', String(vbY));
      bg.setAttribute('width', String(vbW));
      bg.setAttribute('height', String(vbH));
      bg.setAttribute('fill', 'white');
      clone.insertBefore(bg, clone.firstChild);

      // 4 — Nodos con fondo blanco y aristas más oscuras para fondo claro
      clone.querySelectorAll<SVGElement>('.cf-shape').forEach(el => {
        el.setAttribute('fill', 'white');
      });
      clone.querySelectorAll<SVGElement>('.cf-edge').forEach(el => {
        el.setAttribute('stroke', '#555570');
      });
      const markerPath = clone.querySelector('#cf-arrow path');
      if (markerPath) markerPath.setAttribute('fill', '#555570');

      const serializer = new XMLSerializer();
      const svgStr =
        '<?xml version="1.0" encoding="UTF-8"?>\n' + serializer.serializeToString(clone);
      const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `codeflow-${selectedFile?.split('/').pop() ?? 'graph'}.svg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
  }), [dagreGraph, selectedFile]);

  const handleFileSelect = useCallback(async (filePath: string) => {
    setSelectedFile(filePath);
    setMode('graph');
    setIsLoading(true);
    setLoadError(null);
    setDagreGraph(null);
    setNodeCount(0);

    try {
      const content = await readFileContent(filePath);
      if (!content) {
        setLoadError('No se pudo leer el contenido del archivo.');
        return;
      }
      const g = await buildDagreGraph(filePath, content, depthRef.current === 'low');
      setNodeCount(g.nodes().length);
      setDagreGraph(g);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Error al generar el flujo.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!dagreGraph || !svgRef.current) return;
    renderGraph(svgRef.current, dagreGraph, zoomRef);
    if (savedTransformRef.current && zoomRef.current) {
      d3.select(svgRef.current).call(zoomRef.current.transform, savedTransformRef.current);
      savedTransformRef.current = null;
    }
  }, [dagreGraph]);

  const prevDepthRef = useRef(depth);
  useEffect(() => {
    if (prevDepthRef.current === depth) return;
    prevDepthRef.current = depth;
    if (selectedFile && mode === 'graph') {
      if (svgRef.current) savedTransformRef.current = d3.zoomTransform(svgRef.current);
      handleFileSelect(selectedFile);
    }
  }, [depth, selectedFile, mode, handleFileSelect]);

  const handleBack = useCallback(() => {
    setMode('explorer');
    setSelectedFile(null);
    setDagreGraph(null);
    setLoadError(null);
    setNodeCount(0);
  }, []);

  return (
    <div className="flex h-full w-full flex-col bg-void">
      {/* Barra de navegación */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border-subtle bg-deep px-3">
        {mode === 'graph' ? (
          <>
            <button
              onClick={handleBack}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-text-secondary transition-colors hover:bg-hover hover:text-text-primary"
            >
              <ChevronRight className="h-3.5 w-3.5 rotate-180" />
              Explorador
            </button>
            <div className="h-4 w-px bg-border-subtle" />
            <span className="max-w-xs truncate font-mono text-xs text-text-muted">
              {selectedFile?.split('/').pop()}
            </span>
            {nodeCount > 300 && (
              <>
                <div className="h-4 w-px bg-border-subtle" />
                <span className="text-xs text-amber-400">
                  Archivo muy grande — el renderizado puede ser lento
                </span>
              </>
            )}
          </>
        ) : (
          <span className="text-xs font-medium text-text-secondary">
            Selecciona un archivo compatible (.js .ts .jsx .tsx .py)
          </span>
        )}
      </div>

      {/* Content */}
      <div className="relative flex-1 overflow-hidden">
        {/* Explorer: siempre montado para preservar expansión de carpetas */}
        <div className={mode === 'explorer' ? 'h-full' : 'hidden'}>
          <CodeFlowExplorer
            files={fileNodes}
            selectedFilePath={selectedFile}
            expandedPaths={explorerExpandedPaths}
            onToggle={handleExplorerToggle}
            onFileSelect={handleFileSelect}
          />
        </div>

        {mode === 'graph' && (
          <>
            {isLoading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-void/80">
                <div className="flex flex-col items-center gap-3">
                  <div className="size-8 animate-spin rounded-full border-2 border-border-subtle border-t-accent" />
                  <span className="text-sm text-text-muted">Analizando flujo…</span>
                </div>
              </div>
            )}
            {loadError && !isLoading && (
              <div className="flex h-full items-center justify-center p-8 text-center">
                <p className="text-sm text-red-400">{loadError}</p>
              </div>
            )}
            {!loadError && (
              <svg
                ref={svgRef}
                className="h-full w-full"
                style={{ cursor: 'grab' }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
  },
);

CodeFlowView.displayName = 'CodeFlowView';
