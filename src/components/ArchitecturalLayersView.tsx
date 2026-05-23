// Copyright (C) 2026 Francisco Alejandro Valero Martin
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

import {
  forwardRef,
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

// ── Constantes de layout ────────────────────────────────────────────────────

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

interface LayoutEdge {
  id: string;
  sourceId: string;
  targetId: string;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  kind: 'intra' | 'cross-down' | 'cross-up';
  path: string;
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

// ── Tipos de relación que se renderizan ──────────────────────────────────────

const RENDER_RELATION_TYPES = new Set(['IMPORTS', 'CALLS', 'USES', 'CONTAINS', 'DEFINES']);

// ── Componente ───────────────────────────────────────────────────────────────

export const ArchitecturalLayersView = forwardRef<ArchitecturalLayersViewHandle, Props>(
  ({ graph, onNodeClick, isActive: _isActive }, ref) => {
    // ── Estado local ──────────────────────────────────────────────────────
    const [diffModeActive, setDiffModeActive] = useState(false);
    const [selectedForDiff, setSelectedForDiff] = useState<Set<string>>(new Set());
    const [pathFrom, setPathFrom] = useState<string | null>(null);
    const [pathResult, setPathResult] = useState<string[] | null>(null);
    const [impactResult, setImpactResult] = useState<ImpactResult | null>(null);

    // ── Refs para D3-zoom ─────────────────────────────────────────────────
    const svgRef = useRef<SVGSVGElement>(null);
    const gRef = useRef<SVGGElement>(null);
    const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

    // ── Layout (useMemo) ──────────────────────────────────────────────────

    const {
      layoutNodes,
      layoutEdges,
      svgWidth,
      svgHeight,
      layerStats,
      nodeLayerMap,
      nodeNameMap,
      activeLanes,
    } = useMemo(() => {
      // Filtrar nodos Community y Project
      const filteredNodes = graph.nodes.filter(
        (n) => n.label !== 'Community' && n.label !== 'Project',
      );

      // Calcular fan-in por nodo
      const fanIn = new Map<string, number>();
      for (const rel of graph.relationships) {
        fanIn.set(rel.targetId, (fanIn.get(rel.targetId) ?? 0) + 1);
      }

      // Agrupar por capa
      const grouped = groupNodesByLayer(filteredNodes);

      // Carriles activos (solo los que tienen nodos), en orden LANE_ORDER
      const activeLanes: LayerName[] = LANE_ORDER.filter((l) => (grouped.get(l)?.length ?? 0) > 0);

      // nodeLayerMap y nodeNameMap
      const nodeLayerMap = new Map<string, LayerName>();
      const nodeNameMap = new Map<string, string>();
      for (const node of filteredNodes) {
        const layer = detectLayer(node);
        nodeLayerMap.set(node.id, layer);
        nodeNameMap.set(node.id, node.properties.name ?? node.label);
      }

      // Calcular posiciones
      const layoutNodes: LayoutNode[] = [];
      let maxNodesInLane = 0;

      for (const [laneIndex, layer] of activeLanes.entries()) {
        const nodesInLane = (grouped.get(layer) ?? []).slice().sort(
          (a, b) => (fanIn.get(b.id) ?? 0) - (fanIn.get(a.id) ?? 0),
        );

        if (nodesInLane.length > maxNodesInLane) maxNodesInLane = nodesInLane.length;

        for (const [indexInLane, node] of nodesInLane.entries()) {
          const x = laneIndex * LANE_WIDTH + LANE_WIDTH / 2;
          const y =
            LANE_HEADER_H + NODE_PADDING_TOP + indexInLane * NODE_V_SPACING + NODE_RADIUS;
          layoutNodes.push({ node, layer, laneIndex, x, y });
        }
      }

      const svgWidth = Math.max(800, activeLanes.length * LANE_WIDTH);
      const svgHeight =
        LANE_HEADER_H + NODE_PADDING_TOP + maxNodesInLane * NODE_V_SPACING + NODE_RADIUS + 24;

      // Mapa nodeId → posición
      const posMap = new Map<string, { x: number; y: number }>();
      for (const ln of layoutNodes) posMap.set(ln.node.id, { x: ln.x, y: ln.y });

      // Calcular aristas (sin duplicados)
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
          kind =
            LAYER_ORDER[srcLayer] < LAYER_ORDER[tgtLayer] ? 'cross-down' : 'cross-up';
        }

        const { x: sx, y: sy } = src;
        const { x: tx, y: ty } = tgt;

        let path: string;
        if (kind === 'intra') {
          path = `M ${sx} ${sy} C ${sx + 40} ${sy} ${tx + 40} ${ty} ${tx} ${ty}`;
        } else {
          const mx = (sx + tx) / 2;
          path = `M ${sx} ${sy} C ${mx} ${sy} ${mx} ${ty} ${tx} ${ty}`;
        }

        layoutEdges.push({ id: edgeKey, sourceId: rel.sourceId, targetId: rel.targetId, sx, sy, tx, ty, kind, path });
      }

      // Estadísticas de capas
      const layerStats = computeLayerStats(filteredNodes, graph.relationships);

      return {
        layoutNodes,
        layoutEdges,
        svgWidth,
        svgHeight,
        layerStats,
        nodeLayerMap,
        nodeNameMap,
        activeLanes,
      };
    }, [graph.nodes, graph.relationships]);

    // ── Recalcular impacto cuando cambia selección ────────────────────────

    useEffect(() => {
      if (!diffModeActive || selectedForDiff.size === 0) {
        setImpactResult(null);
        return;
      }
      const raw = computeImpact(selectedForDiff, graph.relationships);
      setImpactResult(enrichWithLayers(raw, nodeLayerMap));
    }, [diffModeActive, selectedForDiff, graph.relationships, nodeLayerMap]);

    // ── D3-zoom setup ─────────────────────────────────────────────────────

    useEffect(() => {
      if (!svgRef.current || !gRef.current) return;

      const zoom = d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.1, 5])
        .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
          if (gRef.current) {
            d3.select(gRef.current).attr('transform', event.transform.toString());
          }
        });

      d3.select(svgRef.current).call(zoom);
      zoomRef.current = zoom;

      return () => {
        d3.select(svgRef.current!).on('.zoom', null);
      };
    }, []);

    // ── Handle público ────────────────────────────────────────────────────

    useImperativeHandle(
      ref,
      () => ({
        zoomIn: () => {
          if (!svgRef.current || !zoomRef.current) return;
          d3.select(svgRef.current).transition().call(zoomRef.current.scaleBy, 1.3);
        },
        zoomOut: () => {
          if (!svgRef.current || !zoomRef.current) return;
          d3.select(svgRef.current).transition().call(zoomRef.current.scaleBy, 1 / 1.3);
        },
        resetZoom: () => {
          if (!svgRef.current || !zoomRef.current) return;
          d3.select(svgRef.current).transition().call(zoomRef.current.transform, d3.zoomIdentity);
        },
        setDiffModeActive: (active: boolean) => {
          setDiffModeActive(active);
        },
      }),
      [],
    );

    // ── Handlers de interacción ───────────────────────────────────────────

    const handleSvgClick = useCallback(
      (e: React.MouseEvent<SVGSVGElement>) => {
        // Solo desseleccionar si el click fue en el fondo (no en un nodo)
        if (e.target === e.currentTarget || (e.target as Element).tagName === 'rect') {
          setSelectedForDiff(new Set());
          setPathFrom(null);
          setPathResult(null);
        }
      },
      [],
    );

    const handleNodeClick = useCallback(
      (e: React.MouseEvent, nodeId: string) => {
        e.stopPropagation();

        if (e.shiftKey) {
          // Modo path finder: Shift+click
          if (pathFrom !== null && pathFrom !== nodeId) {
            const path = findShortestPath(pathFrom, nodeId, graph.relationships);
            setPathResult(path);
            setPathFrom(null);
          } else {
            setPathFrom(nodeId);
            setPathResult(null);
          }
          return;
        }

        if (diffModeActive) {
          // Añadir/quitar de selección diff
          setSelectedForDiff((prev) => {
            const next = new Set(prev);
            if (next.has(nodeId)) next.delete(nodeId);
            else next.add(nodeId);
            return next;
          });
        } else {
          const ln = layoutNodes.find((l) => l.node.id === nodeId);
          if (ln) onNodeClick(ln.node);
        }
      },
      [pathFrom, diffModeActive, graph.relationships, layoutNodes, onNodeClick],
    );

    // ── Color de nodo según modo ──────────────────────────────────────────

    const getNodeColor = useCallback(
      (nodeId: string, layer: LayerName): { fill: string; opacity: number } => {
        if (diffModeActive && impactResult) {
          if (impactResult.direct.has(nodeId)) return { fill: '#ef4444', opacity: 1 };
          if (impactResult.hop1.has(nodeId)) return { fill: '#f97316', opacity: 1 };
          if (impactResult.transitive.has(nodeId)) return { fill: '#eab308', opacity: 1 };
          return { fill: LAYER_COLORS[layer], opacity: 0.15 };
        }
        // Resaltar si está en el path o seleccionado para diff
        if (selectedForDiff.has(nodeId)) return { fill: '#ef4444', opacity: 1 };
        if (pathFrom === nodeId) return { fill: '#a78bfa', opacity: 1 };
        if (pathResult?.includes(nodeId)) return { fill: '#34d399', opacity: 1 };
        return { fill: LAYER_COLORS[layer], opacity: 1 };
      },
      [diffModeActive, impactResult, selectedForDiff, pathFrom, pathResult],
    );

    // ── Estilos de arista ─────────────────────────────────────────────────

    const getEdgeStyle = (kind: LayoutEdge['kind']) => {
      switch (kind) {
        case 'intra':
          return { stroke: 'rgba(255,255,255,0.12)', strokeWidth: 1, strokeDasharray: undefined };
        case 'cross-down':
          return { stroke: '#6366f1', strokeWidth: 1.5, strokeDasharray: undefined };
        case 'cross-up':
          return { stroke: '#f97316', strokeWidth: 2, strokeDasharray: '4 3' };
      }
    };

    // ── Estadísticas de capas ordenadas para el panel ─────────────────────

    const sortedLayerStats = useMemo(
      () =>
        [...layerStats].sort(
          (a, b) => (LAYER_ORDER[a.layer] ?? 99) - (LAYER_ORDER[b.layer] ?? 99),
        ),
      [layerStats],
    );

    // ── Render ────────────────────────────────────────────────────────────

    return (
      <div className="flex h-full w-full overflow-hidden">
        {/* Área del SVG */}
        <div className="relative flex-1 overflow-hidden">
          <svg
            ref={svgRef}
            width="100%"
            height="100%"
            onClick={handleSvgClick}
            style={{ background: 'transparent', cursor: 'grab' }}
          >
            <g ref={gRef}>
              {/* Fondos de carriles alternos */}
              {activeLanes.map((layer, laneIndex) => (
                <rect
                  key={`lane-bg-${layer}`}
                  x={laneIndex * LANE_WIDTH}
                  y={0}
                  width={LANE_WIDTH}
                  height={svgHeight}
                  fill={laneIndex % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.04)'}
                />
              ))}

              {/* Headers de carriles */}
              {activeLanes.map((layer, laneIndex) => (
                <g key={`lane-header-${layer}`}>
                  <rect
                    x={laneIndex * LANE_WIDTH}
                    y={0}
                    width={LANE_WIDTH}
                    height={LANE_HEADER_H}
                    fill={`${LAYER_COLORS[layer]}22`}
                  />
                  <text
                    x={laneIndex * LANE_WIDTH + LANE_WIDTH / 2}
                    y={LANE_HEADER_H / 2 + 5}
                    textAnchor="middle"
                    fill={LAYER_COLORS[layer]}
                    fontSize={12}
                    fontWeight={600}
                    style={{ userSelect: 'none' }}
                  >
                    {layer.toUpperCase()}
                  </text>
                </g>
              ))}

              {/* Aristas */}
              {layoutEdges.map((edge) => {
                const style = getEdgeStyle(edge.kind);
                const isOnPath =
                  pathResult !== null &&
                  pathResult.includes(edge.sourceId) &&
                  pathResult.includes(edge.targetId);
                return (
                  <path
                    key={edge.id}
                    d={edge.path}
                    fill="none"
                    stroke={isOnPath ? '#34d399' : style.stroke}
                    strokeWidth={isOnPath ? 2.5 : style.strokeWidth}
                    strokeDasharray={style.strokeDasharray}
                    opacity={isOnPath ? 1 : 0.7}
                  />
                );
              })}

              {/* Nodos con labels */}
              {layoutNodes.map((ln) => {
                const { fill, opacity } = getNodeColor(ln.node.id, ln.layer);
                const name = nodeNameMap.get(ln.node.id) ?? ln.node.label;
                const isSelected = selectedForDiff.has(ln.node.id);
                const isPathNode = pathResult?.includes(ln.node.id) ?? false;

                return (
                  <g
                    key={ln.node.id}
                    transform={`translate(${ln.x},${ln.y})`}
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => handleNodeClick(e, ln.node.id)}
                  >
                    {/* Halo de selección */}
                    {(isSelected || isPathNode || pathFrom === ln.node.id) && (
                      <circle
                        r={NODE_RADIUS + 4}
                        fill="none"
                        stroke={isPathNode ? '#34d399' : '#a78bfa'}
                        strokeWidth={1.5}
                        opacity={0.7}
                      />
                    )}
                    <circle r={NODE_RADIUS} fill={fill} opacity={opacity} />
                    <text
                      x={NODE_RADIUS + 4}
                      y={4}
                      fontSize={9}
                      fill="rgba(255,255,255,0.75)"
                      style={{ userSelect: 'none', pointerEvents: 'none' }}
                    >
                      {name.length > 18 ? `${name.slice(0, 17)}…` : name}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
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

          {/* Sección Impact (solo en diffMode con resultado) */}
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
                      <span style={{ color: LAYER_COLORS[layer] }}>{layer}</span>
                      <span className="text-white/70">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Sección Path (solo si hay resultado) */}
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
            {diffModeActive && <p className="text-indigo-400/60">Diff mode: click nodes to select impact sources</p>}
            <p>Click background — clear selection</p>
          </div>
        </div>
      </div>
    );
  },
);

ArchitecturalLayersView.displayName = 'ArchitecturalLayersView';
