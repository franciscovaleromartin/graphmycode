import { useState, useMemo, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { GitBranch, Layers } from '@/lib/lucide-icons';
import { buildCityLayout, type CityMetric, type CityBuilding } from '../lib/city-layout';
import { CityBuildings } from './city/CityBuildings';
import { CityDistricts } from './city/CityDistricts';
import { CityTooltip } from './city/CityTooltip';
import type { GraphNode, GraphRelationship } from 'gitnexus-shared';

interface Props {
  nodes: GraphNode[];
  relationships: GraphRelationship[];
  onNodeClick: (nodeId: string) => void;
}

export function CityView({ nodes, relationships, onNodeClick }: Props) {
  const [metric, setMetric] = useState<CityMetric>('degree');
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  const buildings = useMemo(
    () => buildCityLayout(nodes, relationships, metric),
    [nodes, relationships, metric],
  );

  const nodeMap = useMemo(
    () => new Map(nodes.map(n => [n.id, n])),
    [nodes],
  );

  const hoveredBuilding: CityBuilding | null = useMemo(
    () => (hoveredNodeId ? (buildings.find(b => b.nodeId === hoveredNodeId) ?? null) : null),
    [hoveredNodeId, buildings],
  );

  const hoveredNode = hoveredNodeId ? nodeMap.get(hoveredNodeId) : undefined;

  const getRawMetric = useCallback(
    (nodeId: string): number => {
      if (metric === 'degree') {
        return relationships.filter(r => r.sourceId === nodeId || r.targetId === nodeId).length;
      }
      const node = nodeMap.get(nodeId);
      return (node?.properties.filePath ?? '').split('/').length - 1;
    },
    [metric, relationships, nodeMap],
  );

  return (
    <div className="relative h-full w-full">
      {/* Three.js canvas — ocupa todo el espacio */}
      <Canvas
        camera={{ position: [40, 40, 40], fov: 60, near: 0.1, far: 2000 }}
        gl={{ antialias: true, alpha: false }}
        style={{ background: '#0d0d1a', display: 'block', width: '100%', height: '100%' }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[50, 80, 30]} intensity={1.2} />

        <CityDistricts buildings={buildings} />
        <CityBuildings
          buildings={buildings}
          onHover={setHoveredNodeId}
          onClick={onNodeClick}
          hoveredNodeId={hoveredNodeId}
        />

        {hoveredBuilding && hoveredNode && (
          <CityTooltip
            building={hoveredBuilding}
            nodeName={hoveredNode.properties.name}
            nodeLabel={hoveredNode.label}
            metricLabel={metric === 'degree' ? 'Conexiones' : 'Profundidad'}
            metricValue={getRawMetric(hoveredNode.id)}
          />
        )}

        <OrbitControls enableDamping dampingFactor={0.05} minDistance={5} maxDistance={500} />
      </Canvas>

      {/* Selector de métrica — sibling del Canvas, z-index alto para capturar clicks */}
      <div
        style={{ position: 'absolute', top: '1rem', right: '1rem', zIndex: 50, pointerEvents: 'auto' }}
        className="flex overflow-hidden rounded-lg border border-white/10 bg-gray-900/95 shadow-lg backdrop-blur-sm"
      >
        <button
          onClick={() => setMetric('degree')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
            metric === 'degree'
              ? 'bg-white/15 text-white'
              : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
          }`}
          title="Altura = número de conexiones del nodo"
        >
          <GitBranch className="h-3 w-3" />
          Conexiones
        </button>
        <div className="w-px bg-white/10" />
        <button
          onClick={() => setMetric('depth')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
            metric === 'depth'
              ? 'bg-white/15 text-white'
              : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
          }`}
          title="Altura = profundidad en el árbol de directorios"
        >
          <Layers className="h-3 w-3" />
          Profundidad
        </button>
      </div>
    </div>
  );
}
