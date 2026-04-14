import { useCallback } from 'react';
import { Instances, Instance } from '@react-three/drei';
import { type ThreeEvent } from '@react-three/fiber';
import type { CityBuilding } from '../../lib/city-layout';

interface Props {
  buildings: CityBuilding[];
  onHover: (nodeId: string | null) => void;
  onClick: (nodeId: string) => void;
  hoveredNodeId: string | null;
}

function toHexString(hexInt: number): string {
  return `#${hexInt.toString(16).padStart(6, '0')}`;
}

function brighten(hexInt: number): string {
  const r = Math.min(255, ((hexInt >> 16) & 0xff) + 80);
  const g = Math.min(255, ((hexInt >> 8) & 0xff) + 80);
  const b = Math.min(255, (hexInt & 0xff) + 80);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export function CityBuildings({ buildings, onHover, onClick, hoveredNodeId }: Props) {
  const handlePointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>, nodeId: string) => {
      e.stopPropagation();
      onHover(nodeId);
    },
    [onHover],
  );

  const handlePointerLeave = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      onHover(null);
    },
    [onHover],
  );

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>, nodeId: string) => {
      e.stopPropagation();
      onClick(nodeId);
    },
    [onClick],
  );

  if (buildings.length === 0) return null;

  return (
    <Instances limit={buildings.length} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial />
      {buildings.map(b => (
        <Instance
          key={b.nodeId}
          position={[b.x, b.height / 2, b.z]}
          scale={[b.width, b.height, b.depth]}
          color={b.nodeId === hoveredNodeId ? brighten(b.colorHex) : toHexString(b.colorHex)}
          onPointerMove={(e: ThreeEvent<PointerEvent>) => handlePointerMove(e, b.nodeId)}
          onPointerLeave={handlePointerLeave}
          onClick={(e: ThreeEvent<MouseEvent>) => handleClick(e, b.nodeId)}
        />
      ))}
    </Instances>
  );
}
