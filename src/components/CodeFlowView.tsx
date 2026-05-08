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
import { ChevronRight, Download } from '@/lib/lucide-icons';
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
    .attr('refX', 9)
    .attr('refY', 0)
    .attr('markerWidth', 6)
    .attr('markerHeight', 6)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M0,-5L10,0L0,5')
    .attr('fill', '#3a3a50');

  const container = svg.append('g').attr('class', 'cf-container');

  const zoom = d3
    .zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.05, 4])
    .on('zoom', event => {
      container.attr('transform', event.transform.toString());
    });
  svg.call(zoom);
  zoomRef.current = zoom;

  const edgeGroup = container.append('g');
  const edges = g.edges() as Array<{ v: string; w: string }>;
  for (const e of edges) {
    const edge = g.edge(e) as { points: Array<{ x: number; y: number }> };
    if (!edge?.points?.length) continue;
    const line = d3
      .line<{ x: number; y: number }>()
      .x(d => d.x)
      .y(d => d.y)
      .curve(d3.curveCatmullRom.alpha(0.5));
    edgeGroup
      .append('path')
      .attr('d', line(edge.points))
      .attr('fill', 'none')
      .attr('stroke', '#2a2a3a')
      .attr('stroke-width', 1.5)
      .attr('marker-end', 'url(#cf-arrow)');
  }

  const nodeGroup = container.append('g');
  const nodeIds = g.nodes() as string[];
  for (const nodeId of nodeIds) {
    const n = g.node(nodeId) as {
      x: number;
      y: number;
      width: number;
      height: number;
      label: string;
      nodeType: FlowNodeType;
    };
    if (!n) continue;
    const { x, y, width: w, height: h, label, nodeType } = n;
    const hw = w / 2;
    const hh = h / 2;
    const style = NODE_STYLE[nodeType] ?? NODE_STYLE.function;

    const gNode = nodeGroup
      .append('g')
      .attr('transform', `translate(${x},${y})`);

    if (nodeType === 'start' || nodeType === 'end') {
      gNode
        .append('ellipse')
        .attr('rx', hw)
        .attr('ry', hh)
        .attr('fill', style.fill)
        .attr('stroke', style.stroke)
        .attr('stroke-width', 1.5);
    } else if (nodeType === 'decision') {
      gNode
        .append('polygon')
        .attr('points', `0,${-hh} ${hw},0 0,${hh} ${-hw},0`)
        .attr('fill', style.fill)
        .attr('stroke', style.stroke)
        .attr('stroke-width', 1.5);
    } else if (nodeType === 'loop') {
      const cut = 10;
      gNode
        .append('polygon')
        .attr(
          'points',
          `${-hw + cut},${-hh} ${hw - cut},${-hh} ${hw},0 ${hw - cut},${hh} ${-hw + cut},${hh} ${-hw},0`,
        )
        .attr('fill', style.fill)
        .attr('stroke', style.stroke)
        .attr('stroke-width', 1.5);
    } else {
      const sw = nodeType === 'error' ? 2 : 1.5;
      gNode
        .append('rect')
        .attr('x', -hw)
        .attr('y', -hh)
        .attr('width', w)
        .attr('height', h)
        .attr('rx', 6)
        .attr('fill', style.fill)
        .attr('stroke', style.stroke)
        .attr('stroke-width', sw);
    }

    const maxChars = nodeType === 'decision' ? 14 : nodeType === 'start' || nodeType === 'end' ? 12 : 20;
    gNode
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('fill', style.stroke)
      .attr('font-size', '11')
      .attr('font-family', 'JetBrains Mono, Fira Code, monospace')
      .attr('pointer-events', 'none')
      .text(truncate(label, maxChars));
  }

  const bounds = (container.node() as SVGGElement | null)?.getBBox();
  if (bounds && bounds.width > 0 && bounds.height > 0) {
    const scale = Math.min((width * 0.85) / bounds.width, (height * 0.85) / bounds.height, 1.5);
    const tx = (width - bounds.width * scale) / 2 - bounds.x * scale;
    const ty = (height - bounds.height * scale) / 2 - bounds.y * scale;
    svg.call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  }
}

export const CodeFlowView = forwardRef<CodeFlowViewHandle>((_, ref) => {
  const { graph } = useAppState();
  const [mode, setMode] = useState<'explorer' | 'graph'>('explorer');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dagreGraph, setDagreGraph] = useState<graphlib.Graph | null>(null);
  const [nodeCount, setNodeCount] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  const fileNodes = useMemo(
    () => graph?.nodes.filter(n => n.label === 'File') ?? [],
    [graph],
  );

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
  }));

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
      const g = await buildDagreGraph(filePath, content);
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
  }, [dagreGraph]);

  const handleBack = useCallback(() => {
    setMode('explorer');
    setSelectedFile(null);
    setDagreGraph(null);
    setLoadError(null);
    setNodeCount(0);
  }, []);

  const handleExport = useCallback(() => {
    if (!svgRef.current) return;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svgRef.current);
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `codeflow-${selectedFile?.split('/').pop() ?? 'graph'}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [selectedFile]);

  return (
    <div className="flex h-full w-full flex-col bg-void">
      {/* Toolbar */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border-subtle bg-deep px-3">
        {mode === 'graph' && (
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
        )}
        {mode === 'explorer' && (
          <span className="text-xs font-medium text-text-secondary">Code Flow — Selecciona un archivo</span>
        )}
        <div className="flex-1" />
        {mode === 'graph' && dagreGraph && (
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded border border-border-subtle px-2 py-1 text-xs text-text-secondary transition-colors hover:border-accent/40 hover:text-accent"
            title="Exportar SVG"
          >
            <Download className="h-3.5 w-3.5" />
            Exportar SVG
          </button>
        )}
      </div>

      {/* Content */}
      <div className="relative flex-1 overflow-hidden">
        {mode === 'explorer' && (
          <CodeFlowExplorer
            files={fileNodes}
            selectedFilePath={selectedFile}
            onFileSelect={handleFileSelect}
          />
        )}

        {mode === 'graph' && (
          <>
            {isLoading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-void/80">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-border-subtle border-t-accent" />
                  <span className="text-sm text-text-muted">Analizando flujo...</span>
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
});

CodeFlowView.displayName = 'CodeFlowView';
