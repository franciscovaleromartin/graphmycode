import { useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { type ThreeEvent } from '@react-three/fiber';
import type { CityBuilding } from '../../lib/city-layout';

interface Props {
  buildings: CityBuilding[];
  onHover: (nodeId: string | null) => void;
  onClick: (nodeId: string) => void;
  hoveredNodeId: string | null;
}

const BOX_GEO = new THREE.BoxGeometry(1, 1, 1);
const MAT = new THREE.MeshStandardMaterial({ vertexColors: true });
const dummy = new THREE.Object3D();

export function CityBuildings({ buildings, onHover, onClick, hoveredNodeId }: Props) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || buildings.length === 0) return;

    const color = new THREE.Color();
    const white = new THREE.Color(0xffffff);

    buildings.forEach((b, i) => {
      dummy.position.set(b.x, b.height / 2, b.z);
      dummy.scale.set(b.width, b.height, b.depth);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

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
      args={[BOX_GEO, MAT, buildings.length]}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onClick={handleClick}
      castShadow={false}
    />
  );
}
