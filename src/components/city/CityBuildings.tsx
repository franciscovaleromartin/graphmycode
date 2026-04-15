import { useCallback, useState, useRef, useEffect } from 'react';
import { Instances, Instance } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { type ThreeEvent } from '@react-three/fiber';
import type { CityBuilding } from '../../lib/city-layout';

const ANIM_DURATION = 2; // segundos

interface Props {
  buildings: CityBuilding[];
  onHover: (nodeId: string | null) => void;
  onClick: (nodeId: string) => void;
  hoveredNodeId: string | null;
  isActive: boolean;
  animVersion: number; // incrementar desde fuera para reiniciar la animación
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

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function CityBuildings({ buildings, onHover, onClick, hoveredNodeId, isActive, animVersion }: Props) {
  const [animProgress, setAnimProgress] = useState(0);
  const animRef = useRef({ startTime: null as number | null, running: false });

  // Se dispara al montar (incluido al remontar por cambio de key) y al cambiar animVersion
  useEffect(() => {
    if (isActive) {
      animRef.current.running = true;
      animRef.current.startTime = null;
      setAnimProgress(0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animVersion]);

  useFrame(({ clock }) => {
    if (!animRef.current.running) return;
    if (animRef.current.startTime === null) {
      animRef.current.startTime = clock.getElapsedTime();
    }
    const elapsed = clock.getElapsedTime() - animRef.current.startTime;
    const p = Math.min(elapsed / ANIM_DURATION, 1);
    setAnimProgress(p);
    if (p >= 1) {
      animRef.current.running = false;
    }
  });

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

  const easedProgress = easeOutCubic(animProgress);

  return (
    <Instances limit={buildings.length} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial />
      {buildings.map(b => {
        const currentHeight = Math.max(0.01, b.height * easedProgress);
        return (
          <Instance
            key={b.nodeId}
            position={[b.x, currentHeight / 2, b.z]}
            scale={[b.width, currentHeight, b.depth]}
            color={b.nodeId === hoveredNodeId ? brighten(b.colorHex) : toHexString(b.colorHex)}
            onPointerMove={(e: ThreeEvent<PointerEvent>) => handlePointerMove(e, b.nodeId)}
            onPointerLeave={handlePointerLeave}
            onClick={(e: ThreeEvent<MouseEvent>) => handleClick(e, b.nodeId)}
          />
        );
      })}
    </Instances>
  );
}
