import { useState, useMemo, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { buildCityLayout, type CityMetric, type CityBuilding } from '../lib/city-layout';
import { CityBuildings } from './city/CityBuildings';
import { CityDistricts } from './city/CityDistricts';
import { CityTooltip } from './city/CityTooltip';
import type { GraphNode, GraphRelationship } from 'gitnexus-shared';

export interface CityViewHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
}

interface Props {
  nodes: GraphNode[];
  relationships: GraphRelationship[];
  metric: CityMetric;
  onNodeClick: (nodeId: string) => void;
  isActive: boolean;
}

// Componente interno que vive dentro del Canvas y accede a useThree
const CityControls = forwardRef<CityViewHandle>((_, ref) => {
  const { camera } = useThree();

  useImperativeHandle(ref, () => ({
    zoomIn: () => {
      camera.position.multiplyScalar(0.75);
    },
    zoomOut: () => {
      camera.position.multiplyScalar(1.33);
    },
    resetZoom: () => {
      camera.position.set(40, 40, 40);
    },
  }));

  return <OrbitControls enableDamping dampingFactor={0.05} minDistance={5} maxDistance={500} />;
});

export const CityView = forwardRef<CityViewHandle, Props>(
  ({ nodes, relationships, metric, onNodeClick, isActive }, ref) => {
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
          isActive={isActive}
          metric={metric}
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

        <CityControls ref={ref} />
      </Canvas>
    );
  },
);
