// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

import {
  forwardRef,
  memo,
  useImperativeHandle,
  useRef,
  useState,
  useEffect,
  useMemo,
  useCallback,
} from 'react';
import * as d3 from 'd3';
import type { GraphNode } from 'gitnexus-shared';
import type { KnowledgeGraph } from '../core/graph/types';
import {
  detectLayer,
  groupNodesByLayer,
  computeLayerStats,
  LANE_ORDER,
  LAYER_ORDER,
  type LayerName,
} from '../lib/layerDetection';
import { computeImpact, enrichWithLayers, type ImpactResult } from '../lib/diffImpact';
import { findShortestPath } from '../lib/pathFinder';

// ── Constantes de layout ─────────────────────────────────────────────────────

const LANE_WIDTH = 180;
const LANE_HEADER_H = 48;
const NODE_RADIUS = 8;
const NODE_V_SPACING = 40;
const NODE_PADDING_TOP = 16;

// ── Colores por capa ─────────────────────────────────────────────────────────

const LAYER_COLORS: Record<LayerName, string> = {
  api: '#818cf8',
  service: '#34d399',
  data: '#f472b6',
  ui: '#60a5fa',
  utility: '#fbbf24',
  config: '#94a3b8',
  test: '#a78bfa',
  unknown: '#6b7280',
};

// ── Tipos internos de layout ─────────────────────────────────────────────────

interface LayoutNode {
  node: GraphNode;
  layer: LayerName;
  laneIndex: number;
  x: number;
  y: number;
}

// Curvas de bezier cúbicas para canvas (sin path string)
interface LayoutEdge {
  id: string;
  sourceId: string;
  targetId: string;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  cp1x: number;
  cp1y: number;
  cp2x: number;
  cp2y: number;
  kind: 'intra' | 'cross-down' | 'cross-up';
}

// ── Handle público ───────────────────────────────────────────────────────────

export interface ArchitecturalLayersViewHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  setDiffModeActive: (active: boolean) => void;
}

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  graph: KnowledgeGraph;
  onNodeClick: (node: GraphNode) => void;
  isActive?: boolean;
}

// ── Tipos de relación renderizadas ───────────────────────────────────────────

const RENDER_RELATION_TYPES = new Set(['IMPORTS', 'CALLS', 'USES', 'CONTAINS', 'DEFINES']);

// ── Estilo de arista ─────────────────────────────────────────────────────────

function getEdgeStyle(kind: LayoutEdge['kind']) {
  switch (kind) {
    case 'intra':      return { stroke: 'rgba(255,255,255,0.12)', width: 1,   dashed: false };
    case 'cross-down': return { stroke: '#6366f1',                width: 1.5, dashed: false };
    case 'cross-up':   return { stroke: '#f97316',                width: 2,   dashed: true  };
  }
}

// ── Componente ───────────────────────────────────────────────────────────────

export const ArchitecturalLayersView = memo(
  forwardRef<ArchitecturalLayersViewHandle, Props>(
    ({ graph, onNodeClick, isActive: _isActive }, ref) => {
      // ── Estado local ──────────────────────────────────────────────────────
      const [diffModeActive, setDiffModeActive] = useState(false);
      const [selectedForDiff, setSelectedForDiff] = useState<Set<string>>(new Set());
      const [pathFrom, setPathFrom] = useState<string | null>(null);
      const [pathResult, setPathResult] = useState<string[] | null>(null);
      const [impactResult, setImpactResult] = useState<ImpactResult | null>(null);
      const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
      const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

      // ── Refs ──────────────────────────────────────────────────────────────
      const canvasRef = useRef<HTMLCanvasElement>(null);
      const containerRef = useRef<HTMLDivElement>(null);
      const zoomRef = useRef<d3.ZoomBehavior<HTMLDivElement, unknown> | null>(null);
      const pathFromRef = useRef<string | null>(null);
      const diffModeActiveRef = useRef(false);
      const pointerStartRef = useRef<{ x: number; y: number } | null>(null);

      // ── Layout (useMemo) ──────────────────────────────────────────────────

      const {
        layoutNodes,
        layoutEdges,
        svgHeight,
        layerStats,
        nodeLayerMap,
        nodeNameMap,
        activeLanes,
      } = useMemo(() => {
        const filteredNodes = graph.nodes.filter(
          (n) => n.label !== 'Community' && n.label !== 'Project',
        );

        const fanIn = new Map<string, number>();
        for (const rel of graph.relationships) {
          fanIn.set(rel.targetId, (fanIn.get(rel.targetId) ?? 0) + 1);
        }

        const grouped = groupNodesByLayer(filteredNodes);
        const activeLanes: LayerName[] = LANE_ORDER.filter((l) => (grouped.get(l)?.length ?? 0) > 0);

        const nodeLayerMap = new Map<string, LayerName>();
        const nodeNameMap = new Map<string, string>();
        for (const node of filteredNodes) {
          const layer = detectLayer(node);
          nodeLayerMap.set(node.id, layer);
          nodeNameMap.set(node.id, node.properties.name ?? node.label);
        }

        const layoutNodes: LayoutNode[] = [];
        let maxNodesInLane = 0;

        for (const [laneIndex, layer] of activeLanes.entries()) {
          const nodesInLane = (grouped.get(layer) ?? []).slice().sort(
            (a, b) => (fanIn.get(b.id) ?? 0) - (fanIn.get(a.id) ?? 0),
          );
          if (nodesInLane.length > maxNodesInLane) maxNodesInLane = nodesInLane.length;

          for (const [i, node] of nodesInLane.entries()) {
            const x = laneIndex * LANE_WIDTH + LANE_WIDTH / 2;
            const y = LANE_HEADER_H + NODE_PADDING_TOP + i * NODE_V_SPACING + NODE_RADIUS;
            layoutNodes.push({ node, layer, laneIndex, x, y });
          }
        }

        const svgHeight =
          LANE_HEADER_H + NODE_PADDING_TOP + maxNodesInLane * NODE_V_SPACING + NODE_RADIUS + 24;

        const posMap = new Map<string, { x: number; y: number }>();
        for (const ln of layoutNodes) posMap.set(ln.node.id, { x: ln.x, y: ln.y });

        const seenEdges = new Set<string>();
        const layoutEdges: LayoutEdge[] = [];

        for (const rel of graph.relationships) {
          if (!RENDER_RELATION_TYPES.has(rel.type)) continue;

          const src = posMap.get(rel.sourceId);
          const tgt = posMap.get(rel.targetId);
          if (!src || !tgt) continue;

          const edgeKey = `${rel.sourceId}→${rel.targetId}`;
          if (seenEdges.has(edgeKey)) continue;
          seenEdges.add(edgeKey);

          const srcLayer = nodeLayerMap.get(rel.sourceId);
          const tgtLayer = nodeLayerMap.get(rel.targetId);

          let kind: LayoutEdge['kind'] = 'intra';
          if (srcLayer && tgtLayer && srcLayer !== tgtLayer) {
            kind = LAYER_ORDER[srcLayer] < LAYER_ORDER[tgtLayer] ? 'cross-down' : 'cross-up';
          }

          const { x: sx, y: sy } = src;
          const { x: tx, y: ty } = tgt;
          let cp1x: number, cp1y: number, cp2x: number, cp2y: number;

          if (kind === 'intra') {
            cp1x = sx + 40; cp1y = sy;
            cp2x = tx + 40; cp2y = ty;
          } else {
            const mx = (sx + tx) / 2;
            cp1x = mx; cp1y = sy;
            cp2x = mx; cp2y = ty;
          }

          layoutEdges.push({
            id: edgeKey, sourceId: rel.sourceId, targetId: rel.targetId,
            sx, sy, tx, ty, cp1x, cp1y, cp2x, cp2y, kind,
          });
        }

        const layerStats = computeLayerStats(filteredNodes, graph.relationships);

        return { layoutNodes, layoutEdges, svgHeight, layerStats, nodeLayerMap, nodeNameMap, activeLanes };
      }, [graph.nodes, graph.relationships]);

      // ── Recalcular impacto ────────────────────────────────────────────────

      useEffect(() => {
        if (!diffModeActive || selectedForDiff.size === 0) {
          setImpactResult(null);
          return;
        }
        const raw = computeImpact(selectedForDiff, graph.relationships);
        setImpactResult(enrichWithLayers(raw, nodeLayerMap));
      }, [diffModeActive, selectedForDiff, graph.relationships, nodeLayerMap]);

      // Sincronizar refs con estado (para handlers estables)
      useEffect(() => { pathFromRef.current = pathFrom; }, [pathFrom]);
      useEffect(() => { diffModeActiveRef.current = diffModeActive; }, [diffModeActive]);

      // ── Color de nodo ─────────────────────────────────────────────────────

      const getNodeColor = useCallback(
        (nodeId: string, layer: LayerName): { fill: string; opacity: number } => {
          if (diffModeActive && impactResult) {
            if (impactResult.direct.has(nodeId)) return { fill: '#ef4444', opacity: 1 };
            if (impactResult.hop1.has(nodeId)) return { fill: '#f97316', opacity: 1 };
            if (impactResult.transitive.has(nodeId)) return { fill: '#eab308', opacity: 1 };
            return { fill: LAYER_COLORS[layer], opacity: 0.15 };
          }
          if (selectedForDiff.has(nodeId)) return { fill: '#ef4444', opacity: 1 };
          if (pathFrom === nodeId) return { fill: '#a78bfa', opacity: 1 };
          if (pathResult?.includes(nodeId)) return { fill: '#34d399', opacity: 1 };
          return { fill: LAYER_COLORS[layer], opacity: 1 };
        },
        [diffModeActive, impactResult, selectedForDiff, pathFrom, pathResult],
      );

      // ── D3-zoom sobre el contenedor ────────────────────────────────────────

      useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const zoom = d3.zoom<HTMLDivElement, unknown>()
          .scaleExtent([0.1, 5])
          .on('zoom', (event: d3.D3ZoomEvent<HTMLDivElement, unknown>) => {
            setTransform({
              x: event.transform.x,
              y: event.transform.y,
              k: event.transform.k,
            });
          });

        d3.select(container).call(zoom);
        zoomRef.current = zoom;

        return () => {
          d3.select(container).on('.zoom', null);
        };
      }, []);

      // ── Handle público ────────────────────────────────────────────────────

      useImperativeHandle(
        ref,
        () => ({
          zoomIn: () => {
            if (!containerRef.current || !zoomRef.current) return;
            d3.select(containerRef.current).transition().call(zoomRef.current.scaleBy, 1.3);
          },
          zoomOut: () => {
            if (!containerRef.current || !zoomRef.current) return;
            d3.select(containerRef.current).transition().call(zoomRef.current.scaleBy, 1 / 1.3);
          },
          resetZoom: () => {
            if (!containerRef.current || !zoomRef.current) return;
            d3.select(containerRef.current).transition().call(zoomRef.current.transform, d3.zoomIdentity);
          },
          setDiffModeActive: (active: boolean) => {
            setDiffModeActive(active);
          },
        }),
        [],
      );

      // ── Dibujo en canvas ──────────────────────────────────────────────────

      useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx || !canvas) return;

        const dpr = window.devicePixelRatio || 1;
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;

        // Redimensionar canvas si es necesario (auto-limpia el contenido)
        const targetW = Math.round(w * dpr);
        const targetH = Math.round(h * dpr);
        if (canvas.width !== targetW) canvas.width = targetW;
        if (canvas.height !== targetH) canvas.height = targetH;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.translate(transform.x, transform.y);
        ctx.scale(transform.k, transform.k);

        // ── Fondos de carriles ────────────────────────────────────────────
        for (const [laneIndex, layer] of activeLanes.entries()) {
          ctx.fillStyle = laneIndex % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.04)';
          ctx.fillRect(laneIndex * LANE_WIDTH, 0, LANE_WIDTH, svgHeight);
        }

        // ── Headers de carriles ───────────────────────────────────────────
        for (const [laneIndex, layer] of activeLanes.entries()) {
          ctx.fillStyle = LAYER_COLORS[layer] + '22';
          ctx.fillRect(laneIndex * LANE_WIDTH, 0, LANE_WIDTH, LANE_HEADER_H);

          ctx.fillStyle = LAYER_COLORS[layer];
          ctx.font = '600 12px system-ui, -apple-system, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(
            layer.toUpperCase(),
            laneIndex * LANE_WIDTH + LANE_WIDTH / 2,
            LANE_HEADER_H / 2,
          );
        }

        // ── Aristas ───────────────────────────────────────────────────────
        ctx.textAlign = 'left';
        for (const edge of layoutEdges) {
          const isOnPath =
            pathResult !== null &&
            pathResult.includes(edge.sourceId) &&
            pathResult.includes(edge.targetId);
          const style = getEdgeStyle(edge.kind);

          ctx.beginPath();
          ctx.moveTo(edge.sx, edge.sy);
          ctx.bezierCurveTo(edge.cp1x, edge.cp1y, edge.cp2x, edge.cp2y, edge.tx, edge.ty);
          ctx.strokeStyle = isOnPath ? '#34d399' : style.stroke;
          ctx.lineWidth = isOnPath ? 2.5 : style.width;
          ctx.globalAlpha = isOnPath ? 1 : 0.7;
          ctx.setLineDash(style.dashed ? [4, 3] : []);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.setLineDash([]);

        // ── Nodos ─────────────────────────────────────────────────────────
        ctx.font = '9px system-ui, -apple-system, sans-serif';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';

        for (const ln of layoutNodes) {
          const { fill, opacity } = getNodeColor(ln.node.id, ln.layer);
          const name = nodeNameMap.get(ln.node.id) ?? ln.node.label;
          const truncName = name.length > 18 ? name.slice(0, 17) + '…' : name;

          const isSelected = selectedForDiff.has(ln.node.id);
          const isPathNode = pathResult?.includes(ln.node.id) ?? false;
          const isPathFromNode = pathFrom === ln.node.id;

          // Halo de selección
          if (isSelected || isPathNode || isPathFromNode) {
            ctx.beginPath();
            ctx.arc(ln.x, ln.y, NODE_RADIUS + 4, 0, Math.PI * 2);
            ctx.strokeStyle = isPathNode ? '#34d399' : '#a78bfa';
            ctx.lineWidth = 1.5;
            ctx.globalAlpha = 0.7;
            ctx.setLineDash([]);
            ctx.stroke();
            ctx.globalAlpha = 1;
          }

          // Círculo principal
          ctx.beginPath();
          ctx.arc(ln.x, ln.y, NODE_RADIUS, 0, Math.PI * 2);
          ctx.fillStyle = fill;
          ctx.globalAlpha = opacity;
          ctx.fill();
          ctx.globalAlpha = 1;

          // Anillo hover
          if (ln.node.id === hoveredNodeId) {
            ctx.beginPath();
            ctx.arc(ln.x, ln.y, NODE_RADIUS + 2, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255,255,255,0.6)';
            ctx.lineWidth = 1;
            ctx.stroke();
          }

          // Label
          ctx.fillStyle = 'rgba(255,255,255,0.75)';
          ctx.fillText(truncName, ln.x + NODE_RADIUS + 4, ln.y);
        }

        ctx.restore();
      }, [
        transform,
        layoutNodes,
        layoutEdges,
        activeLanes,
        svgHeight,
        getNodeColor,
        nodeNameMap,
        selectedForDiff,
        pathResult,
        pathFrom,
        hoveredNodeId,
      ]);

      // ── Helpers de hit-testing ────────────────────────────────────────────

      const canvasToGraph = useCallback(
        (clientX: number, clientY: number) => {
          const canvas = canvasRef.current;
          if (!canvas) return { x: 0, y: 0 };
          const rect = canvas.getBoundingClientRect();
          return {
            x: (clientX - rect.left - transform.x) / transform.k,
            y: (clientY - rect.top - transform.y) / transform.k,
          };
        },
        [transform],
      );

      const getNodeAtPoint = useCallback(
        (x: number, y: number): LayoutNode | null => {
          const r2 = (NODE_RADIUS + 4) ** 2;
          for (let i = layoutNodes.length - 1; i >= 0; i--) {
            const ln = layoutNodes[i];
            const dx = ln.x - x;
            const dy = ln.y - y;
            if (dx * dx + dy * dy <= r2) return ln;
          }
          return null;
        },
        [layoutNodes],
      );

      // ── Handlers de mouse ──────────────────────────────────────────────────

      const handlePointerDown = useCallback((e: React.PointerEvent) => {
        pointerStartRef.current = { x: e.clientX, y: e.clientY };
      }, []);

      const handleCanvasClick = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
          // Ignorar si fue un drag
          if (pointerStartRef.current) {
            const dx = e.clientX - pointerStartRef.current.x;
            const dy = e.clientY - pointerStartRef.current.y;
            if (Math.sqrt(dx * dx + dy * dy) > 5) return;
          }

          const { x, y } = canvasToGraph(e.clientX, e.clientY);
          const ln = getNodeAtPoint(x, y);

          if (!ln) {
            setSelectedForDiff(new Set());
            setPathFrom(null);
            setPathResult(null);
            return;
          }

          if (e.shiftKey) {
            if (pathFromRef.current !== null && pathFromRef.current !== ln.node.id) {
              const path = findShortestPath(pathFromRef.current, ln.node.id, graph.relationships);
              setPathResult(path);
              setPathFrom(null);
            } else {
              setPathFrom(ln.node.id);
              setPathResult(null);
            }
            return;
          }

          if (diffModeActiveRef.current) {
            setSelectedForDiff((prev) => {
              const next = new Set(prev);
              if (next.has(ln.node.id)) next.delete(ln.node.id);
              else next.add(ln.node.id);
              return next;
            });
          } else {
            onNodeClick(ln.node);
          }
        },
        [canvasToGraph, getNodeAtPoint, graph.relationships, onNodeClick],
      );

      const handleMouseMove = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
          const { x, y } = canvasToGraph(e.clientX, e.clientY);
          const ln = getNodeAtPoint(x, y);
          setHoveredNodeId(ln?.node.id ?? null);
        },
        [canvasToGraph, getNodeAtPoint],
      );

      const handleMouseLeave = useCallback(() => setHoveredNodeId(null), []);

      // ── Estadísticas de capas ─────────────────────────────────────────────

      const sortedLayerStats = useMemo(
        () =>
          [...layerStats].sort(
            (a, b) => (LAYER_ORDER[a.layer] ?? 99) - (LAYER_ORDER[b.layer] ?? 99),
          ),
        [layerStats],
      );

      // ── Render ────────────────────────────────────────────────────────────

      if (!_isActive) return <div className="h-full w-full" />;

      return (
        <div className="flex h-full w-full overflow-hidden">
          {/* Área del canvas */}
          <div
            ref={containerRef}
            className="relative flex-1 overflow-hidden"
            style={{ cursor: hoveredNodeId ? 'pointer' : 'grab' }}
          >
            <canvas
              ref={canvasRef}
              className="h-full w-full"
              style={{ display: 'block' }}
              onPointerDown={handlePointerDown}
              onClick={handleCanvasClick}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            />
          </div>

          {/* Panel lateral derecho */}
          <div className="flex w-64 flex-shrink-0 flex-col gap-3 overflow-y-auto border-l border-white/10 bg-black/30 p-3 text-xs">

            {/* Sección Layers */}
            <div>
              <p className="mb-1.5 font-semibold uppercase tracking-wide text-white/50">Layers</p>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="text-white/40">
                    <th className="py-0.5 text-left font-normal">Layer</th>
                    <th className="py-0.5 text-right font-normal">Nodes</th>
                    <th className="py-0.5 text-right font-normal">X-deps</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedLayerStats.map((stat) => (
                    <tr key={stat.layer}>
                      <td className="py-0.5">
                        <span
                          className="mr-1.5 inline-block h-2 w-2 rounded-full"
                          style={{ background: LAYER_COLORS[stat.layer] }}
                        />
                        <span style={{ color: LAYER_COLORS[stat.layer] }}>{stat.layer}</span>
                      </td>
                      <td className="py-0.5 text-right text-white/70">{stat.nodeCount}</td>
                      <td className="py-0.5 text-right text-white/70">{stat.crossLayerDeps}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Sección Impact */}
            {diffModeActive && impactResult && (
              <div>
                <p className="mb-1.5 font-semibold uppercase tracking-wide text-white/50">Impact</p>
                <div className="flex flex-col gap-0.5">
                  <div className="flex justify-between">
                    <span className="text-red-400">Direct</span>
                    <span className="text-white/70">{impactResult.direct.size}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-orange-400">Hop-1</span>
                    <span className="text-white/70">{impactResult.hop1.size}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-yellow-400">Transitive</span>
                    <span className="text-white/70">{impactResult.transitive.size}</span>
                  </div>
                </div>
                {impactResult.byLayer.size > 0 && (
                  <div className="mt-2">
                    <p className="mb-1 text-white/30">By layer</p>
                    {[...impactResult.byLayer.entries()].map(([layer, count]) => (
                      <div key={layer} className="flex justify-between">
                        <span style={{ color: LAYER_COLORS[layer as LayerName] }}>{layer}</span>
                        <span className="text-white/70">{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Sección Path */}
            {pathResult !== null && (
              <div>
                <p className="mb-1.5 font-semibold uppercase tracking-wide text-white/50">
                  Path ({pathResult.length} nodes)
                </p>
                <ol className="flex flex-col gap-0.5">
                  {pathResult.map((nodeId, i) => (
                    <li key={nodeId} className="flex items-center gap-1">
                      <span className="text-white/30">{i + 1}.</span>
                      <span className="truncate text-green-400">
                        {nodeNameMap.get(nodeId) ?? nodeId}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Hints de uso */}
            <div className="mt-auto flex flex-col gap-1 text-white/25">
              <p>Click — select node</p>
              <p>Shift+click — path finder (2 nodes)</p>
              {diffModeActive && (
                <p className="text-indigo-400/60">Diff mode: click nodes to select impact sources</p>
              )}
              <p>Click background — clear selection</p>
            </div>
          </div>
        </div>
      );
    },
  ),
);

ArchitecturalLayersView.displayName = 'ArchitecturalLayersView';
