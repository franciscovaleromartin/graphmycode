// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// https://polyformproject.org/licenses/noncommercial/1.0.0

import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle, useState } from 'react';
import Graph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import noverlap from 'graphology-layout-noverlap';
import type { KnowledgeGraph } from '../core/graph/types';
import type { GraphNode } from 'gitnexus-shared';
import { computeHeatmapData, type HeatmapNode, type HeatmapEdge } from '../lib/heatmap-metrics';
import { useAppState } from '../hooks/useAppState';

export interface HeatmapViewHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  startLayout: () => void;
  stopLayout: () => void;
}

export type HeatmapFilterMode = 'all' | 'hot' | 'cold';

interface Props {
  graph: KnowledgeGraph;
  onNodeClick: (node: GraphNode) => void;
  onLayoutStateChange?: (running: boolean) => void;
  isActive?: boolean;
  filter?: HeatmapFilterMode;
}

interface Stats {
  nodes: number;
  edges: number;
  critical: number;
  cycles: number;
}

// ── Color helpers ───────────────────────────────────────────────────────────

function heatColor(t: number): string {
  const c = Math.max(0, Math.min(1, t));
  if (c < 0.25) {
    const h = 210 + (1 - c) * 20;
    const l = 30 + c * 20;
    return `hsl(${h.toFixed(1)},75%,${l.toFixed(1)}%)`;
  } else if (c < 0.5) {
    const h = 40 - c * 60;
    return `hsl(${h.toFixed(1)},80%,45%)`;
  } else if (c < 0.75) {
    const h = 20 - c * 10;
    return `hsl(${h.toFixed(1)},85%,45%)`;
  } else {
    const l = 35 + (1 - c) * 10;
    return `hsl(5,80%,${l.toFixed(1)}%)`;
  }
}

function nodeRadius(degree: number): number {
  return Math.min(28, Math.max(7, 7 + degree * 1.4));
}

function baseName(filePath: string, fallback: string): string {
  const file = (filePath || fallback).split('/').pop() ?? fallback;
  return file.replace(/\.[^.]+$/, '');
}

function rootGroup(filePath: string, fallback: string): string {
  return (filePath || fallback).split('/').filter(Boolean)[0] ?? '.';
}

// ── FA2 custom settings ──────────────────────────────────────────────────────

const FA2_SETTINGS = {
  scalingRatio: 10,
  gravity: 0.003,
  slowDown: 5,
  edgeWeightInfluence: 1,
  barnesHutOptimize: false,
};

// ── Component ───────────────────────────────────────────────────────────────

export const HeatmapView = forwardRef<HeatmapViewHandle, Props>(
  ({ graph, onNodeClick, onLayoutStateChange, isActive, filter = 'all' }, ref) => {
    const { isSidebarCollapsed } = useAppState();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const gRef = useRef<Graph | null>(null);
    const nodesRef = useRef<HeatmapNode[]>([]);
    const edgesRef = useRef<HeatmapEdge[]>([]);
    const maxDegreeRef = useRef(0);
    const rafRef = useRef<number>(0);
    const isRunningRef = useRef(false);
    const layoutFrameCountRef = useRef(0);
    const filterRef = useRef<HeatmapFilterMode>('all');

    const [stats, setStats] = useState<Stats>({ nodes: 0, edges: 0, critical: 0, cycles: 0 });

    // Camera state
    const cameraRef = useRef({ x: 0, y: 0, scale: 0.6 });

    // Sincronizar el filtro prop → ref para que el render loop lo lea sin re-render
    useEffect(() => { filterRef.current = filter; }, [filter]);

    // Tooltip & hover state
    const tooltipRef = useRef<{ node: HeatmapNode; px: number; py: number } | null>(null);
    const hoveredNodeRef = useRef<string | null>(null);

    // ── Build graphology graph from KnowledgeGraph ───────────────────────────
    const buildGraph = useCallback(() => {
      const data = computeHeatmapData(graph);
      nodesRef.current = data.nodes;
      edgesRef.current = data.edges;
      maxDegreeRef.current = data.maxDegree;

      const g = new Graph({ type: 'directed', multi: false });
      const canvas = canvasRef.current;
      const W = canvas?.width ?? 800;
      const H = canvas?.height ?? 600;

      data.nodes.forEach(n => {
        g.addNode(n.id, {
          x: (Math.random() - 0.5) * W * 0.8,
          y: (Math.random() - 0.5) * H * 0.8,
          size: nodeRadius(n.degree),
        });
      });
      data.edges.forEach(e => {
        if (g.hasNode(e.source) && g.hasNode(e.target) && !g.hasEdge(e.source, e.target)) {
          g.addEdge(e.source, e.target, { weight: e.weight });
        }
      });

      FA2_SETTINGS.barnesHutOptimize = g.order > 100;
      gRef.current = g;

      const maxDeg = data.maxDegree;
      setStats({
        nodes: data.nodes.length,
        edges: data.edges.length,
        critical: data.nodes.filter(n => n.degree >= maxDeg * 0.6).length,
        cycles: data.bidirectionalCount,
      });
    }, [graph]);

    // ── Tooltip drawing ──────────────────────────────────────────────────────
    function drawTooltip(
      ctx: CanvasRenderingContext2D,
      node: HeatmapNode,
      px: number,
      py: number,
      W: number,
      H: number,
    ) {
      const padding = 12;
      const lineH = 18;
      const biCount = edgesRef.current.filter(
        e => e.isBidirectional && (e.source === node.id || e.target === node.id),
      ).length;

      const displayName = node.filePath || node.name;
      const group = rootGroup(node.filePath, node.name);

      const lines: Array<{ text: string; color: string; bold?: boolean }> = [
        { text: displayName, color: '#f0f0f0', bold: true },
        { text: `Grado: ${node.degree} deps`, color: '#94a3b8' },
        { text: `Grupo: ${group}`, color: '#94a3b8' },
        ...(biCount > 0 ? [{ text: `⚠ ${biCount} ciclo(s)`, color: '#f97316' }] : []),
      ];

      const boxW = 210;
      const boxH = padding * 2 + lines.length * lineH;
      let bx = px + 14;
      let by = py - boxH / 2;
      if (bx + boxW > W - 8) bx = px - boxW - 14;
      if (by < 8) by = 8;
      if (by + boxH > H - 8) by = H - boxH - 8;

      ctx.save();
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 1;
      ctx.beginPath();
      (ctx as CanvasRenderingContext2D & { roundRect: (...args: unknown[]) => void }).roundRect(
        bx, by, boxW, boxH, 8,
      );
      ctx.fill();
      ctx.stroke();

      lines.forEach((line, i) => {
        ctx.font = line.bold ? 'bold 12px monospace' : '11px monospace';
        ctx.fillStyle = line.color;
        ctx.fillText(
          line.text,
          bx + padding,
          by + padding + lineH * i + lineH * 0.7,
          boxW - padding * 2,
        );
      });
      ctx.restore();
    }

    // ── Render loop ──────────────────────────────────────────────────────────
    const render = useCallback(() => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      const g = gRef.current;
      if (!canvas || !ctx || !g) {
        rafRef.current = requestAnimationFrame(render);
        return;
      }

      const W = canvas.width;
      const H = canvas.height;
      const cam = cameraRef.current;
      const maxDeg = maxDegreeRef.current;
      const currentFilter = filterRef.current;

      // Run layout step — 200 ticks con ralentización progresiva
      if (isRunningRef.current && g.order > 0) {
        const frame = layoutFrameCountRef.current;
        const fa2Iters = frame < 150 ? 3 : frame < 200 ? 1 : 0;
        const noverlapIters = frame < 150 ? 5 : frame < 200 ? 2 : 0;

        if (fa2Iters > 0) {
          forceAtlas2.assign(g, { iterations: fa2Iters, settings: FA2_SETTINGS });
        }
        if (noverlapIters > 0) {
          noverlap.assign(g, {
            maxIterations: noverlapIters,
            settings: { ratio: 1.2, margin: 8 },
          });
        }

        layoutFrameCountRef.current += 1;
        if (frame >= 200) {
          isRunningRef.current = false;
          onLayoutStateChange?.(false);
        }
      }

      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.translate(W / 2 + cam.x, H / 2 + cam.y);
      ctx.scale(cam.scale, cam.scale);

      // Conjunto de nodos visibles según filtro
      const visibleIds = new Set(
        nodesRef.current
          .filter(n => {
            if (currentFilter === 'hot') return n.degree >= maxDeg * 0.5;
            if (currentFilter === 'cold') return n.degree < maxDeg * 0.35;
            return true;
          })
          .map(n => n.id),
      );

      // Draw edges
      edgesRef.current.forEach(e => {
        if (!g.hasNode(e.source) || !g.hasNode(e.target)) return;
        if (!visibleIds.has(e.source) || !visibleIds.has(e.target)) return;
        const srcAttr = g.getNodeAttributes(e.source);
        const tgtAttr = g.getNodeAttributes(e.target);
        ctx.beginPath();
        ctx.moveTo(srcAttr.x as number, srcAttr.y as number);
        ctx.lineTo(tgtAttr.x as number, tgtAttr.y as number);
        if (e.isBidirectional) {
          ctx.strokeStyle = 'rgba(231,76,60,0.6)';
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 3]);
        } else {
          ctx.strokeStyle = 'rgba(255,255,255,0.12)';
          ctx.lineWidth = 1;
          ctx.setLineDash([]);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      });

      // Glow para nodos calientes (antes de dibujar el nodo)
      nodesRef.current.forEach(n => {
        if (!g.hasNode(n.id) || !visibleIds.has(n.id)) return;
        if (n.degree < maxDeg * 0.5) return;
        const attr = g.getNodeAttributes(n.id);
        const r = nodeRadius(n.degree);
        const grd = ctx.createRadialGradient(
          attr.x as number, attr.y as number, r,
          attr.x as number, attr.y as number, r * 3,
        );
        grd.addColorStop(0, 'rgba(231,76,60,0.25)');
        grd.addColorStop(1, 'rgba(231,76,60,0)');
        ctx.beginPath();
        ctx.arc(attr.x as number, attr.y as number, r * 3, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();
      });

      // Draw nodes + labels
      nodesRef.current.forEach(n => {
        if (!g.hasNode(n.id) || !visibleIds.has(n.id)) return;
        const attr = g.getNodeAttributes(n.id);
        const r = nodeRadius(n.degree);
        const isHovered = hoveredNodeRef.current === n.id;

        ctx.beginPath();
        ctx.arc(attr.x as number, attr.y as number, isHovered ? r + 2 : r, 0, Math.PI * 2);
        ctx.fillStyle = heatColor(n.normalizedDegree);
        ctx.fill();

        if (isHovered) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // Label solo si radio > 12px
        if (r > 12) {
          const label = baseName(n.filePath, n.name);
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.font = '10px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(label, attr.x as number, (attr.y as number) + r + 13);
          ctx.textAlign = 'left';
        }
      });

      ctx.restore();

      // Tooltip en coordenadas de pantalla
      const tooltip = tooltipRef.current;
      if (tooltip) {
        drawTooltip(ctx, tooltip.node, tooltip.px, tooltip.py, W, H);
      }

      rafRef.current = requestAnimationFrame(render);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── World <-> Screen coords ──────────────────────────────────────────────
    function screenToWorld(sx: number, sy: number) {
      const canvas = canvasRef.current!;
      const cam = cameraRef.current;
      return {
        x: (sx - canvas.width / 2 - cam.x) / cam.scale,
        y: (sy - canvas.height / 2 - cam.y) / cam.scale,
      };
    }

    function hitTestNode(wx: number, wy: number): HeatmapNode | null {
      const g = gRef.current;
      if (!g) return null;
      const maxDeg = maxDegreeRef.current;
      const currentFilter = filterRef.current;
      for (const n of nodesRef.current) {
        if (!g.hasNode(n.id)) continue;
        // Respetar filtro activo en hit testing
        if (currentFilter === 'hot' && n.degree < maxDeg * 0.5) continue;
        if (currentFilter === 'cold' && n.degree >= maxDeg * 0.35) continue;
        const attr = g.getNodeAttributes(n.id);
        const r = nodeRadius(n.degree);
        const dx = wx - (attr.x as number);
        const dy = wy - (attr.y as number);
        if (dx * dx + dy * dy <= (r + 4) * (r + 4)) return n;
      }
      return null;
    }

    // ── Mouse events ─────────────────────────────────────────────────────────
    const isDraggingRef = useRef(false);
    const lastMouseRef = useRef({ x: 0, y: 0 });
    const mouseDownPosRef = useRef({ x: 0, y: 0 });

    function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
      isDraggingRef.current = true;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
      mouseDownPosRef.current = { x: e.clientX, y: e.clientY };
    }

    function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      if (isDraggingRef.current) {
        const dx = e.clientX - lastMouseRef.current.x;
        const dy = e.clientY - lastMouseRef.current.y;
        cameraRef.current.x += dx;
        cameraRef.current.y += dy;
        lastMouseRef.current = { x: e.clientX, y: e.clientY };
        tooltipRef.current = null;
        hoveredNodeRef.current = null;
        return;
      }

      const { x: wx, y: wy } = screenToWorld(sx, sy);
      const hit = hitTestNode(wx, wy);
      hoveredNodeRef.current = hit?.id ?? null;
      if (hit) {
        tooltipRef.current = { node: hit, px: sx, py: sy };
        canvas.style.cursor = 'pointer';
      } else {
        tooltipRef.current = null;
        canvas.style.cursor = 'grab';
      }
    }

    function handleMouseUp(e: React.MouseEvent<HTMLCanvasElement>) {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;

      const dx = Math.abs(e.clientX - mouseDownPosRef.current.x);
      const dy = Math.abs(e.clientY - mouseDownPosRef.current.y);
      if (dx > 4 || dy > 4) return;

      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const { x: wx, y: wy } = screenToWorld(sx, sy);
      const hit = hitTestNode(wx, wy);
      if (hit) {
        const graphNode = graph.nodes.find(n => n.id === hit.id);
        if (graphNode) onNodeClick(graphNode);
      }
    }

    function handleWheel(e: React.WheelEvent<HTMLCanvasElement>) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      cameraRef.current.scale = Math.max(0.1, Math.min(10, cameraRef.current.scale * factor));
    }

    // ── Resize observer ──────────────────────────────────────────────────────
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ro = new ResizeObserver(() => {
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
      });
      ro.observe(canvas);
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      return () => ro.disconnect();
    }, []);

    // ── Init on graph change ─────────────────────────────────────────────────
    useEffect(() => {
      buildGraph();
    }, [buildGraph]);

    // ── Perturbar posiciones ligeramente para forzar animación visible ────────
    const randomizePositions = () => {
      const g = gRef.current;
      if (!g) return;
      const jitter = 20;
      g.forEachNode((node) => {
        const x = g.getNodeAttribute(node, 'x') as number;
        const y = g.getNodeAttribute(node, 'y') as number;
        g.setNodeAttribute(node, 'x', x + (Math.random() - 0.5) * jitter);
        g.setNodeAttribute(node, 'y', y + (Math.random() - 0.5) * jitter);
      });
    };

    // ── Auto-play: arrancar layout cada vez que la vista se activa ───────────
    useEffect(() => {
      if (isActive) {
        randomizePositions();
        layoutFrameCountRef.current = 0;
        isRunningRef.current = true;
        onLayoutStateChange?.(true);
      } else {
        isRunningRef.current = false;
        onLayoutStateChange?.(false);
      }
    }, [isActive]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Start RAF loop ───────────────────────────────────────────────────────
    useEffect(() => {
      rafRef.current = requestAnimationFrame(render);
      return () => cancelAnimationFrame(rafRef.current);
    }, [render]);

    // ── Imperative handle ────────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      zoomIn: () => {
        cameraRef.current.scale = Math.min(10, cameraRef.current.scale * 1.25);
      },
      zoomOut: () => {
        cameraRef.current.scale = Math.max(0.1, cameraRef.current.scale / 1.25);
      },
      resetZoom: () => {
        cameraRef.current = { x: 0, y: 0, scale: 0.6 };
      },
      startLayout: () => {
        randomizePositions();
        layoutFrameCountRef.current = 0;
        isRunningRef.current = true;
        onLayoutStateChange?.(true);
      },
      stopLayout: () => {
        isRunningRef.current = false;
        onLayoutStateChange?.(false);
      },
    }));

    const handleReorganize = () => {
      randomizePositions();
      layoutFrameCountRef.current = 0;
      isRunningRef.current = true;
      onLayoutStateChange?.(true);
    };

    return (
      <div className="relative flex h-full w-full flex-col">

        {/* Canvas */}
        <canvas
          ref={canvasRef}
          className="min-h-0 w-full flex-1"
          style={{ cursor: 'grab' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => {
            isDraggingRef.current = false;
            tooltipRef.current = null;
            hoveredNodeRef.current = null;
          }}
          onWheel={handleWheel}
        />

        {/* Footer: leyenda de calor + stats — padding respeta sidebar (izq) y zoom controls (dcha) */}
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-t border-border-default bg-bg-surface py-2 pr-14"
          style={{ paddingLeft: isSidebarCollapsed ? 56 : 224 }}
        >
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">Bajo acoplamiento</span>
            <div
              style={{
                width: 120,
                height: 10,
                borderRadius: 4,
                background: 'linear-gradient(to right, #1d4e89, #2e86de, #f39c12, #e74c3c, #8e1a1a)',
                flexShrink: 0,
              }}
            />
            <span className="text-xs" style={{ color: '#e74c3c' }}>Alto acoplamiento</span>
          </div>
          <div className="flex gap-5">
            {(
              [
                { label: 'Módulos', value: stats.nodes },
                { label: 'Dependencias', value: stats.edges },
                { label: 'Módulos críticos', value: stats.critical },
                { label: 'Ciclos detectados', value: stats.cycles },
              ] as const
            ).map(({ label, value }) => (
              <div key={label} className="flex flex-col items-center">
                <span className="leading-none text-text-primary" style={{ fontSize: 18, fontWeight: 500 }}>
                  {value}
                </span>
                <span className="mt-0.5 text-text-muted" style={{ fontSize: 12 }}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  },
);

HeatmapView.displayName = 'HeatmapView';
