import { useRef, useLayoutEffect, useCallback } from 'react';
import * as THREE from 'three';
import { type ThreeEvent } from '@react-three/fiber';
import type { CityBuilding } from '../../lib/city-layout';

interface Props {
  buildings: CityBuilding[];
  onHover: (nodeId: string | null) => void;
  onClick: (nodeId: string) => void;
  hoveredNodeId: string | null;
}

export function CityBuildings({ buildings, onHover, onClick, hoveredNodeId }: Props) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useRef(new THREE.Object3D());

  // useLayoutEffect garantiza que las matrices se setean ANTES del primer frame
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || buildings.length === 0) return;

    const color = new THREE.Color();
    const white = new THREE.Color(0xffffff);

    buildings.forEach((b, i) => {
      dummy.current.position.set(b.x, b.height / 2, b.z);
      dummy.current.scale.set(b.width, b.height, b.depth);
      dummy.current.updateMatrix();
      mesh.setMatrixAt(i, dummy.current.matrix);

      if (b.nodeId === hoveredNodeId) {
        color.setHex(b.colorHex);
        color.lerp(white, 0.5);
      } else {
        color.setHex(b.colorHex);
      }
      mesh.setColorAt(i, color);
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [buildings, hoveredNodeId]);

  const handlePointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      if (e.instanceId !== undefined) {
        onHover(buildings[e.instanceId]?.nodeId ?? null);
      }
    },
    [buildings, onHover],
  );

  const handlePointerLeave = useCallback(() => {
    onHover(null);
  }, [onHover]);

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (e.instanceId !== undefined) {
        const nodeId = buildings[e.instanceId]?.nodeId;
        if (nodeId) onClick(nodeId);
      }
    },
    [buildings, onClick],
  );

  if (buildings.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, buildings.length]}
      frustumCulled={false}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onClick={handleClick}
      castShadow={false}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial vertexColors />
    </instancedMesh>
  );
}
